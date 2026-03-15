#!/bin/bash
# orbital-emit.sh — Emit events to Orbital Command via file-based bus
# Usage: orbital-emit EVENT_TYPE '{"key": "value"}'
#
# Events are written as JSON files to .claude/orbital-events/
# The Orbital Command server watches this directory and ingests them.
# If the server isn't running, events queue up and are processed on startup.

EVENT_TYPE="${1:?Usage: orbital-emit EVENT_TYPE '{\"key\": \"value\"}'}"
EVENT_DATA="${2:-'{}'}"

TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)
EVENT_ID=$(uuidgen | tr '[:upper:]' '[:lower:]')

# Find project root via git
PROJECT_ROOT=$(git rev-parse --show-toplevel 2>/dev/null)
if [ -z "$PROJECT_ROOT" ]; then
  # Fallback: use CLAUDE_PROJECT_DIR if available
  PROJECT_ROOT="${CLAUDE_PROJECT_DIR:-.}"
fi

EVENTS_DIR="${PROJECT_ROOT}/.claude/orbital-events"
mkdir -p "$EVENTS_DIR"

# Write event as atomic file
EVENT_FILE="${EVENTS_DIR}/${EVENT_ID}.json"
printf '{"id":"%s","type":"%s","data":%s,"timestamp":"%s"}\n' \
  "$EVENT_ID" "$EVENT_TYPE" "$EVENT_DATA" "$TIMESTAMP" \
  > "$EVENT_FILE"
