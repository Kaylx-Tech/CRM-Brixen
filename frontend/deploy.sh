#!/bin/bash
set -e

echo "=========================================="
echo "   LEDGER 1-CLICK DEPLOYMENT SCRIPT       "
echo "=========================================="

APP_DIR="/var/www/ledger"
BACKEND_DIR="$APP_DIR/backend"

cd $APP_DIR

echo "[1/5] Pulling latest changes from Git..."
git pull origin main || git pull origin master

echo "[2/5] Building React Frontend..."
npm install --no-audit --no-fund
npm run build

echo "[3/5] Setting up Python Backend..."
cd $BACKEND_DIR
if [ ! -d ".venv" ]; then
    python3 -m venv .venv
fi
.venv/bin/pip install --upgrade pip
if [ -f "requirements.txt" ]; then
    .venv/bin/pip install -r requirements.txt
else
    .venv/bin/pip install argon2-cffi requests
fi

# Ensure storage directories exist
mkdir -p storage/clients

echo "[4/5] Restarting Ledger Backend Service..."
sudo systemctl daemon-reload
sudo systemctl restart ledger-backend || echo "Service not yet created, skipping restart."

echo "[5/5] Reloading Nginx Web Server..."
sudo nginx -t && sudo systemctl reload nginx

echo "=========================================="
echo "   LEDGER DEPLOYMENT COMPLETE!            "
echo "=========================================="
