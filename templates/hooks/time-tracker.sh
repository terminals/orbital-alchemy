#!/bin/bash
# time-tracker.sh — Emit scope status transition events to Orbital dashboard
# Trigger: PostToolUse:Edit (scope status changes)
# Nudge-style: always exits 0
set -e

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty' 2>/dev/null)
NEW_STRING=$(echo "$INPUT" | jq -r '.tool_input.new_string // empty' 2>/dev/null)

[[ "$FILE_PATH" == *"scopes/"* && "$FILE_PATH" == *.md ]] || exit 0

# Detect status transitions
STATUS=""
echo "$NEW_STRING" | grep -qiE "status:.*planning" && STATUS="planning"
echo "$NEW_STRING" | grep -qiE "status:.*backlog" && STATUS="backlog"
echo "$NEW_STRING" | grep -qiE "status:.*implementing" && STATUS="implementing"
echo "$NEW_STRING" | grep -qiE "status:.*complete" && STATUS="complete"
echo "$NEW_STRING" | grep -qiE "🔄.*In Progress" && STATUS="phase_started"
echo "$NEW_STRING" | grep -qiE "✅.*Done" && STATUS="phase_done"
[ -z "$STATUS" ] && exit 0

SCOPE_NAME=$(basename "$FILE_PATH" .md)

# Emit SCOPE_TRANSITION event to Orbital dashboard
HOOK_DIR="$(dirname "$0")"
"$HOOK_DIR/orbital-emit.sh" SCOPE_TRANSITION "{\"from\":\"\",\"to\":\"$STATUS\",\"scope_name\":\"$SCOPE_NAME\"}"

exit 0
