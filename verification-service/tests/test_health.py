"""Smoke test for the /health endpoint.

Uses FastAPI's TestClient so it runs without spinning up uvicorn.
This will fail at import time if any module is broken — which is the
point: it's the cheapest integration signal we get.
"""
from fastapi.testclient import TestClient

from app.main import app


def test_health_endpoint_returns_ok():
    client = TestClient(app)
    resp = client.get("/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert "ara" in body["ocr_languages"]
