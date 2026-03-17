#!/bin/bash
# blocker-check.sh — Note unresolved blockers when advancing scope status
# Trigger: PreToolUse:Edit (scope file with status change)
# Nudge-style: always exits 0
set -e

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty' 2>/dev/null)
NEW_STRING=$(echo "$INPUT" | jq -r '.tool_input.new_string // empty' 2>/dev/null)

[[ "$FILE_PATH" == *"scopes/"* && "$FILE_PATH" == *.md ]] || exit 0
echo "$NEW_STRING" | grep -qiE "status:.*implementing|status:.*backlog|In Progress" || exit 0

# Count BLOCKER references (exclude resolved ones)
BLOCKERS=$(grep -c "^- \[B-" "$FILE_PATH" 2>/dev/null || echo "0")

if [ "$BLOCKERS" -gt 0 ]; then
  echo ""
  echo "🚧 $BLOCKERS blocker(s) found in $(basename "$FILE_PATH")"
  echo "   Verify all are resolved before advancing status."
  echo ""
fi

exit 0
