#!/usr/bin/env bash
# Installs the server watchdog as a systemd timer (every minute). Run as root on the VPS:
#   sudo bash install.sh
# Safe to run again after an update; it keeps an existing /etc/server-watchdog.env.
set -euo pipefail
cd "$(dirname "$0")"

install -m 755 server-watchdog.sh /usr/local/bin/server-watchdog
if [ ! -f /etc/server-watchdog.env ]; then
  install -m 600 server-watchdog.env.example /etc/server-watchdog.env
  echo "Created /etc/server-watchdog.env - fill in the Telegram and heartbeat values."
fi

cat > /etc/systemd/system/server-watchdog.service <<'EOF'
[Unit]
Description=Server watchdog (restart unhealthy containers, free disk, Telegram alerts)

[Service]
Type=oneshot
ExecStart=/usr/local/bin/server-watchdog
EOF

cat > /etc/systemd/system/server-watchdog.timer <<'EOF'
[Unit]
Description=Run the server watchdog every minute

[Timer]
OnBootSec=2min
OnUnitActiveSec=1min
AccuracySec=5s

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl enable --now server-watchdog.timer
command -v sqlite3 >/dev/null || echo "Note: install sqlite3 (apt install sqlite3) for the hourly database check."
echo "Installed. Test Telegram with: server-watchdog --test"
