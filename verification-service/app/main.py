"""FastAPI entrypoint.

The service is internal-only. /health is the one public endpoint so
docker-compose healthchecks work without sharing the secret.
"""
from __future__ import annotations

import logging

from fastapi import FastAPI

from .config import settings
from .models.schemas import HealthResponse
from .routers import face, ocr, verify

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s :: %(message)s",
)
log = logging.getLogger("verification-service")

app = FastAPI(
    title="EspritConnect Verification Service",
    description="Internal microservice for OCR + face recognition + liveness.",
    version="0.1.0",
)

app.include_router(ocr.router)
app.include_router(face.router)
app.include_router(verify.router)


@app.get("/health", response_model=HealthResponse, tags=["meta"])
def health() -> HealthResponse:
    return HealthResponse(
        status="ok",
        ocr_languages=settings().tesseract_languages,
    )


@app.on_event("startup")
async def _startup() -> None:
    if settings().shared_secret == "dev_secret_change_me":
        log.warning(
            "VERIFICATION_SHARED_SECRET not set — using insecure default. "
            "Set this env var in production."
        )
