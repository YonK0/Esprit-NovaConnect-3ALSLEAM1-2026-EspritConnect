"""Single-shot orchestrator: runs document + face + liveness in one call.

This is the path the Spring backend will use in production. The two
separate endpoints (/document, /face) remain so the Angular wizard can
do step-by-step UX with per-step feedback.
"""
from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status

from ..config import settings
from ..models.schemas import FullVerifyResponse
from ..security import require_internal_secret
from ..services import face_service, liveness_service, name_service, ocr_service
from ..utils import image_utils


router = APIRouter(
    prefix="/verify",
    tags=["verify"],
    dependencies=[Depends(require_internal_secret)],
)


@router.post("/full", response_model=FullVerifyResponse)
async def verify_full(
    id_file: UploadFile = File(...),
    secondary_file: UploadFile | None = File(default=None),
    frame1: UploadFile = File(...),
    frame2: UploadFile = File(...),
    frame3: UploadFile = File(...),
    id_mime: str = Form(default=""),
    secondary_mime: str = Form(default=""),
    declared_name: str | None = Form(default=None),
) -> FullVerifyResponse:
    id_mime = id_mime or (id_file.content_type or "")
    secondary_mime = secondary_mime or (secondary_file.content_type if secondary_file else "") or ""

    # ---- documents ----
    id_bytes = await id_file.read()
    if len(id_bytes) > settings().max_file_size_bytes:
        raise HTTPException(status_code=413, detail="ID file too large")
    try:
        id_img = image_utils.load_pil_from_bytes(id_bytes, id_mime)
        image_utils.assert_min_resolution(id_img)
    except image_utils.ImageValidationError as e:
        raise HTTPException(status_code=422, detail=str(e))

    id_text = ocr_service.extract_text(id_img)
    name_on_id = ocr_service.extract_candidate_name(id_text, declared_name) or declared_name

    id_rgb = image_utils.pil_to_rgb_ndarray(id_img)
    # Multi-encoding reference + quality-aware threshold for old/B&W IDs.
    quality = face_service.is_low_quality_reference(id_rgb)
    threshold = settings().face_distance_threshold + (
        0.05 if (quality.is_low_resolution or quality.is_low_saturation) else 0.0
    )
    references = face_service.encode_reference(id_rgb)
    if not references:
        raise HTTPException(status_code=422, detail="No face on the ID document")

    sec_text: str | None = None
    name_on_secondary: str | None = None
    if secondary_file is not None:
        sec_bytes = await secondary_file.read()
        if len(sec_bytes) > settings().max_file_size_bytes:
            raise HTTPException(status_code=413, detail="Secondary file too large")
        try:
            sec_img = image_utils.load_pil_from_bytes(sec_bytes, secondary_mime)
            image_utils.assert_min_resolution(sec_img)
        except image_utils.ImageValidationError as e:
            raise HTTPException(status_code=422, detail=str(e))
        sec_text = ocr_service.extract_text(sec_img)
        name_on_secondary = ocr_service.extract_candidate_name(sec_text, declared_name)

    # Name verification strategy:
    # - If we have a declared_name, search for it inside the OCR text of
    #   each document. Far more reliable than picking a candidate line and
    #   comparing two fragile extractions (which fails when a diploma has
    #   signatory names that out-score the registrant's name).
    # - Without a declared_name, fall back to the legacy two-side compare.
    if declared_name:
        id_score = name_service.verify_in_text(
            declared_name, id_text, strong_threshold=settings().name_match_strong
        )
        if sec_text is not None:
            sec_score = name_service.verify_in_text(
                declared_name, sec_text, strong_threshold=settings().name_match_strong
            )
            # Both documents must show the declared name. Use the WORSE of
            # the two as the reported score — a strong ID with a weak diploma
            # match should not pass.
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

    # ---- frames ----
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
        enc = face_service.encode(rgb)
        if enc is None:
            raise HTTPException(status_code=422, detail=f"No face in {frame.filename}")
        candidate_encodings.append(enc)

    matches, passing = face_service.compare_many_references(
        references, candidate_encodings, threshold=threshold,
    )
    face_match = passing >= settings().min_frames_passing
    face_similarity = sum(m.similarity for m in matches) / len(matches)

    liveness = liveness_service.check(frames_rgb)

    # ---- verdict ----
    reasons: List[str] = []
    if not nm.match:
        reasons.append(f"Name mismatch (score {nm.score})")
    if not face_match:
        reasons.append(f"Face match failed ({passing}/3 frames)")
    if not liveness.passed:
        reasons.append(f"Liveness failed: {liveness.reason}")
    verdict = "PASS" if (nm.match and face_match and liveness.passed) else "FAIL"

    return FullVerifyResponse(
        name_match=nm.match,
        name_match_score=nm.score,
        face_match=face_match,
        face_similarity=round(face_similarity, 4),
        liveness_passed=liveness.passed,
        verdict=verdict,
        reasons=reasons,
    )
