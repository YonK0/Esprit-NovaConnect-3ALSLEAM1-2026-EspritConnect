"""Face + liveness verification given a base64 ID face and 3 live frames."""
from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status

from ..config import settings
from ..models.schemas import FaceVerifyResponse
from ..security import require_internal_secret
from ..services import face_service, liveness_service
from ..utils import image_utils


router = APIRouter(
    prefix="/verify",
    tags=["verify"],
    dependencies=[Depends(require_internal_secret)],
)


@router.post("/face", response_model=FaceVerifyResponse)
async def verify_face(
    id_face_b64: str = Form(...),
    frame1: UploadFile = File(...),
    frame2: UploadFile = File(...),
    frame3: UploadFile = File(...),
) -> FaceVerifyResponse:
    # Decode the ID face once. If this fails the caller didn't go through
    # /verify/document first — that's a usage error.
    try:
        id_rgb = face_service.decode_face_b64(id_face_b64)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid id_face_b64: {e}")

    # Old / B&W / low-resolution IDs need a more permissive distance
    # threshold — face_recognition's encodings drift on desaturated or
    # aged photos even when the underlying geometry still matches.
    quality = face_service.is_low_quality_reference(id_rgb)
    base_threshold = settings().face_distance_threshold
    relaxed = quality.is_low_resolution or quality.is_low_saturation
    threshold = base_threshold + (0.08 if relaxed else 0.0)

    # Multi-encoding reference: encode the ID face from the raw, the
    # contrast-enhanced, and the grayscale-as-RGB views. Each frame is
    # then compared against ALL three references and the closest distance
    # wins. This is the key change that rescues B&W and old photos.
    references = face_service.encode_reference(id_rgb)
    if not references:
        raise HTTPException(
            status_code=422,
            detail="Could not extract a face encoding from the ID. Re-upload a clearer photo.",
        )

    frames_rgb = []
    candidate_encodings = []
    for frame in (frame1, frame2, frame3):
        raw = await frame.read()
        if len(raw) > settings().max_file_size_bytes:
            raise HTTPException(status_code=413, detail=f"{frame.filename} too large")
        try:
            img = image_utils.load_pil_from_bytes(raw, frame.content_type or "image/jpeg")
        except image_utils.ImageValidationError as e:
            raise HTTPException(status_code=422, detail=str(e))
        rgb = image_utils.pil_to_rgb_ndarray(img)
        frames_rgb.append(rgb)
        encoding = face_service.encode(rgb)
        if encoding is None:
            raise HTTPException(
                status_code=422,
                detail=f"No face detected in {frame.filename or 'one of the frames'}",
            )
        candidate_encodings.append(encoding)

    matches, passing = face_service.compare_many_references(
        references, candidate_encodings, threshold=threshold,
    )
    face_match = passing >= settings().min_frames_passing
    similarity = sum(m.similarity for m in matches) / len(matches)

    liveness = liveness_service.check(frames_rgb)

    reasons: List[str] = []
    if not face_match:
        reasons.append(
            f"Only {passing}/{len(matches)} frames matched the ID face — need ≥ {settings().min_frames_passing}."
        )
    if relaxed:
        reasons.append(
            f"ID image quality is low (saturation={quality.saturation:.2f}, "
            f"low_res={quality.is_low_resolution}); threshold was relaxed by 0.05."
        )
    if not liveness.passed:
        reasons.append(f"Liveness: {liveness.reason}")

    return FaceVerifyResponse(
        face_match=face_match,
        similarity=round(similarity, 4),
        frames_passing=passing,
        liveness_passed=liveness.passed,
        liveness_score=liveness.score,
        reasons=reasons,
    )
