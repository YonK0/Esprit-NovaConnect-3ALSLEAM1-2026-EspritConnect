"""face_recognition (dlib) wrapper with multi-strategy detection.

Phase 1 improvements (over the original "HOG-only single-shot" approach):

- Detection tries multiple strategies in order of cost:
    1. HOG with default upsampling (fast, works on well-lit phone shots).
    2. HOG with upsample=2 (catches small faces — e.g. distant ID portrait).
    3. CNN (slow, GPU-friendly, much better recall on tilted / partial faces).
    4. HOG on a CLAHE-enhanced grayscale-RGB (rescues low-contrast photos).
    5. HOG on 90°/180°/270° rotated copies (rescues sideways uploads).

  We return as soon as any strategy finds a face. Worst case (no face at
  all) we run all five before giving up.

- Encoding uses num_jitters=3, which averages the encoding over 3 small
  random transforms. This improves cross-image robustness — the same person
  shot under different lighting / angles produces encodings that cluster
  more tightly. The cost is ~3x encoding time, which is still well under
  one second per frame.

Phase 2 (old / B&W / low-contrast IDs):

- `encode_reference()` is a new entry-point for the ID-side encoding. It
  runs `encode()` three times against three preprocessed views of the
  reference image — the raw RGB, a CLAHE-equalized RGB, and a
  histogram-matched grayscale-as-RGB. The frames are then compared against
  ALL three encodings and we keep the BEST distance per frame. This is the
  biggest single win against B&W or sun-faded ID photos: when the colour
  encoding is misled by the desaturated palette, the grayscale-matched
  encoding picks up the geometry; whichever side scores better wins.

- `is_low_quality_reference()` reports whether the reference looks
  black-and-white, has low resolution, or low colour saturation. The
  caller (orchestrator) uses this to relax the distance threshold by
  +0.05 — empirically the difference between a 1990s passport-style
  photo and a 2024 selfie sits in that band on face_recognition's
  euclidean metric.

- `compare()` reports both face_recognition's raw distance AND a calibrated
  similarity score in [0, 1] designed to be the inverse of the distance —
  this is what the Spring side surfaces to admins in the audit chain.
"""
from __future__ import annotations

import base64
import io
from dataclasses import dataclass
from typing import Iterable, List, Optional, Tuple

import face_recognition  # type: ignore[import-untyped]
import numpy as np
from PIL import Image, ImageEnhance, ImageOps


@dataclass(frozen=True)
class FaceMatch:
    distance: float          # face_recognition distance, lower is more similar
    similarity: float        # 1 - clamp(distance, 0, 1), reported to clients
    passed: bool             # caller decides using config threshold


@dataclass(frozen=True)
class ReferenceQuality:
    """Diagnostics on the ID-side face used to decide whether to relax
    matching thresholds. Threshold relaxation is reported back to admins
    in the verification audit log so they can see *why* a match was
    treated leniently."""
    is_low_resolution: bool   # < 200 px tall after cropping
    is_low_saturation: bool   # mean saturation < 0.18 — proxy for B&W / faded
    saturation: float


def _enhanced(rgb: np.ndarray) -> np.ndarray:
    """Auto-contrast + sharpen — rescues low-contrast / over-exposed photos."""
    pil = Image.fromarray(rgb)
    enhanced = ImageOps.autocontrast(pil.convert("L"), cutoff=2).convert("RGB")
    enhanced = ImageEnhance.Contrast(enhanced).enhance(1.4)
    return np.array(enhanced)


def _grayscale_as_rgb(rgb: np.ndarray) -> np.ndarray:
    """Grayscale → 3-channel (face_recognition expects 3 channels)."""
    pil = Image.fromarray(rgb).convert("L")
    pil = ImageOps.autocontrast(pil, cutoff=2)
    return np.array(pil.convert("RGB"))


def _rotated(rgb: np.ndarray, angle: int) -> np.ndarray:
    return np.array(Image.fromarray(rgb).rotate(angle, expand=True))


# Each strategy is (label, view-producer, locator). The locator is called
# with `view` and returns the list of face boxes in that view's coords.
def _hog(view: np.ndarray) -> list[tuple[int, int, int, int]]:
    return face_recognition.face_locations(view, model="hog")


def _hog_up2(view: np.ndarray) -> list[tuple[int, int, int, int]]:
    return face_recognition.face_locations(view, number_of_times_to_upsample=2, model="hog")


def _cnn(view: np.ndarray) -> list[tuple[int, int, int, int]]:
    try:
        return face_recognition.face_locations(view, model="cnn")
    except RuntimeError:
        return []   # CNN model not bundled in this dlib build


_STRATEGIES: tuple[tuple[str, callable, callable], ...] = (
    ("hog",          lambda rgb: rgb,              _hog),
    ("hog_upsample", lambda rgb: rgb,              _hog_up2),
    ("cnn",          lambda rgb: rgb,              _cnn),
    ("hog_enhanced", _enhanced,                    _hog),
    ("hog_rot90",    lambda rgb: _rotated(rgb,90), _hog),
    ("hog_rot180",   lambda rgb: _rotated(rgb,180),_hog),
    ("hog_rot270",   lambda rgb: _rotated(rgb,270),_hog),
)


def _locate_with_fallback(
    rgb: np.ndarray,
) -> tuple[Optional[np.ndarray], Optional[list[tuple[int, int, int, int]]]]:
    """Try detection strategies until one finds a face.

    Returns (view_used, locations). `view_used` may be a rotated/enhanced
    copy of the input — the caller must encode from THAT array, not the
    original — otherwise the box coordinates won't line up.
    """
    for _label, make_view, locate in _STRATEGIES:
        view = make_view(rgb)
        locs = locate(view)
        if locs:
            # Largest face first — heuristic against tiny background faces.
            locs.sort(key=lambda b: (b[2] - b[0]) * (b[1] - b[3]), reverse=True)
            return view, locs
    return None, None


def encode(rgb_ndarray: np.ndarray) -> Optional[np.ndarray]:
    """Return the 128-d encoding of the largest detected face, or None.

    Falls through HOG → CNN → enhanced → rotated as needed. Uses
    num_jitters=3 for a more stable encoding than the single-shot default.
    """
    view, locations = _locate_with_fallback(rgb_ndarray)
    if view is None or not locations:
        return None
    encodings = face_recognition.face_encodings(
        view, known_face_locations=locations[:1], num_jitters=3, model="small"
    )
    return encodings[0] if encodings else None


def encode_reference(rgb_ndarray: np.ndarray) -> list[np.ndarray]:
    """Return *up to three* encodings of the ID-side face, computed from
    differently-preprocessed views.

    Use this for the ID reference. The caller compares each live frame
    against ALL returned encodings and keeps the best distance per
    frame — this rescues old / faded / B&W IDs where any single
    encoding may drift from the modern selfie.

    The returned list always has at least one encoding when a face is
    found; an empty list means no face was detected by any preprocessing.
    """
    encodings: list[np.ndarray] = []
    seen_hashes: set[bytes] = set()

    for view_producer in (lambda rgb: rgb, _enhanced, _grayscale_as_rgb):
        view = view_producer(rgb_ndarray)
        enc = encode(view)
        if enc is None:
            continue
        # Skip near-duplicate encodings (same image already produced
        # essentially the same vector). Hash on rounded vector bytes.
        h = enc.round(3).tobytes()
        if h in seen_hashes:
            continue
        seen_hashes.add(h)
        encodings.append(enc)
    return encodings


def is_low_quality_reference(rgb_ndarray: np.ndarray) -> ReferenceQuality:
    """Inspect the ID image to decide whether to relax the match threshold.

    Heuristics:
      * Low resolution: image is small after EXIF-rotation. < 200 px on
        the short axis is the cutoff — phone-camera ID shots fall above
        this; old photo-of-a-photo shots fall below.
      * Low saturation: mean HSV S < 0.18 is "effectively grayscale".
        Even colour scans of 1990s laminated IDs end up here because the
        ink + lamination yellowing flattens chroma.
    """
    h, w = rgb_ndarray.shape[:2]
    short_side = min(h, w)

    # Compute mean saturation. Avoid an OpenCV dependency by doing the
    # RGB→HSV conversion in NumPy.
    rgb = rgb_ndarray.astype(np.float32) / 255.0
    mx = rgb.max(axis=-1)
    mn = rgb.min(axis=-1)
    saturation = np.where(mx == 0, 0.0, (mx - mn) / np.maximum(mx, 1e-6))
    mean_sat = float(saturation.mean())

    return ReferenceQuality(
        is_low_resolution=short_side < 200,
        is_low_saturation=mean_sat < 0.18,
        saturation=round(mean_sat, 4),
    )


def detect_face_b64(rgb_ndarray: np.ndarray) -> Optional[str]:
    """Detect the largest face and return a base64 PNG of the crop.

    The crop is taken from whichever `view` of the input actually produced
    the detection (e.g. a rotated copy), so the bounding box and the pixels
    line up.
    """
    view, locations = _locate_with_fallback(rgb_ndarray)
    if view is None or not locations:
        return None
    top, right, bottom, left = locations[0]

    h, w = view.shape[:2]
    pad_y = int((bottom - top) * 0.25)
    pad_x = int((right - left) * 0.25)
    top, bottom = max(0, top - pad_y), min(h, bottom + pad_y)
    left, right = max(0, left - pad_x), min(w, right + pad_x)

    crop = view[top:bottom, left:right]
    pil = Image.fromarray(crop)
    buf = io.BytesIO()
    pil.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode("ascii")


def decode_face_b64(b64: str) -> np.ndarray:
    raw = base64.b64decode(b64)
    return np.array(Image.open(io.BytesIO(raw)).convert("RGB"))


def compare(reference: np.ndarray, candidate: np.ndarray, threshold: float) -> FaceMatch:
    """Single-reference comparison. Kept for callers that only have one
    encoding; the orchestrator prefers `compare_against_many_references`."""
    distance = float(face_recognition.face_distance([reference], candidate)[0])
    similarity = max(0.0, 1.0 - min(distance, 1.0))
    return FaceMatch(distance=distance, similarity=similarity, passed=distance <= threshold)


def compare_against_many_references(
    references: list[np.ndarray],
    candidate: np.ndarray,
    threshold: float,
) -> FaceMatch:
    """Best-of-N: compare the candidate against every reference encoding
    and keep the closest distance.

    The "many references" are the differently-preprocessed encodings of
    the ID face produced by `encode_reference`. Taking the minimum is
    intentional — we want to accept the frame if ANY plausible reading
    of the ID matches it. This is what closes the gap on B&W / old /
    desaturated IDs."""
    if not references:
        return FaceMatch(distance=1.0, similarity=0.0, passed=False)
    distances = face_recognition.face_distance(references, candidate)
    distance = float(min(distances))
    similarity = max(0.0, 1.0 - min(distance, 1.0))
    return FaceMatch(distance=distance, similarity=similarity, passed=distance <= threshold)


def compare_many(reference: np.ndarray, candidates: Iterable[np.ndarray], threshold: float) -> Tuple[List[FaceMatch], int]:
    matches = [compare(reference, c, threshold) for c in candidates]
    passing = sum(1 for m in matches if m.passed)
    return matches, passing


def compare_many_references(
    references: list[np.ndarray],
    candidates: Iterable[np.ndarray],
    threshold: float,
) -> Tuple[List[FaceMatch], int]:
    """Like `compare_many` but compares each candidate against every
    reference encoding and keeps the best distance. Use this when the
    references list was produced by `encode_reference`."""
    matches = [compare_against_many_references(references, c, threshold) for c in candidates]
    passing = sum(1 for m in matches if m.passed)
    return matches, passing
