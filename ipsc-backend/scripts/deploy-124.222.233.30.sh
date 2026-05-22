#!/usr/bin/env bash
set -euo pipefail

REMOTE_HOST="root@124.222.233.30"
REMOTE_APP_DIR="/home/ipsc-backend"
PM2_NAME="ipsc-api"

echo "[1/5] Checking SSH connectivity..."
ssh -o ConnectTimeout=10 "$REMOTE_HOST" "echo connected: \\$(hostname) as \\$(whoami)"

echo "[2/5] Backing up remote scores route..."
ssh "$REMOTE_HOST" "cp '$REMOTE_APP_DIR/src/routes/scores.ts' '$REMOTE_APP_DIR/src/routes/scores.ts.bak-$(date +%Y%m%d-%H%M%S)'"

echo "[3/5] Syncing backend source and build config..."
cd "$(dirname "$0")/.."
tar czf - src package.json package-lock.json tsconfig.json | ssh "$REMOTE_HOST" "cd '$REMOTE_APP_DIR' && tar xzf -"

echo "[4/5] Building on remote server..."
ssh "$REMOTE_HOST" "cd '$REMOTE_APP_DIR' && npm run build"

echo "[5/5] Restarting PM2 process: $PM2_NAME"
ssh "$REMOTE_HOST" "pm2 restart '$PM2_NAME' && pm2 ls --no-color | sed -n '1,12p'"

echo "Deployment complete."
