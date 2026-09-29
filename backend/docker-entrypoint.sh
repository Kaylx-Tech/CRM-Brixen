#!/bin/bash
set -e

DB_FILE="${DATABASE_URL:-/app/data/hypetex.db}"
SEED_DB="/app/seed/hypetex.db"
STORAGE_DIR="${STORAGE_PATH:-/app/storage}"

echo "[entrypoint] DATABASE_URL=${DB_FILE}"
echo "[entrypoint] STORAGE_PATH=${STORAGE_DIR}"

mkdir -p "$(dirname "$DB_FILE")" "$STORAGE_DIR/clients" /app/seed 2>/dev/null || true

if [ ! -f "$DB_FILE" ]; then
    echo "[entrypoint] WARNING: database file not found at ${DB_FILE}"
    echo "[entrypoint] Mount host /var/www/brixen-crm/hypetex.db → /app/data/hypetex.db"
    if [ -f "$SEED_DB" ]; then
        echo "[entrypoint] Falling back to image seed..."
        cp "$SEED_DB" "$DB_FILE"
    fi
fi

if [ ! -s "$DB_FILE" ]; then
    echo "[entrypoint] Creating empty database schema at ${DB_FILE}..."
    python -c "from db import init_db; init_db()"
else
    echo "[entrypoint] Using existing database; applying schema migrations..."
    python -c "from db import ensure_schema; ensure_schema()" || true
fi

if command -v sqlite3 >/dev/null 2>&1 && [ -f "$DB_FILE" ]; then
    TABLES=$(sqlite3 "$DB_FILE" "SELECT COUNT(*) FROM sqlite_master WHERE type='table';" 2>/dev/null || echo "?")
    echo "[entrypoint] SQLite tables in DB: ${TABLES}"
fi

PORT="${PORT:-5050}"
HOST="${HOST:-0.0.0.0}"
echo "[entrypoint] Starting Brixen CRM API on ${HOST}:${PORT} (CRM_ENV=${CRM_ENV:-production})"
exec python main.py
