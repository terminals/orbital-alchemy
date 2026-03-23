#!/bin/bash
#
# scope-create-cleanup.sh — PostToolUse:Write cleanup
#
# After a successful Write, checks if the written file is a scope document.
# If so, removes the .scope-create-session marker to lift the write gate.
#
set -e

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
MARKER="$PROJECT_DIR/.claude/metrics/.scope-create-session"

# Fast exit: no marker = nothing to clean
[ -f "$MARKER" ] || exit 0

# Extract file_path from tool input
INPUT=$(cat)
echo "$INPUT" | jq empty 2>/dev/null || exit 0
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')
[ -z "$FILE_PATH" ] && exit 0

# Check if written file is a scope document in planning/
case "$FILE_PATH" in
  */scopes/planning/*.md)
    rm -f "$MARKER"
    HOOK_DIR="$(dirname "$0")"
    GATE_DATA=$(jq -n --arg scope_file "$FILE_PATH" '{scope_file: $scope_file}')
    "$HOOK_DIR/orbital-emit.sh" SCOPE_GATE_LIFTED "$GATE_DATA" 2>/dev/null &
    echo ""
    echo "Scope document written. Write gate lifted."
    echo "Remember: STOP here. Implementation is a separate session:"
    echo "  /scope-implement NNN"
    ;;
esac

exit 0
