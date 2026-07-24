FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# System libs needed by chromadb (onnxruntime), python-docx, etc.
RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential libgomp1 curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN pip install --upgrade pip && pip install -r requirements.txt

COPY . .

EXPOSE 8000

# Render (and most PaaS) inject $PORT and route to it — bind that, not a fixed
# port. Default to 8000 for plain `docker run`. `exec` so uvicorn becomes the
# main process and receives SIGTERM for graceful shutdown.
HEALTHCHECK --interval=20s --timeout=5s --retries=5 \
    CMD curl -fsS "http://localhost:${PORT:-8000}/healthz" || exit 1

CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
