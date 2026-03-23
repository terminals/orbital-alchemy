#!/bin/bash
# orbital-scope-update.sh — Update scope status on the Orbital dashboard
#
# Usage:
#   orbital-scope-update SCOPE_ID STATUS
#   orbital-scope-update 78 implementing
#   orbital-scope-update 35,66,70 implementing   # bulk update
#
# Valid statuses: backlog, team-review, blockers, implementing,
#                 testing, gates, code-review, pr-ci, staging, production, done
#
# Falls back to file-based event if Orbital server isn't reachable.
set -e

SCOPE_IDS="${1:?Usage: orbital-scope-update SCOPE_ID[,SCOPE_ID,...] STATUS}"
STATUS="${2:?Usage: orbital-scope-update SCOPE_ID STATUS}"

ORBITAL_API="http://localhost:4444/api/orbital"

# Try the REST API first (fastest, real-time)
if command -v curl &>/dev/null; then
  # Check if it's a bulk update (comma-separated IDs)
  if [[ "$SCOPE_IDS" == *","* ]]; then
    # Build bulk JSON payload using jq for safe escaping
    IFS=',' read -ra IDS <<< "$SCOPE_IDS"
    SCOPES_JSON=$(printf '%s\n' "${IDS[@]}" | tr -d ' ' | jq -R 'tonumber' | jq -s --arg status "$STATUS" '[.[] | {id: ., status: $status}]')
    PAYLOAD=$(jq -n --argjson scopes "$SCOPES_JSON" '{scopes: $scopes}')

    HTTP_CODE=$(curl -s -o /dev/null -w '%{http_code}' -X PATCH \
      -H 'Content-Type: application/json' \
      -d "$PAYLOAD" \
      "$ORBITAL_API/scopes/bulk/status" 2>/dev/null) || true
  else
    PAYLOAD=$(jq -n --arg status "$STATUS" '{status: $status}')
    HTTP_CODE=$(curl -s -o /dev/null -w '%{http_code}' -X PATCH \
      -H 'Content-Type: application/json' \
      -d "$PAYLOAD" \
      "$ORBITAL_API/scopes/$SCOPE_IDS" 2>/dev/null) || true
  fi

  if [ "$HTTP_CODE" = "200" ]; then
    exit 0
  fi
fi

# Fallback: emit SCOPE_STATUS_CHANGED event via file bus
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
IFS=',' read -ra IDS <<< "$SCOPE_IDS"
for id in "${IDS[@]}"; do
  id=$(echo "$id" | tr -d ' ')
  DATA=$(jq -n --arg to "$STATUS" '{to: $to}')
  "$SCRIPT_DIR/orbital-emit.sh" SCOPE_STATUS_CHANGED "$DATA" --scope "$id" 2>/dev/null &
done
