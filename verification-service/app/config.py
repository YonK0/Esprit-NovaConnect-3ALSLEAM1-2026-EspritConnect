"""Runtime configuration loaded from env vars.

Defaults are tuned for local docker-compose dev. Production overrides
should set VERIFICATION_SHARED_SECRET to a 64-char random string.
"""
from functools import lru_cache
from typing import List

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Auth: every internal endpoint requires this header.
    shared_secret: str = Field(
        default="dev_secret_change_me",
        alias="VERIFICATION_SHARED_SECRET",
    )

    # File constraints (matched 1:1 with Spring-side application.yml)
    max_file_size_bytes: int = 5 * 1024 * 1024     # 5 MB
    min_image_width: int = 800
    min_image_height: int = 600
    allowed_mime_types: List[str] = [
        "image/jpeg",
        "image/png",
        "image/webp",
        "application/pdf",
    ]

    # Face recognition thresholds. Relaxed to make enrolment easier on
    # phone cameras and in poor/uneven lighting (higher distance threshold =
    # more permissive match; only 1 of the 3 live frames needs to match).
    # Trade-off: a slightly higher false-accept rate, accepted here because
    # an admin still reviews every account before activation.
    face_distance_threshold: float = 0.62
    min_frames_passing: int = 1                # at least 1 of 3 frames must match
    max_retries: int = 3

    # Liveness — lowered so smaller, natural movements still register as
    # "live" when the webcam image is dim or low-contrast.
    blink_ear_delta_threshold: float = 0.06    # eye-aspect-ratio delta between frames
    yaw_delta_threshold_deg: float = 6.0       # head-turn between frames

    # OCR
    tesseract_languages: str = "ara+fra+eng"

    # Name matching
    name_match_strong: float = 0.65            # auto-accept above this (lowered from 0.85 for OCR tolerance)
    name_match_weak: float = 0.40              # auto-reject below this; in between → borderline


@lru_cache
def settings() -> Settings:
    return Settings()
