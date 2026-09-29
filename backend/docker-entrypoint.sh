#!/bin/bash
set -e

DB_FILE="${DATABASE_URL:-/app/data/hypetex.db}"
SEED_DB="/app/seed/hypetex.db"
STORAGE_DIR="${STORAGE_PATH:-/app/storage}"
mkdir -p "$(dirname "$DB_FILE")" "$STORAGE_DIR/clients" /app/seed

# First-run: optional seed DB baked into image (usually absent; volume preferred)
if [ ! -f "$DB_FILE" ] && [ -f "$SEED_DB" ]; then
    echo "[entrypoint] Seeding database from image seed..."
    cp "$SEED_DB" "$DB_FILE"
fi

# Empty / missing DB → create schema only (never wipe production with seed_db.py)
if [ ! -s "$DB_FILE" ]; then
    echo "[entrypoint] Creating empty database schema..."
    python -c "from db import init_db; init_db()"
else
    echo "[entrypoint] Ensuring schema migrations..."
    python -c "from db import ensure_schema; ensure_schema()" || true
fi

PORT="${PORT:-5050}"
HOST="${HOST:-0.0.0.0}"
echo "[entrypoint] Starting Brixen CRM API on ${HOST}:${PORT} (CRM_ENV=${CRM_ENV:-production})"
exec python main.py
