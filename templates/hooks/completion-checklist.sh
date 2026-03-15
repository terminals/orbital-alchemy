#!/bin/bash
# completion-checklist.sh — Block completion when Definition of Done items are unchecked
# Trigger: PreToolUse:Edit (scope status → complete)
# Blocking: exits 2 when unchecked DoD items found

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty' 2>/dev/null)
NEW_STRING=$(echo "$INPUT" | jq -r '.tool_input.new_string // empty' 2>/dev/null)

[[ "$FILE_PATH" == *"scopes/"* && "$FILE_PATH" == *.md ]] || exit 0
echo "$NEW_STRING" | grep -qiE "status:.*complete" || exit 0

# Count unchecked DoD items
UNCHECKED=$(sed -n '/Definition of Done/,/^═/p' "$FILE_PATH" 2>/dev/null | grep -c "\- \[ \]")

if [ "${UNCHECKED:-0}" -gt 0 ]; then
  echo ""
  echo "MUST_BLOCK: $UNCHECKED unchecked Definition of Done items in $(basename "$FILE_PATH")"
  echo "   Complete all items before marking scope as complete."
  echo ""
  exit 2
fi

exit 0
