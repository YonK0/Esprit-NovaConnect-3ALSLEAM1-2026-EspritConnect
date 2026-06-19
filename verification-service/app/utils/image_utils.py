"""Image normalization helpers.

Goals:
- Strip EXIF (so portrait-shot phones don't OCR upside-down)
- Respect EXIF orientation before stripping
- Reject too-small images early (cheaper than running OCR + face on garbage)
- Convert PDF first-page → image once at the boundary, never further
- Normalize to OpenCV BGR ndarray for cv2/dlib code paths
"""
from __future__ import annotations

import io
from typing import Tuple

import numpy as np
from PIL import Image, ImageOps, UnidentifiedImageError

from ..config import settings


class ImageValidationError(ValueError):
    pass


def load_pil_from_bytes(raw: bytes, mime: str | None) -> Image.Image:
    """Return a PIL.Image, EXIF-rotated, RGB, with metadata stripped.

    Supports the four MIME types accepted by the Spring side: jpeg, png, webp,
    pdf. For PDFs we render only the first page using pdf2image if available;
    fall back to a clear error otherwise.
    """
    if mime not in settings().allowed_mime_types:
        raise ImageValidationError(f"Unsupported mime type: {mime}")

    if mime == "application/pdf":
        return _pdf_first_page_to_pil(raw)

    try:
        img = Image.open(io.BytesIO(raw))
    except UnidentifiedImageError as e:
        raise ImageValidationError("File is not a valid image") from e

    img = ImageOps.exif_transpose(img)        # honour orientation
    if img.mode != "RGB":
        img = img.convert("RGB")

    # Strip EXIF by re-encoding into a clean buffer
    clean = io.BytesIO()
    img.save(clean, format="PNG")
    clean.seek(0)
    img = Image.open(clean).convert("RGB")
    return img


def assert_min_resolution(img: Image.Image) -> None:
    w, h = img.size
    if w < settings().min_image_width or h < settings().min_image_height:
        raise ImageValidationError(
            f"Image too small: {w}x{h} (need ≥ "
            f"{settings().min_image_width}x{settings().min_image_height})"
        )


def pil_to_bgr_ndarray(img: Image.Image) -> np.ndarray:
    """OpenCV uses BGR; face_recognition uses RGB ndarray. Return BGR here and
    convert at the boundary where face_recognition is actually called."""
    arr = np.array(img)
    # PIL gives RGB; convert to BGR for OpenCV consumers
    return arr[:, :, ::-1].copy()


def pil_to_rgb_ndarray(img: Image.Image) -> np.ndarray:
    return np.array(img)


def size_bytes(raw: bytes) -> int:
    return len(raw)


def _pdf_first_page_to_pil(raw: bytes) -> Image.Image:
    """Convert the first PDF page to a PIL image.

    pdf2image is an optional dependency to keep the Docker image lean. If it
    is not installed at runtime, raise a clear error rather than pretending
    a PDF was processed.
    """
    try:
        from pdf2image import convert_from_bytes  # type: ignore[import-not-found]
    except ImportError as e:
        raise ImageValidationError(
            "PDF upload not supported in this build (pdf2image missing). "
            "Please upload a JPG, PNG or WEBP instead."
        ) from e

    pages = convert_from_bytes(raw, dpi=200, first_page=1, last_page=1)
    if not pages:
        raise ImageValidationError("Could not render the PDF")
    return pages[0].convert("RGB")


def dimensions(img: Image.Image) -> Tuple[int, int]:
    return img.size
