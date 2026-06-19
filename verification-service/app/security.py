"""Internal shared-secret auth for the verification microservice.

The Spring backend is the only intended caller. The service is not
exposed to the public internet in prod; this is defence-in-depth so a
mis-configured network or sidecar can't trivially exfiltrate documents.
"""
from fastapi import Header, HTTPException, status

from .config import settings


def require_internal_secret(x_internal_secret: str | None = Header(default=None)) -> None:
    expected = settings().shared_secret
    if not x_internal_secret or x_internal_secret != expected:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid X-Internal-Secret header",
        )
