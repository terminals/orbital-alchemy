#!/bin/bash
# orbital-emit.sh — Emit events to Orbital dashboard via file-based bus
#
# Usage:
#   orbital-emit EVENT_TYPE '{"key": "value"}'
#   orbital-emit EVENT_TYPE '{"key": "value"}' --scope 78 --agent attacker --session abc123
#
# Events are written as JSON files to .claude/orbital-events/
# The Orbital server watches this directory and ingests them.
# If the server isn't running, events queue up and are processed on startup.
set -e

EVENT_TYPE="${1:?Usage: orbital-emit EVENT_TYPE '{\"key\": \"value\"}' [--scope N] [--agent NAME] [--session ID]}"
EVENT_DATA="${2:-'{}'}"
shift 2 2>/dev/null || shift 1

# Parse optional named arguments
SCOPE_ID=""
AGENT=""
SESSION_ID=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --scope)  SCOPE_ID="$2"; shift 2 ;;
    --agent)  AGENT="$2"; shift 2 ;;
    --session) SESSION_ID="$2"; shift 2 ;;
    *) shift ;;
  esac
done

TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)
EVENT_ID=$(uuidgen 2>/dev/null | tr '[:upper:]' '[:lower:]' \
  || cat /proc/sys/kernel/random/uuid 2>/dev/null \
  || python3 -c 'import uuid; print(uuid.uuid4())' 2>/dev/null \
  || echo "$(date +%s)-$$-$RANDOM")

# Find project root
if [ -n "$CLAUDE_PROJECT_DIR" ]; then
  PROJECT_ROOT="$CLAUDE_PROJECT_DIR"
else
  PROJECT_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || echo ".")
fi

EVENTS_DIR="${PROJECT_ROOT}/.claude/orbital-events"
mkdir -p "$EVENTS_DIR"

# Validate and sanitize inputs for JSON safety
[[ -n "$SCOPE_ID" && ! "$SCOPE_ID" =~ ^[0-9]+$ ]] && SCOPE_ID=""
AGENT=$(printf '%s' "$AGENT" | sed 's/["\\]/\\&/g')
SESSION_ID=$(printf '%s' "$SESSION_ID" | sed 's/["\\]/\\&/g')

# Build JSON with optional top-level fields
EVENT_FILE="${EVENTS_DIR}/${EVENT_ID}.json"

# Use printf for atomic write with optional fields
JSON="{\"id\":\"$EVENT_ID\",\"type\":\"$EVENT_TYPE\""

[ -n "$SCOPE_ID" ] && JSON="$JSON,\"scope_id\":$SCOPE_ID"
[ -n "$AGENT" ] && JSON="$JSON,\"agent\":\"$AGENT\""
[ -n "$SESSION_ID" ] && JSON="$JSON,\"session_id\":\"$SESSION_ID\""

JSON="$JSON,\"data\":$EVENT_DATA,\"timestamp\":\"$TIMESTAMP\"}"

printf '%s\n' "$JSON" > "$EVENT_FILE"
