"""Document OCR + name extraction.

Accepts up to 2 files (id_file required, secondary_file optional). Returns
the raw OCR text for each, the heuristic name guess on each, the name-match
verdict, and a base64 PNG of the face cropped from the ID — which the
caller passes back to /verify/face later.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status

from ..config import settings
from ..models.schemas import DocumentVerifyResponse
from ..security import require_internal_secret
from ..services import face_service, name_service, ocr_service
from ..utils import image_utils


router = APIRouter(
    prefix="/verify",
    tags=["verify"],
    dependencies=[Depends(require_internal_secret)],
)


@router.post("/document", response_model=DocumentVerifyResponse)
async def verify_document(
    id_file: UploadFile = File(..., description="Government ID (image or PDF)"),
    id_mime: str = Form(default=""),
    secondary_file: UploadFile | None = File(default=None),
    secondary_mime: str = Form(default=""),
    declared_name: str | None = Form(default=None),
) -> DocumentVerifyResponse:
    # Resolve mime types — Spring forwards them as form fields because
    # Content-Type on UploadFile is unreliable across HTTP clients.
    id_mime = id_mime or (id_file.content_type or "")
    secondary_mime = secondary_mime or (secondary_file.content_type if secondary_file else "") or ""

    id_bytes = await id_file.read()
    _assert_size(id_bytes, id_file.filename)

    try:
        id_img = image_utils.load_pil_from_bytes(id_bytes, id_mime)
        image_utils.assert_min_resolution(id_img)
    except image_utils.ImageValidationError as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e))

    id_text = ocr_service.extract_text(id_img)
    name_on_id = ocr_service.extract_candidate_name(id_text, declared_name) or declared_name

    id_rgb = image_utils.pil_to_rgb_ndarray(id_img)
    id_face_b64 = face_service.detect_face_b64(id_rgb)
    if id_face_b64 is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="No face detected on the ID document. Please re-upload a clearer photo.",
        )

    secondary_text: str | None = None
    name_on_secondary: str | None = None
    if secondary_file is not None:
        sec_bytes = await secondary_file.read()
        _assert_size(sec_bytes, secondary_file.filename)
        try:
            sec_img = image_utils.load_pil_from_bytes(sec_bytes, secondary_mime)
            image_utils.assert_min_resolution(sec_img)
        except image_utils.ImageValidationError as e:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e))
        secondary_text = ocr_service.extract_text(sec_img)
        name_on_secondary = ocr_service.extract_candidate_name(secondary_text, declared_name)

    # When the registrant provided a declared name, anchor the verification
    # on it: search for the name inside the OCR text of each document. This
    # is far more reliable than picking a "name-like line" and comparing two
    # fragile extractions — which fails on diplomas with signatory names
    # that score higher than the registrant's name on the line-picker.
    if declared_name:
        id_score = name_service.verify_in_text(
            declared_name, id_text, strong_threshold=settings().name_match_strong
        )
        if secondary_text is not None:
            sec_score = name_service.verify_in_text(
                declared_name, secondary_text, strong_threshold=settings().name_match_strong
            )
            score = min(id_score.score, sec_score.score)
            match = id_score.match and sec_score.match
            nm = name_service.NameMatchResult(
                score=round(score, 4), match=match,
                tokens_left=id_score.tokens_left, tokens_right=sec_score.tokens_left,
            )
        else:
            nm = id_score
    else:
        left = name_on_id or ""
        right = name_on_secondary or name_on_id or ""
        nm = name_service.compare(left, right, strong_threshold=settings().name_match_strong)

    return DocumentVerifyResponse(
        id_text=id_text,
        secondary_text=secondary_text,
        name_on_id=name_on_id,
        name_on_secondary=name_on_secondary,
        name_match=nm.match,
        name_match_score=nm.score,
        id_face_b64=id_face_b64,
    )


def _assert_size(raw: bytes, filename: str | None) -> None:
    if len(raw) > settings().max_file_size_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"{filename or 'file'} exceeds {settings().max_file_size_bytes} bytes",
        )
