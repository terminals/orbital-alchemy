#!/bin/bash
# files-changed-summary.sh — Show planned vs actual files before completion
# Trigger: PreToolUse:Edit (scope status → complete)
# Nudge-style: always exits 0
set -e

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty' 2>/dev/null)
NEW_STRING=$(echo "$INPUT" | jq -r '.tool_input.new_string // empty' 2>/dev/null)

[[ "$FILE_PATH" == *"scopes/"* && "$FILE_PATH" == *.md ]] || exit 0
echo "$NEW_STRING" | grep -qiE "status:.*complete" || exit 0

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"

# Count file references in scope
PLANNED=$(grep -cE '`[^`]+\.(ts|tsx|js|jsx|css|sh)`' "$FILE_PATH" 2>/dev/null || echo "?")

# Count actual files changed in recent commits
ACTUAL=$(cd "$PROJECT_DIR" && git diff --name-only HEAD~5 2>/dev/null | wc -l | tr -d ' ')

echo ""
echo "📂 Scope completion summary for $(basename "$FILE_PATH"):"
echo "   Planned: ~$PLANNED file references in scope"
echo "   Changed: ~$ACTUAL files in recent commits"
echo "   Review PROCESS > Deviations from Spec if significant difference"
echo ""

exit 0
