#!/bin/bash
# time-tracker.sh — Emit scope status transition events to Orbital dashboard
# Trigger: PostToolUse:Edit (scope status changes)
# Nudge-style: always exits 0
set -e

INPUT=$(cat)
echo "$INPUT" | jq empty 2>/dev/null || exit 0

FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')
NEW_STRING=$(echo "$INPUT" | jq -r '.tool_input.new_string // empty')

source "$(dirname "$0")/scope-helpers.sh"
is_scope_file "$FILE_PATH" || exit 0

# Detect status transitions — match any status value, not a hardcoded list
STATUS=""
STATUS=$(echo "$NEW_STRING" | grep -oE '^status:[[:space:]]*[a-z][-a-z]*' | sed 's/^status:[[:space:]]*//' | head -1)
echo "$NEW_STRING" | grep -qiE "🔄.*In Progress" && STATUS="phase_started"
echo "$NEW_STRING" | grep -qiE "✅.*Done" && STATUS="phase_done"
[ -z "$STATUS" ] && exit 0

SCOPE_NAME=$(basename "$FILE_PATH" .md)

# Emit SCOPE_TRANSITION event to Orbital dashboard
HOOK_DIR="$(dirname "$0")"
DATA=$(jq -n --arg from "" --arg to "$STATUS" --arg scope_name "$SCOPE_NAME" '{from: $from, to: $to, scope_name: $scope_name}')
"$HOOK_DIR/orbital-emit.sh" SCOPE_TRANSITION "$DATA"

exit 0
