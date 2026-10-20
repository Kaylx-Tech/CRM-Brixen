FROM python:3.12-slim

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        tesseract-ocr \
        tesseract-ocr-eng \
        libglib2.0-0 \
        libsm6 \
        libxext6 \
        libxrender1 \
        libjpeg62-turbo \
        libpng16-16 \
        curl \
        sqlite3 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Modular application
COPY config.py db.py main.py tenancy.py schema.sql ./
COPY middleware/ middleware/
COPY routes/ routes/
COPY services/ services/
COPY utils/ utils/
COPY database/ database/

# Maintenance scripts (e.g. scripts/drive_sync.py) — run via the Coolify terminal
COPY scripts/ scripts/

# Static assets (optional; create empty dir if repo has none)
COPY static/ static/

RUN mkdir -p /app/data /app/storage /app/storage/clients /app/seed

COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

ENV HOST=0.0.0.0
ENV PORT=5050
ENV CRM_ENV=production
ENV DATABASE_URL=/app/data/hypetex.db
ENV STORAGE_PATH=/app/storage
ENV DEV_AUTH_BYPASS=0
ENV COOKIE_SECURE=true
ENV PYTHONUNBUFFERED=1

EXPOSE 5050

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -f http://127.0.0.1:${PORT:-5050}/api/health || exit 1

ENTRYPOINT ["/app/docker-entrypoint.sh"]
