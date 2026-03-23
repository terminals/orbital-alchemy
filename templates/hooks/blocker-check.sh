#!/bin/bash
# blocker-check.sh — Note unresolved blockers when advancing scope status
# Trigger: PreToolUse:Edit (scope file with status change)
# Nudge-style: always exits 0
set -e

INPUT=$(cat)
echo "$INPUT" | jq empty 2>/dev/null || exit 0

FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')
NEW_STRING=$(echo "$INPUT" | jq -r '.tool_input.new_string // empty')

source "$(dirname "$0")/scope-helpers.sh"
is_scope_file "$FILE_PATH" || exit 0
echo "$NEW_STRING" | grep -qiE "status:.*implementing|status:.*backlog|In Progress" || exit 0

# Count BLOCKER references (exclude resolved ones)
[ -f "$FILE_PATH" ] || exit 0
BLOCKERS=$(grep -c "^- \[B-" "$FILE_PATH" || echo "0")

if [ "$BLOCKERS" -gt 0 ]; then
  echo ""
  echo "🚧 $BLOCKERS blocker(s) found in $(basename "$FILE_PATH")"
  echo "   Verify all are resolved before advancing status."
  echo ""
fi

exit 0
