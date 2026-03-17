#!/bin/bash
# orbital-report-gates.sh — Report quality gate results to Orbital dashboard
#
# Usage:
#   orbital-report-gates.sh <gate_name> <pass|fail> [duration_ms] [details]
#
# Environment variables:
#   ORBITAL_GATE_COMMIT_SHA  — commit SHA to tag the run (auto-detected if not set)
#   ORBITAL_GATE_SCOPE_ID    — scope ID to associate with (optional)
#   ORBITAL_URL              — base URL (default: http://localhost:4444)
#
# Fails silently if the Orbital server is not running.
set -e

GATE_NAME="${1:?Usage: orbital-report-gates.sh <gate_name> <pass|fail> [duration_ms] [details]}"
STATUS="${2:?Usage: orbital-report-gates.sh <gate_name> <pass|fail> [duration_ms] [details]}"
DURATION_MS="${3:-null}"
DETAILS="${4:-}"

ORBITAL_URL="${ORBITAL_URL:-http://localhost:4444}"
COMMIT_SHA="${ORBITAL_GATE_COMMIT_SHA:-$(git rev-parse --short HEAD 2>/dev/null || echo "")}"
SCOPE_ID="${ORBITAL_GATE_SCOPE_ID:-null}"

# Build JSON payload
PAYLOAD="{\"gate_name\":\"$GATE_NAME\",\"status\":\"$STATUS\""

[ "$SCOPE_ID" != "null" ] && PAYLOAD="$PAYLOAD,\"scope_id\":$SCOPE_ID"
[ "$DURATION_MS" != "null" ] && PAYLOAD="$PAYLOAD,\"duration_ms\":$DURATION_MS"
[ -n "$COMMIT_SHA" ] && PAYLOAD="$PAYLOAD,\"commit_sha\":\"$COMMIT_SHA\""
[ -n "$DETAILS" ] && PAYLOAD="$PAYLOAD,\"details\":\"$DETAILS\""

PAYLOAD="$PAYLOAD}"

# POST to Orbital server — silent fail if not running
curl --fail --silent --max-time 2 \
  -X POST \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD" \
  "$ORBITAL_URL/api/orbital/gates" > /dev/null 2>&1 || true
