# EspritConnect Verification Service

Internal-only Python microservice for the role-verification flow. Wraps
**Tesseract** (OCR in Arabic + French + English), **face_recognition** (dlib
embeddings + comparison), and a cheap **liveness** check (blink + head turn
across captured frames).

> **Phase 0 scope** — this service runs standalone. The Spring backend and
> Angular wizard that consume it are not built yet. Ollama cross-check is
> deferred: name matching here is pure rule-based.

## Endpoints

All endpoints except `/health` require `X-Internal-Secret: <secret>`.

| Method | Path | Purpose |
|---|---|---|
| GET  | `/health`         | Liveness probe (no auth) |
| POST | `/verify/document`| OCR + name match + ID-face crop |
| POST | `/verify/face`    | Compare 3 live frames to the ID face + liveness |
| POST | `/verify/full`    | Do it all in one shot |

## Run alone

```bash
# from the repo root
docker compose up --build verification-service
# then
curl http://localhost:8000/health
```

First build compiles dlib — **5–10 minutes** is normal on the first build.
Subsequent builds reuse the layer.

## Tests

```bash
cd verification-service
pip install -r requirements.txt
pytest -q
```

`test_name_service.py` and `test_language_utils.py` are pure-Python and run
anywhere. `test_health.py` and `test_security.py` use FastAPI's TestClient
and will load every router, so they catch import-level breakage. The
heavyweight OCR/face tests will live alongside real fixtures in
`tests/fixtures/` — drop sample JPGs there as they become available.

## Configuration

Everything is environment-driven via `app/config.py`:

| Env var | Default | Notes |
|---|---|---|
| `VERIFICATION_SHARED_SECRET` | `dev_secret_change_me` | **Must** be overridden in prod |
| `tesseract_languages` | `ara+fra+eng` | Comma+plus list per Tesseract convention |
| `face_distance_threshold` | `0.6` | Lower = stricter |
| `min_frames_passing` | `2` | of 3 frames |
| `blink_ear_delta_threshold` | `0.10` | EAR delta across captured frames |
| `max_file_size_bytes` | `5_242_880` | 5 MB |

## Known limits / honest disclosure

- **Liveness is weak.** EAR + yaw proxies stop trivial photo attacks. A
  serious attacker with a video replay will get through. Strong liveness
  needs depth/IR sensors or active challenges (turn left, smile, etc.) —
  not in scope for Phase 0.
- **OCR name extraction is heuristic.** It picks the longest letters-only
  line with 2–5 tokens. ID layouts vary; a smarter MRZ parser is a Phase 2
  upgrade. Pass `declared_name` in the request to anchor matching to what
  the user typed at signup.
- **No PDF support unless `pdf2image` is installed.** The Dockerfile
  doesn't install it by default to keep the image small. Add it to
  `requirements.txt` if you need it.
- **Face embeddings are 128-d dlib vectors.** The Spring side is expected
  to persist these on the User entity, not the raw face crop.

## What the Spring side will need next session

1. A `VerificationClient` (WebClient) that adds the `X-Internal-Secret`
   header and posts multipart bodies to these endpoints.
2. A `VerificationOrchestrator` that:
   - validates email/role per the business rules,
   - calls `/verify/document` then `/verify/face` (or `/verify/full`),
   - persists a `verification_attempts` row at each step,
   - flips `User.status` between `DRAFT → VERIFYING → PENDING_APPROVAL`
     (or `VERIFICATION_FAILED`).
3. A small admin moderation tab that surfaces the attempts to admins.
