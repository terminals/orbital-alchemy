#!/bin/bash
# completion-checklist.sh — Block completion when Definition of Done items are unchecked
# Trigger: PreToolUse:Edit (scope status → complete)
# Blocking: exits 2 when unchecked DoD items found
set -e

INPUT=$(cat)
echo "$INPUT" | jq empty 2>/dev/null || exit 0

FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')
NEW_STRING=$(echo "$INPUT" | jq -r '.tool_input.new_string // empty')

source "$(dirname "$0")/scope-helpers.sh"
is_scope_file "$FILE_PATH" || exit 0
echo "$NEW_STRING" | grep -qiE "status:.*complete" || exit 0

# Count unchecked DoD items
UNCHECKED=$(sed -n '/Definition of Done/,/^═/p' "$FILE_PATH" 2>/dev/null | grep -c "\- \[ \]")

if [ "${UNCHECKED:-0}" -gt 0 ]; then
  echo "" >&2
  echo "MUST_BLOCK: $UNCHECKED unchecked Definition of Done items in $(basename "$FILE_PATH")" >&2
  echo "   Check all items in the '## Definition of Done' section: - [x] item (checked) vs - [ ] item (unchecked)." >&2
  echo "" >&2
  exit 2
fi

exit 0
