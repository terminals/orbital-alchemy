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

# Validate inputs
[[ -n "$SCOPE_ID" && ! "$SCOPE_ID" =~ ^[0-9]+$ ]] && SCOPE_ID=""

# Validate EVENT_DATA is valid JSON; fall back to wrapping as string
if ! echo "$EVENT_DATA" | jq empty 2>/dev/null; then
  EVENT_DATA=$(jq -n --arg d "$EVENT_DATA" '$d')
fi

# Build JSON with optional top-level fields using jq for safe escaping
EVENT_FILE="${EVENTS_DIR}/${EVENT_ID}.json"

JQ_ARGS=(
  --arg id "$EVENT_ID"
  --arg type "$EVENT_TYPE"
  --argjson data "$EVENT_DATA"
  --arg timestamp "$TIMESTAMP"
)
JQ_EXPR='{id: $id, type: $type, data: $data, timestamp: $timestamp}'

if [ -n "$SCOPE_ID" ]; then
  JQ_ARGS+=(--argjson scope_id "$SCOPE_ID")
  JQ_EXPR='{id: $id, type: $type, scope_id: $scope_id, data: $data, timestamp: $timestamp}'
fi
if [ -n "$AGENT" ]; then
  JQ_ARGS+=(--arg agent "$AGENT")
  JQ_EXPR=$(echo "$JQ_EXPR" | sed 's/}$/, agent: $agent}/')
fi
if [ -n "$SESSION_ID" ]; then
  JQ_ARGS+=(--arg session_id "$SESSION_ID")
  JQ_EXPR=$(echo "$JQ_EXPR" | sed 's/}$/, session_id: $session_id}/')
fi

jq -n "${JQ_ARGS[@]}" "$JQ_EXPR" > "$EVENT_FILE"
