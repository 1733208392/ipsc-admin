#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3001}"
API_URL="${BASE_URL%/}/api/v1"
AUTH_URL="${API_URL}/auth/login"
PUB_OTA_URL="${API_URL}/ota/game"
PUB_OTA_HISTORY_URL="${API_URL}/ota/game/history"
ADMIN_OTA_URL="${API_URL}/admin/ota/packages"

ADMIN_USER="${ADMIN_USER:-superadmin}"
ADMIN_PASS="${ADMIN_PASS:-123456}"
OTA_FILE="${OTA_FILE:-./sample-ota.zip}"
OTA_VERSION="${OTA_VERSION:-1.0.0}"

if [[ ! -f "$OTA_FILE" ]]; then
  echo "OTA file not found: $OTA_FILE"
  exit 1
fi

echo "==> Login as super admin"
LOGIN_JSON=$(curl -sS -X POST "$AUTH_URL" \
  -H 'Content-Type: application/json' \
  -d "{\"username\":\"${ADMIN_USER}\",\"password\":\"${ADMIN_PASS}\"}")

TOKEN=$(printf '%s' "$LOGIN_JSON" | sed -n 's/.*"token"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')
if [[ -z "$TOKEN" ]]; then
  echo "Login failed: $LOGIN_JSON"
  exit 1
fi

echo "==> Upload OTA package"
UPLOAD_RESP=$(curl -sS -X POST "$ADMIN_OTA_URL" \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@${OTA_FILE}" \
  -F "version=${OTA_VERSION}" \
  -F "notes=smoke test" \
  -F "status=published")

echo "$UPLOAD_RESP"

echo "==> Query OTA game endpoint"
curl -sS -X POST "$PUB_OTA_URL" \
  -H 'Content-Type: application/json' \
  -d '{"auth_data":""}'

echo

echo "==> Query OTA history endpoint"
curl -sS -X POST "$PUB_OTA_HISTORY_URL" \
  -H 'Content-Type: application/json' \
  -d '{"auth_data":"","page":1,"limit":10}'

echo

echo "==> List admin OTA packages"
curl -sS "$ADMIN_OTA_URL?page=1&limit=10" \
  -H "Authorization: Bearer $TOKEN"

echo

echo "OTA test completed"
