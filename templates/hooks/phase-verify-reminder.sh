#!/bin/bash
# phase-verify-reminder.sh — Remind to verify before marking phase done
# Trigger: PreToolUse:Edit (scope file with completion marker)
# Nudge-style: always exits 0

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty' 2>/dev/null)
NEW_STRING=$(echo "$INPUT" | jq -r '.tool_input.new_string // empty' 2>/dev/null)

# Only trigger on scope files
[[ "$FILE_PATH" == *"scopes/"* && "$FILE_PATH" == *.md ]] || exit 0

# Only trigger when marking something as done
echo "$NEW_STRING" | grep -qE "✅|Done" || exit 0

echo ""
echo "✅ Marking phase done — verify first:"
echo "   □ npm run type-check && npm run build"
echo "   □ Changes tested or reviewed"
echo ""

exit 0
