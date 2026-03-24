#!/usr/bin/env bash
set -euo pipefail

API_URL=${API_URL:-http://localhost:3000}
ADMIN_EMAIL=${ADMIN_EMAIL:-a@jwt.com}
ADMIN_PASSWORD=${ADMIN_PASSWORD:-admin}

echo "[dev-traffic] logging in as ${ADMIN_EMAIL} against ${API_URL}"
TOKEN=$(
  curl -sS -X PUT "${API_URL}/api/auth" \
    -H 'Content-Type: application/json' \
    -d "{\"email\":\"${ADMIN_EMAIL}\",\"password\":\"${ADMIN_PASSWORD}\"}" |
    jq -r '.token'
)

if [[ -z "${TOKEN}" || "${TOKEN}" == "null" ]]; then
  echo "[dev-traffic] failed to obtain token" >&2
  exit 1
fi

auth_header="Authorization: Bearer ${TOKEN}"

hit() {
  local method=$1
  local path=$2
  local body=${3:-}

  echo "[dev-traffic] ${method} ${path}"
  if [[ -n "${body}" ]]; then
    curl -sS -X "${method}" "${API_URL}${path}" \
      -H "${auth_header}" \
      -H 'Content-Type: application/json' \
      -d "${body}" >/dev/null
  else
    curl -sS -X "${method}" "${API_URL}${path}" \
      -H "${auth_header}" >/dev/null
  fi
}

# Generate a few representative requests.
hit GET /api/order
hit POST /api/order '{"franchiseId":1,"storeId":1,"items":[{"menuId":1,"description":"Dev Pizza","price":0.005}]}'
hit GET /api/user/me

echo "[dev-traffic] requests sent. Check Grafana for metrics (active_users should rise above 0)."
