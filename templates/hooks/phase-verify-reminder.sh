#!/bin/bash
# phase-verify-reminder.sh — Remind to verify before marking phase done
# Trigger: PreToolUse:Edit (scope file with completion marker)
# Nudge-style: always exits 0
set -e

INPUT=$(cat)
echo "$INPUT" | jq empty 2>/dev/null || exit 0

FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')
NEW_STRING=$(echo "$INPUT" | jq -r '.tool_input.new_string // empty')

# Only trigger on scope files
source "$(dirname "$0")/scope-helpers.sh"
is_scope_file "$FILE_PATH" || exit 0

# Only trigger when marking something as done
echo "$NEW_STRING" | grep -qE "✅|Done" || exit 0

echo ""
echo "✅ Marking phase done — verify first:"
echo "   □ npm run type-check && npm run build"
echo "   □ Changes tested or reviewed"
echo ""

exit 0
