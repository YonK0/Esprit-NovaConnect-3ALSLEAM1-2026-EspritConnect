"""Tesseract OCR wrapper with preprocessing for low-quality ID photos.

Phase 1 improvements (over the original line-scoring heuristic):

- `extract_text()` now runs Tesseract twice, once on the original RGB image
  and once on a preprocessed grayscale version (contrast-stretched +
  upscaled when small). The two outputs are concatenated. This roughly
  doubles recall on phone-camera photos of laminated ID cards where the
  raw image confuses Tesseract with reflections and low contrast.

- A second pass uses Tesseract PSM 6 ("uniform block of text") in addition
  to the default PSM 3 ("auto layout"). Diplomas with multi-column footer
  signatures are PSM-3-hostile; PSM 6 catches them.

- Phase 2 (Arabic-focus): we also run a dedicated Arabic-only pass on a
  binarized (Otsu) copy of the image. Mixing scripts in a single Tesseract
  invocation (`ara+fra+eng`) tends to confuse the layout analyser and lose
  Arabic glyphs that have similar pixel signatures to Latin diacritics —
  the dedicated `ara` pass on a high-contrast binarized image recovers
  them.

- The `extract_candidate_name` heuristic is retained for legacy callers
  but the orchestrator now uses `name_service.verify_in_text` directly on
  the raw OCR output, which is far more reliable.
"""
from __future__ import annotations

import re
from typing import Optional

import Levenshtein
import numpy as np
import pytesseract
from PIL import Image, ImageEnhance, ImageOps, ImageFilter

from ..config import settings
from ..utils.language_utils import normalize_arabic, to_ascii_lower


# Tesseract page-segmentation modes we try. Each one catches a different
# document layout: 3 = auto, 6 = single uniform block, 11 = sparse text.
_PSM_MODES = (3, 6, 11)


def _preprocess(img: Image.Image) -> Image.Image:
    """Return a preprocessed copy of the image suited for OCR.

    - Convert to grayscale (Tesseract handles this internally but doing it
      ourselves lets us apply contrast normalization deterministically).
    - Auto-contrast: stretch the histogram so the darkest pixel becomes
      black and the lightest becomes white. Massive recall win on
      under-exposed phone photos.
    - Upscale to at least 1600 px wide. Tesseract works best on text that
      is 20–40 px tall; phone photos of small ID text are often below that.
    """
    gray = ImageOps.grayscale(img)
    gray = ImageOps.autocontrast(gray, cutoff=1)
    enhancer = ImageEnhance.Sharpness(gray)
    gray = enhancer.enhance(1.5)

    w, h = gray.size
    if w < 1600:
        scale = 1600 / w
        gray = gray.resize((int(w * scale), int(h * scale)), Image.LANCZOS)
    return gray


def _binarized_for_arabic(img: Image.Image) -> Image.Image:
    """Binarize via Otsu-equivalent thresholding on a heavily-sharpened
    grayscale copy. Arabic glyphs benefit from a clean black-on-white
    image because Tesseract's Arabic model was trained on print-quality
    inputs — phone-camera shadows and reflections create artefacts that
    look like glyphs and trash the layout analysis.
    """
    gray = ImageOps.grayscale(img)
    gray = ImageOps.autocontrast(gray, cutoff=2)
    gray = gray.filter(ImageFilter.MedianFilter(3))     # denoise small specks
    arr = np.array(gray, dtype=np.uint8)
    # Otsu threshold — picks the value minimising intra-class variance.
    hist = np.bincount(arr.ravel(), minlength=256).astype(np.float64)
    total = arr.size
    sum_total = np.dot(np.arange(256), hist)
    weight_bg, sum_bg, max_var, threshold = 0.0, 0.0, 0.0, 127
    for t in range(256):
        weight_bg += hist[t]
        if weight_bg == 0 or weight_bg == total:
            continue
        weight_fg = total - weight_bg
        sum_bg += t * hist[t]
        mean_bg = sum_bg / weight_bg
        mean_fg = (sum_total - sum_bg) / weight_fg
        var = weight_bg * weight_fg * (mean_bg - mean_fg) ** 2
        if var > max_var:
            max_var = var
            threshold = t
    binary = (arr > threshold).astype(np.uint8) * 255
    out = Image.fromarray(binary, mode="L")
    w, h = out.size
    if w < 1600:
        scale = 1600 / w
        out = out.resize((int(w * scale), int(h * scale)), Image.LANCZOS)
    return out


def extract_text(img: Image.Image) -> str:
    """Run Tesseract on the original AND a preprocessed copy, both with
    multiple PSM modes; return the concatenated text.

    A third pass runs Arabic-only on a binarized copy — see
    `_binarized_for_arabic`. Concatenation (rather than picking the
    longest) is intentional: the downstream `name_service.verify_in_text`
    searches across all tokens, so duplicated content costs nothing and
    the extra coverage rescues phone photos where one pass misses the
    name and another catches it.
    """
    langs = settings().tesseract_languages
    chunks: list[str] = []

    for image in (img, _preprocess(img)):
        for psm in _PSM_MODES:
            config = f"--psm {psm}"
            try:
                chunks.append(pytesseract.image_to_string(image, lang=langs, config=config))
            except pytesseract.TesseractError:
                # A single PSM failure shouldn't kill the whole pipeline.
                continue

    # Dedicated Arabic-only pass on a binarized copy. Improves recall on
    # Arabic-only IDs (Tunisian CIN reverse side, Arabic-script degrees).
    # Wrapped in a try/except because the `ara` language pack may not be
    # installed on every deployment — we don't want to break Latin OCR
    # in that case.
    if "ara" in langs:
        try:
            arabic_img = _binarized_for_arabic(img)
            for psm in (6, 11):
                chunks.append(pytesseract.image_to_string(
                    arabic_img, lang="ara", config=f"--psm {psm}"))
        except (pytesseract.TesseractError, OSError):
            pass

    return "\n".join(chunks)


def _name_score(line: str, tokens: list[str]) -> float:
    """Score how likely this line is a person's name (higher = more likely)."""
    score = 0.0
    if len(tokens) == 2:
        score += 3.0
    elif len(tokens) == 3:
        score += 2.0
    else:
        score += 0.5
    score += sum(0.5 for t in tokens if t.isalpha())
    score -= len(line) * 0.02
    return score


def extract_candidate_name(text: str, declared_name: str | None = None) -> Optional[str]:
    """Best-effort heuristic name extractor — kept for legacy callers.

    The orchestrator now anchors on `name_service.verify_in_text` and does
    not need this function for the verification verdict. It is still useful
    for debug output and for the `name_on_id` / `name_on_secondary` fields
    in the API response, which let admins eyeball "what did the OCR see".
    """
    candidates: list[str] = []
    for raw in text.splitlines():
        line = normalize_arabic(raw).strip()
        if not line:
            continue
        if any(ch.isdigit() for ch in line):
            continue
        tokens = line.split()
        if not (2 <= len(tokens) <= 5):
            continue
        if any(len(t) < 2 for t in tokens):
            continue
        if line.lower().rstrip(":").endswith(("nom", "name", "prenom", "prénom")):
            continue
        if any(re.search(r"[^\w\-]", t) for t in tokens):
            continue
        if all(t == t.upper() for t in tokens if t.isalpha()):
            continue
        candidates.append(line)

    if not candidates:
        return None

    if declared_name:
        ref = to_ascii_lower(declared_name)
        best = max(candidates, key=lambda c: Levenshtein.ratio(to_ascii_lower(c), ref))
        if Levenshtein.ratio(to_ascii_lower(best), ref) >= 0.4:
            return best

    return max(candidates, key=lambda c: _name_score(c, c.split()))
