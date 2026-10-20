#!/bin/bash
set -e

DB_FILE="${DATABASE_URL:-/app/data/hypetex.db}"
BUNDLED_DB="/app/database/hypetex.db"
SEED_DB="/app/seed/hypetex.db"
STORAGE_DIR="${STORAGE_PATH:-/app/storage}"

echo "[entrypoint] DATABASE_URL=${DB_FILE}"
echo "[entrypoint] STORAGE_PATH=${STORAGE_DIR}"

mkdir -p "$(dirname "$DB_FILE")" "$STORAGE_DIR/clients" /app/seed 2>/dev/null || true

# Finstap (FINSTAP_DATA_DIR set): every workspace has its own database, created at signup and
# migrated by main.py on start. The single-database setup below (bundled/seed copy) must not run.
if [ -n "${FINSTAP_DATA_DIR:-}" ]; then
    mkdir -p "$FINSTAP_DATA_DIR" 2>/dev/null || true
    echo "[entrypoint] Finstap mode: workspaces in ${FINSTAP_DATA_DIR}"
    PORT="${PORT:-5050}"
    HOST="${HOST:-0.0.0.0}"
    echo "[entrypoint] Starting Finstap API on ${HOST}:${PORT} (CRM_ENV=${CRM_ENV:-production})"
    exec python main.py
fi

# Docker file-mount pitfall: if host path was missing, Docker may create a directory
if [ -d "$DB_FILE" ]; then
    echo "[entrypoint] ERROR: ${DB_FILE} is a directory (bad file mount)."
    echo "[entrypoint] On the host, remove it and place a real hypetex.db file:"
    echo "[entrypoint]   rm -rf /var/www/brixen-crm/hypetex.db"
    echo "[entrypoint]   # then upload DB with: python scripts/upload_remote_db.py --host ..."
    exit 1
fi

copy_fallback() {
    local src="$1"
    local label="$2"
    if [ -f "$src" ] && [ -s "$src" ]; then
        echo "[entrypoint] ${label}: copying ${src} → ${DB_FILE}"
        cp "$src" "$DB_FILE"
        return 0
    fi
    return 1
}

if [ ! -f "$DB_FILE" ] || [ ! -s "$DB_FILE" ]; then
    echo "[entrypoint] Database missing/empty at ${DB_FILE}"
    if ! copy_fallback "$BUNDLED_DB" "Using image-bundled DB"; then
        if ! copy_fallback "$SEED_DB" "Falling back to image seed"; then
            echo "[entrypoint] No bundled DB found. Mount host file or ship database/hypetex.db in the image."
            echo "[entrypoint] Expected mount: /var/www/brixen-crm/hypetex.db → /app/data/hypetex.db"
        fi
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
    ROWS_USERS=$(sqlite3 "$DB_FILE" "SELECT COUNT(*) FROM users;" 2>/dev/null || echo "?")
    echo "[entrypoint] SQLite tables in DB: ${TABLES} | users rows: ${ROWS_USERS}"
fi

PORT="${PORT:-5050}"
HOST="${HOST:-0.0.0.0}"
echo "[entrypoint] Starting Brixen CRM API on ${HOST}:${PORT} (CRM_ENV=${CRM_ENV:-production})"
exec python main.py
