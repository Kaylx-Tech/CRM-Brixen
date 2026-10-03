#!/usr/bin/env bash
# Mount (or re-link) the production SQLite DB into the brixen-api container.
#
# What it does:
#   1. Finds the live hypetex.db on the host (or uses --source)
#   2. Makes a safe copy into the Docker file-mount path
#   3. Restarts the API container so /app/data/hypetex.db is that DB
#
# Run ON the production server (as root or a user in the docker group):
#   sudo bash scripts/mount_prod_db.sh
#   sudo bash scripts/mount_prod_db.sh --source /path/to/hypetex.db
#   sudo bash scripts/mount_prod_db.sh --container brixen-api --restart
#
# Expected mount (docker-compose.yml):
#   Host:      /var/www/brixen-crm/hypetex.db
#   Container: /app/data/hypetex.db

set -euo pipefail

MOUNT_HOST="${MOUNT_HOST:-/var/www/brixen-crm/hypetex.db}"
MOUNT_CONTAINER="${MOUNT_CONTAINER:-/app/data/hypetex.db}"
CONTAINER_NAME="${CONTAINER_NAME:-brixen-api}"
COMPOSE_DIR="${COMPOSE_DIR:-}"
SOURCE_DB=""
DO_RESTART=1
DRY_RUN=0

usage() {
  cat <<EOF
Usage: $(basename "$0") [options]

Options:
  --source PATH     Explicit path to production hypetex.db (skip auto-find)
  --mount PATH      Host mount file (default: $MOUNT_HOST)
  --container NAME  Docker container name (default: $CONTAINER_NAME)
  --compose-dir DIR Directory with docker-compose.yml (optional restart via compose)
  --no-restart      Copy/link only; do not restart the container
  --dry-run         Print actions only
  -h, --help        Show this help
EOF
}

log()  { printf '[..] %s\n' "$*"; }
ok()   { printf '[ok] %s\n' "$*"; }
fail() { printf '[fail] %s\n' "$*" >&2; exit 1; }
warn() { printf '[warn] %s\n' "$*" >&2; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --source) SOURCE_DB="${2:-}"; shift 2 ;;
    --mount) MOUNT_HOST="${2:-}"; shift 2 ;;
    --container) CONTAINER_NAME="${2:-}"; shift 2 ;;
    --compose-dir) COMPOSE_DIR="${2:-}"; shift 2 ;;
    --no-restart) DO_RESTART=0; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) fail "Unknown option: $1" ;;
  esac
done

run() {
  if [[ "$DRY_RUN" -eq 1 ]]; then
    printf '[dry] %q' "$1"
    shift
    printf ' %q' "$@"
    printf '\n'
    return 0
  fi
  "$@"
}

is_sqlite_file() {
  local path="$1"
  [[ -f "$path" && -s "$path" ]] || return 1
  # SQLite magic header: "SQLite format 3\0"
  local magic
  magic="$(head -c 15 "$path" 2>/dev/null || true)"
  [[ "$magic" == "SQLite format 3" ]]
}

find_source_db() {
  local candidates=(
    "/var/www/brixen-crm/database/hypetex.db"
    "/var/www/brixen-crm/backend/database/hypetex.db"
    "/var/www/brixen-crm/hypetex.db"
    "/opt/brixen-crm/database/hypetex.db"
    "/opt/brixen-crm/hypetex.db"
    "/data/brixen-crm/hypetex.db"
    "/root/CRM-Brixen/backend/database/hypetex.db"
  )

  local found_list="" path expanded
  for path in "${candidates[@]}"; do
    for expanded in $path; do
      if is_sqlite_file "$expanded"; then
        found_list+="$expanded"$'\n'
      fi
    done
  done

  # Also scan common roots (largest file wins — usually the real prod dump)
  local scanned
  scanned="$(find /var/www /opt /data /root /home -maxdepth 5 -type f -name 'hypetex.db' 2>/dev/null | head -n 40 || true)"
  if [[ -n "$scanned" ]]; then
    found_list+="$scanned"$'\n'
  fi

  local best="" best_size=0 size
  while IFS= read -r path; do
    [[ -z "$path" ]] && continue
    is_sqlite_file "$path" || continue
    size="$(stat -c%s "$path" 2>/dev/null || echo 0)"
    # Prefer largest valid DB (production data > empty seed / empty mount)
    if [[ "$size" -gt "$best_size" ]]; then
      best="$path"
      best_size="$size"
    fi
  done <<< "$found_list"

  if [[ -n "$best" && "$best_size" -gt 0 ]]; then
    echo "$best"
    return 0
  fi
  return 1
}

db_stats() {
  local path="$1"
  if ! command -v sqlite3 >/dev/null 2>&1; then
    echo "(sqlite3 not installed — size only: $(stat -c%s "$path") bytes)"
    return 0
  fi
  local tables users clients
  tables="$(sqlite3 "$path" "SELECT COUNT(*) FROM sqlite_master WHERE type='table';" 2>/dev/null || echo "?")"
  users="$(sqlite3 "$path" "SELECT COUNT(*) FROM users;" 2>/dev/null || echo "?")"
  clients="$(sqlite3 "$path" "SELECT COUNT(*) FROM clients;" 2>/dev/null || echo "?")"
  echo "tables=$tables users=$users clients=$clients size=$(stat -c%s "$path")B"
}

# --- resolve source ---
if [[ -n "$SOURCE_DB" ]]; then
  [[ -f "$SOURCE_DB" ]] || fail "Source not found: $SOURCE_DB"
  is_sqlite_file "$SOURCE_DB" || fail "Source is not a valid SQLite DB: $SOURCE_DB"
else
  log "Searching for production hypetex.db on this host..."
  SOURCE_DB="$(find_source_db)" || fail "Could not find hypetex.db. Pass --source /path/to/hypetex.db"
fi

SOURCE_DB="$(readlink -f "$SOURCE_DB" 2>/dev/null || realpath "$SOURCE_DB" 2>/dev/null || echo "$SOURCE_DB")"
ok "Source DB: $SOURCE_DB ($(db_stats "$SOURCE_DB"))"

MOUNT_DIR="$(dirname "$MOUNT_HOST")"
stamp="$(date +%Y%m%d_%H%M%S)"

# Docker pitfall: missing host file → Docker creates a DIRECTORY at mount path
if [[ -d "$MOUNT_HOST" ]]; then
  warn "$MOUNT_HOST is a DIRECTORY (bad Docker file-mount). Removing it."
  run rm -rf "$MOUNT_HOST"
fi

run mkdir -p "$MOUNT_DIR"

# If source IS already the mount file, just restart
if [[ "$(readlink -f "$SOURCE_DB" 2>/dev/null || echo "$SOURCE_DB")" == "$(readlink -f "$MOUNT_HOST" 2>/dev/null || echo "$MOUNT_HOST")" ]]; then
  ok "Source is already the mount path — no copy needed."
else
  if [[ -f "$MOUNT_HOST" && -s "$MOUNT_HOST" ]]; then
    backup="${MOUNT_HOST}.${stamp}.bak"
    log "Backing up current mount file → $backup"
    run cp -a "$MOUNT_HOST" "$backup"
  fi

  # Copy via temp + atomic replace so a mid-copy crash does not leave a half file mounted
  tmp="${MOUNT_HOST}.tmp.${stamp}"
  log "Copying $SOURCE_DB → $MOUNT_HOST"
  run cp -a "$SOURCE_DB" "$tmp"
  run mv -f "$tmp" "$MOUNT_HOST"
fi

# Permissions: readable by container user
run chmod 644 "$MOUNT_HOST" || true
ok "Mount host file ready: $MOUNT_HOST ($(db_stats "$MOUNT_HOST"))"

# Ensure compose volume line is documented / present if we can find compose
if [[ -z "$COMPOSE_DIR" ]]; then
  for d in \
    "$(cd "$(dirname "$0")/.." && pwd)" \
    /var/www/brixen-crm \
    /opt/brixen-crm \
    /root/CRM-Brixen/backend
  do
    if [[ -f "$d/docker-compose.yml" ]]; then
      COMPOSE_DIR="$d"
      break
    fi
  done
fi

if [[ -n "$COMPOSE_DIR" && -f "$COMPOSE_DIR/docker-compose.yml" ]]; then
  if ! grep -q "$MOUNT_HOST:$MOUNT_CONTAINER" "$COMPOSE_DIR/docker-compose.yml" 2>/dev/null; then
    warn "docker-compose.yml in $COMPOSE_DIR may not mount:"
    warn "  $MOUNT_HOST:$MOUNT_CONTAINER"
    warn "Add/update the volumes entry for brixen-api, then redeploy."
  else
    ok "compose volume confirmed: $MOUNT_HOST → $MOUNT_CONTAINER"
  fi
fi

restart_container() {
  if [[ -n "$COMPOSE_DIR" && -f "$COMPOSE_DIR/docker-compose.yml" ]]; then
    log "Restarting via docker compose in $COMPOSE_DIR"
    (cd "$COMPOSE_DIR" && run docker compose up -d --force-recreate brixen-api) \
      || (cd "$COMPOSE_DIR" && run docker-compose up -d --force-recreate brixen-api) \
      || true
  fi

  if docker ps -a --format '{{.Names}}' | grep -qx "$CONTAINER_NAME"; then
    log "Restarting container $CONTAINER_NAME"
    run docker restart "$CONTAINER_NAME"
    return 0
  fi

  # Coolify / random name: find by image or label containing brixen
  local cid
  cid="$(docker ps -a --format '{{.ID}} {{.Names}}' | grep -iE 'brixen|crm' | head -n1 | awk '{print $1}' || true)"
  if [[ -n "$cid" ]]; then
    log "Restarting discovered container $cid"
    run docker restart "$cid"
    CONTAINER_NAME="$cid"
    return 0
  fi

  warn "No running container named $CONTAINER_NAME found. Start/redeploy the API so it mounts $MOUNT_HOST."
  return 1
}

verify_in_container() {
  local name="$1"
  sleep 2
  if ! docker ps --format '{{.Names}}' | grep -qx "$name" && ! docker ps -q --filter "id=$name" | grep -q .; then
    # name might be id
    if ! docker inspect "$name" >/dev/null 2>&1; then
      warn "Container not running yet — skip in-container verify."
      return 0
    fi
  fi

  log "Verifying DB inside container at $MOUNT_CONTAINER"
  if run docker exec "$name" test -f "$MOUNT_CONTAINER"; then
    ok "Container sees file $MOUNT_CONTAINER"
  else
    warn "Container does not see $MOUNT_CONTAINER — check Coolify/file mount config."
    return 0
  fi

  if docker exec "$name" which sqlite3 >/dev/null 2>&1; then
    local users
    users="$(docker exec "$name" sqlite3 "$MOUNT_CONTAINER" "SELECT COUNT(*) FROM users;" 2>/dev/null || echo "?")"
    ok "Inside container: users=$users"
  fi

  if docker exec "$name" curl -sf "http://127.0.0.1:5050/api/health" >/dev/null 2>&1; then
    ok "API health OK"
  else
    warn "API health not ready yet (may still be starting)."
  fi
}

if [[ "$DO_RESTART" -eq 1 ]]; then
  if restart_container; then
    [[ "$DRY_RUN" -eq 0 ]] && verify_in_container "$CONTAINER_NAME"
  fi
else
  log "Skipped restart (--no-restart). Remount/redeploy when ready."
fi

ok "Done. App should now use the same production data."
echo
echo "Mount mapping:"
echo "  Host:      $MOUNT_HOST"
echo "  Container: $MOUNT_CONTAINER"
echo "  Source:    $SOURCE_DB"
