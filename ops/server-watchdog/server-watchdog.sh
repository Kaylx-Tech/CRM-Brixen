#!/usr/bin/env bash
# Server watchdog: runs every minute from a systemd timer on the VPS.
# - restarts containers whose health check says "unhealthy" (Docker only marks them, it never restarts them)
#   and stops after MAX_RESTARTS in 30 min, so a broken deploy is handed to a person instead of looping
# - frees disk when it gets full (old unused Docker images, old build cache, old system journal)
# - warns on low memory, crash-looping containers, a failed database check or a missing backup
# - sends a heartbeat to the site watcher, which raises the alarm if this server goes quiet
# Alerts go to Telegram: once when a problem starts, hourly while it lasts, once when it is fixed.
# It never touches databases, uploaded documents, volumes or running containers' data.
#
#   server-watchdog          normal run (the timer does this)
#   server-watchdog --test   send a Telegram test message

set -u
CONF=${WATCHDOG_CONF:-/etc/server-watchdog.env}
[ -f "$CONF" ] && . "$CONF"

STATE_DIR=${STATE_DIR:-/var/lib/server-watchdog}
DISK_LIMIT=${DISK_LIMIT:-85}           # % used on /
MEM_MIN_MB=${MEM_MIN_MB:-200}          # MemAvailable below this = alert
MAX_RESTARTS=${MAX_RESTARTS:-3}        # per container per 30 min
DB_FILES=${DB_FILES:-}                 # space separated, globs ok; checked read-only once an hour
BACKUP_DIR=${BACKUP_DIR:-}             # newest file must be younger than BACKUP_MAX_HOURS
BACKUP_MAX_HOURS=${BACKUP_MAX_HOURS:-26}
HOST_LABEL=${HOST_LABEL:-$(hostname)}

mkdir -p "$STATE_DIR"
exec 9>"$STATE_DIR/lock"
flock -n 9 || exit 0

now=$(date +%s)
minute=$(date +%-M)
OUTBOX="$STATE_DIR/outbox"

say() { printf '%s\n\n' "$1" >> "$OUTBOX"; }

# problem KEY TEXT: alert when it starts, remind hourly
problem() {
  local f="$STATE_DIR/problem_$1"
  if [ ! -f "$f" ]; then
    echo "$now" > "$f"; echo "$now" > "$f.last"
    say "🔴 [$HOST_LABEL] $2"
  elif [ $((now - $(cat "$f.last"))) -ge 3600 ]; then
    echo "$now" > "$f.last"
    say "🔴 [$HOST_LABEL] Still: $2"
  fi
}

# resolved KEY TEXT: alert once if KEY was a problem
resolved() {
  local f="$STATE_DIR/problem_$1"
  if [ -f "$f" ]; then
    rm -f "$f" "$f.last"
    say "✅ [$HOST_LABEL] $2"
  fi
}

send_outbox() {
  [ -s "$OUTBOX" ] || return 0
  if [ -z "${TELEGRAM_BOT_TOKEN:-}" ] || [ -z "${TELEGRAM_CHAT_ID:-}" ]; then
    cat "$OUTBOX"; : > "$OUTBOX"; return 0
  fi
  # unsent messages stay in the outbox and go with the next run (e.g. while the network is down)
  if curl -fsS -m 15 -o /dev/null "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
      --data-urlencode "chat_id=${TELEGRAM_CHAT_ID}" --data-urlencode "text@${OUTBOX}" \
      -d disable_web_page_preview=true; then
    : > "$OUTBOX"
  fi
}

if [ "${1:-}" = "--test" ]; then
  say "✅ [$HOST_LABEL] Server watchdog test message. Alerts will arrive here."
  send_outbox
  exit 0
fi

# 1. Containers
if command -v docker >/dev/null 2>&1; then
  unhealthy=$(docker ps --filter health=unhealthy --format '{{.ID}} {{.Names}}')
  while read -r id name; do
    [ -n "$id" ] || continue
    log="$STATE_DIR/restarts_$name"
    recent=$(awk -v t=$((now - 1800)) '$1 >= t' "$log" 2>/dev/null | wc -l | tr -d ' ')
    if [ "$recent" -ge "$MAX_RESTARTS" ]; then
      problem "stuck_$name" "$name is unhealthy and $recent restarts in 30 min did not fix it. Needs a person (check its logs / last deploy)."
    elif docker restart "$id" >/dev/null 2>&1; then
      echo "$now" >> "$log"
      say "🔧 [$HOST_LABEL] $name was unhealthy (not answering its health check). Restarted it."
    else
      problem "stuck_$name" "$name is unhealthy and the restart failed."
    fi
  done <<< "$unhealthy"
  for f in "$STATE_DIR"/problem_stuck_*; do
    [ -e "$f" ] || continue
    case "$f" in *.last) continue ;; esac
    name=${f##*/problem_stuck_}
    grep -q " $name\$" <<< "$unhealthy" || resolved "stuck_$name" "$name is healthy again."
  done

  looping=$(docker ps --filter status=restarting --format '{{.Names}}' | tr '\n' ' ')
  if [ -n "${looping// }" ]; then
    problem crashloop "Containers keep crashing and restarting: $looping(check their logs / last deploy)."
  else
    resolved crashloop "No containers are crash-looping any more."
  fi
fi

# 2. Disk
disk_used() { df -P / | awk 'NR==2 { gsub("%", "", $5); print $5 }'; }
disk=$(disk_used)
if [ "$disk" -ge "$DISK_LIMIT" ]; then
  last_clean=$(cat "$STATE_DIR/last_cleanup" 2>/dev/null || echo 0)
  if [ $((now - last_clean)) -ge 3600 ]; then
    echo "$now" > "$STATE_DIR/last_cleanup"
    if command -v docker >/dev/null 2>&1; then
      docker image prune -af --filter "until=168h" >/dev/null 2>&1
      docker builder prune -af --filter "until=168h" >/dev/null 2>&1
    fi
    command -v journalctl >/dev/null 2>&1 && journalctl --vacuum-size=500M >/dev/null 2>&1
    after=$(disk_used)
    say "🔧 [$HOST_LABEL] Disk was ${disk}% full. Cleaned unused Docker images and build cache older than 7 days and old system logs: now ${after}%."
    disk=$after
  fi
  [ "$disk" -ge "$DISK_LIMIT" ] && problem disk "Disk is ${disk}% full and cleanup could not free enough. Needs a person."
else
  resolved disk "Disk is fine again (${disk}% used)."
fi

# 3. Memory
mem_free=$(awk '/^MemAvailable:/ { print int($2 / 1024) }' /proc/meminfo 2>/dev/null || echo "")
if [ -n "$mem_free" ] && [ "$mem_free" -lt "$MEM_MIN_MB" ]; then
  top=$(ps -eo comm,rss --sort=-rss 2>/dev/null | awk 'NR>1 && NR<=4 { printf "%s %d MB, ", $1, $2/1024 }')
  problem memory "Only ${mem_free} MB memory free. Biggest: ${top%, }."
elif [ -n "$mem_free" ]; then
  resolved memory "Memory is fine again (${mem_free} MB free)."
fi

# 4. Hourly: databases (read-only) and backups
if [ "$minute" = "7" ]; then
  if [ -n "$DB_FILES" ] && command -v sqlite3 >/dev/null 2>&1; then
    bad=""
    for db in $DB_FILES; do
      [ -f "$db" ] || continue
      result=$(timeout 120 sqlite3 -readonly "$db" 'PRAGMA quick_check;' 2>&1 | head -1)
      [ "$result" = "ok" ] || bad="$bad${db##*/} ($result), "
    done
    if [ -n "$bad" ]; then
      problem database "Database check failed: ${bad%, }. Nothing was changed; restore from backup may be needed."
    else
      resolved database "Database checks pass again."
    fi
  fi
  if [ -n "$BACKUP_DIR" ]; then
    newest=$(find "$BACKUP_DIR" -type f -printf '%T@\n' 2>/dev/null | sort -n | tail -1 | cut -d. -f1)
    if [ -z "$newest" ] || [ $((now - newest)) -gt $((BACKUP_MAX_HOURS * 3600)) ]; then
      problem backup "No new backup in $BACKUP_DIR for over ${BACKUP_MAX_HOURS} hours."
    else
      resolved backup "Backups are being made again."
    fi
  fi
fi

# 5. Heartbeat to the site watcher, every 5 minutes
if [ -n "${HEARTBEAT_URL:-}" ] && [ $((minute % 5)) -eq 0 ]; then
  curl -fsS -m 10 -o /dev/null -X POST "$HEARTBEAT_URL" \
    -H "Authorization: Bearer ${HEARTBEAT_KEY:-}" -H 'Content-Type: application/json' \
    -d "{\"host\":\"$HOST_LABEL\",\"disk\":$disk,\"mem_free_mb\":${mem_free:-null}}" || true
fi

send_outbox
