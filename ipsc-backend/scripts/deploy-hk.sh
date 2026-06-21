#!/usr/bin/env bash
set -euo pipefail

# HK production deployment script for api.grwolf.com
# Usage:
#   bash scripts/deploy-hk.sh
#   HK_SSH_KEY=/path/to/key.pem bash scripts/deploy-hk.sh

REMOTE_HOST="root@43.132.237.60"
REMOTE_APP_DIR="/home/ipsc-backend"
PM2_NAME="ipsc-api"
SSH_KEY="${HK_SSH_KEY:-/Volumes/SSD2/Personal/FlexMatchHK.pem}"

if [[ ! -f "$SSH_KEY" ]]; then
  echo "SSH key not found: $SSH_KEY"
  exit 1
fi

SSH_OPTS=(
  -i "$SSH_KEY"
  -o StrictHostKeyChecking=accept-new
  -o ConnectTimeout=15
)

echo "[1/5] Checking SSH connectivity..."
ssh "${SSH_OPTS[@]}" "$REMOTE_HOST" 'echo "connected: $(hostname) as $(whoami)"; test -d /home/ipsc-backend'

echo "[2/5] Backing up remote scores route..."
ssh "${SSH_OPTS[@]}" "$REMOTE_HOST" "cp '$REMOTE_APP_DIR/src/routes/scores.ts' '$REMOTE_APP_DIR/src/routes/scores.ts.bak-$(date +%Y%m%d-%H%M%S)'"

echo "[3/5] Building locally..."
cd "$(dirname "$0")/.."
npm run build

echo "[4/5] Syncing build output to remote server..."
COPYFILE_DISABLE=1 tar czf - dist package.json package-lock.json ecosystem.config.cjs \
  | ssh "${SSH_OPTS[@]}" "$REMOTE_HOST" "cd '$REMOTE_APP_DIR' && tar xzf -"

echo "[5/5] Restarting PM2 process: $PM2_NAME"
ssh "${SSH_OPTS[@]}" "$REMOTE_HOST" "bash -lc '
  NODE_BIN_DIR=\"\
\$(ls -d /root/.nvm/versions/node/*/bin 2>/dev/null | sort -V | tail -n1)\"
  export PATH=\"\$NODE_BIN_DIR:\$PATH\"
  pm2 restart \"$PM2_NAME\"
  pm2 ls --no-color | sed -n \"1,16p\"
'"

echo "Deployment complete (HK server: $REMOTE_HOST)."
