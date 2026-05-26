#!/usr/bin/env bash
set -euo pipefail

REMOTE_HOST="root@124.222.233.30"
REMOTE_WEB_DIR="/var/www/ipsc-admin"

echo "[1/3] Checking SSH connectivity..."
ssh -o ConnectTimeout=10 "$REMOTE_HOST" "echo connected: \$(hostname) as \$(whoami)"

echo "[2/3] Building frontend..."
cd "$(dirname "$0")/.."
npm run build

echo "[3/3] Syncing dist/ to remote web root..."
rsync -avz --delete dist/ "$REMOTE_HOST:$REMOTE_WEB_DIR/"

echo "[+] Fixing file permissions..."
ssh "$REMOTE_HOST" "chmod -R 755 '$REMOTE_WEB_DIR' && chown -R nginx:nginx '$REMOTE_WEB_DIR'"

echo "Deployment complete. Live at http://124.222.233.30"
