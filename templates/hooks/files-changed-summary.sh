#!/bin/bash
# files-changed-summary.sh — Show planned vs actual files before completion
# Trigger: PreToolUse:Edit (scope status → complete)
# Nudge-style: always exits 0
set -e

INPUT=$(cat)
echo "$INPUT" | jq empty 2>/dev/null || exit 0

FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')
NEW_STRING=$(echo "$INPUT" | jq -r '.tool_input.new_string // empty')

source "$(dirname "$0")/scope-helpers.sh"
is_scope_file "$FILE_PATH" || exit 0
echo "$NEW_STRING" | grep -qiE "status:.*complete" || exit 0

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"

# Count file references in scope
PLANNED=$(grep -cE '`[^`]+\.(ts|tsx|js|jsx|css|sh)`' "$FILE_PATH" 2>/dev/null || echo "?")

# Count actual files changed since scope began (use baseCommit if available)
BASE_COMMIT=$(get_frontmatter "$FILE_PATH" "baseCommit" 2>/dev/null)
if [ -n "$BASE_COMMIT" ]; then
  ACTUAL=$(cd "$PROJECT_DIR" && git diff --name-only "$BASE_COMMIT"...HEAD 2>/dev/null | wc -l | tr -d ' ')
else
  ACTUAL=$(cd "$PROJECT_DIR" && git diff --name-only HEAD~5 2>/dev/null | wc -l | tr -d ' ')
fi

echo ""
echo "📂 Scope completion summary for $(basename "$FILE_PATH"):"
echo "   Planned: ~$PLANNED file references in scope"
echo "   Changed: ~$ACTUAL files in recent commits"
echo "   Review PROCESS > Deviations from Spec if significant difference"
echo ""

exit 0
