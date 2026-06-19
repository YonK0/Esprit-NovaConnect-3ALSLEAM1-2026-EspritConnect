from typing import List, Optional

from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    status: str = "ok"
    ocr_languages: str
    face_engine: str = "face_recognition (dlib)"


class DocumentVerifyResponse(BaseModel):
    id_text: str
    secondary_text: Optional[str] = None
    name_on_id: Optional[str] = None
    name_on_secondary: Optional[str] = None
    name_match: bool = False
    name_match_score: float = 0.0
    # base64 PNG of the face cropped out of the ID, used as input to /verify/face
    id_face_b64: Optional[str] = None


class FaceVerifyResponse(BaseModel):
    face_match: bool
    similarity: float            # 1 - face_recognition distance, mapped to [0, 1]
    frames_passing: int
    liveness_passed: bool
    liveness_score: float
    reasons: List[str] = Field(default_factory=list)


class FullVerifyResponse(BaseModel):
    name_match: bool
    name_match_score: float
    face_match: bool
    face_similarity: float
    liveness_passed: bool
    verdict: str                 # "PASS" | "FAIL"
    reasons: List[str] = Field(default_factory=list)
