#!/bin/bash
# dependency-check.sh — Check blocked_by dependencies when advancing status
# Trigger: PreToolUse:Edit (scope file with status change)
# Nudge-style: always exits 0

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty' 2>/dev/null)
NEW_STRING=$(echo "$INPUT" | jq -r '.tool_input.new_string // empty' 2>/dev/null)

[[ "$FILE_PATH" == *"scopes/"* && "$FILE_PATH" == *.md ]] || exit 0
echo "$NEW_STRING" | grep -qiE "status:.*implementing|status:.*backlog" || exit 0

# Extract blocked_by from frontmatter
BLOCKED_BY=$(sed -n '2,/^---$/p' "$FILE_PATH" | grep "^blocked_by:" | sed 's/blocked_by:[[:space:]]*//' | tr -d '[]"')

if [ -n "$BLOCKED_BY" ] && [ "$BLOCKED_BY" != " " ]; then
  echo ""
  echo "🔗 Dependencies: blocked_by: $BLOCKED_BY"
  echo "   Verify blocking scopes are complete before starting."
  echo ""
fi

exit 0
