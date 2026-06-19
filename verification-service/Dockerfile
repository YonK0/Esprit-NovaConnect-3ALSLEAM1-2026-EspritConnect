# syntax=docker/dockerfile:1.6
FROM python:3.11-slim

# System dependencies — kept to the minimum so the apt step stays fast.
# No compiler toolchain (dlib ships as a prebuilt wheel), and no X11/GL libs:
# opencv-python-headless only needs libglib2.0-0 (the headless build drops the
# GUI deps libGL/libSM/libXext/libXrender).
#  - libglib2.0-0: opencv-headless runtime
#  - tesseract + language packs: OCR for ara+fra+eng IDs/certificates
#  - curl: used by healthcheck
RUN apt-get update && apt-get install -y --no-install-recommends \
    libglib2.0-0 \
    tesseract-ocr tesseract-ocr-ara tesseract-ocr-fra tesseract-ocr-eng \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Layer dependencies first so iterating on app code doesn't reinstall them.
# face_recognition is installed --no-deps so it uses the prebuilt dlib-bin wheel
# (and face_recognition_models) instead of pulling the source `dlib` package.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt \
    && pip install --no-cache-dir --no-deps face_recognition==1.3.0

COPY app/ ./app/

EXPOSE 8000

# Healthcheck independent of docker-compose so `docker run` reports status too
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
    CMD curl -fsS http://localhost:8000/health || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
