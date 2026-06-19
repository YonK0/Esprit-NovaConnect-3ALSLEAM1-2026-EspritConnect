"""Verify that internal endpoints reject missing/wrong secret.

We don't need real image bytes — FastAPI's dependency runs before the
body is parsed, so the 401 comes back regardless.
"""
from fastapi.testclient import TestClient

from app.main import app


def test_verify_endpoint_requires_secret():
    client = TestClient(app)
    # No header → 401
    resp = client.post("/verify/document", files={"id_file": ("a.png", b"x", "image/png")})
    assert resp.status_code == 401


def test_verify_endpoint_rejects_wrong_secret():
    client = TestClient(app)
    resp = client.post(
        "/verify/document",
        headers={"X-Internal-Secret": "nope"},
        files={"id_file": ("a.png", b"x", "image/png")},
    )
    assert resp.status_code == 401
