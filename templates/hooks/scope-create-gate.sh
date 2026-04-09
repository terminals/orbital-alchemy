#!/bin/bash
#
# scope-create-gate.sh — PreToolUse:Write|Edit blocker
#
# Blocks writes to non-scope files while a /scope create session is active.
# The marker (.scope-create-session) is set by scope-create-tracker.sh and
# removed by scope-create-cleanup.sh after the scope document is written.
#
# Exit codes: 0 = allow, 2 = block
set -e

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
MARKER="$PROJECT_DIR/.claude/metrics/.scope-create-session"

# Fast exit: no marker = no gate
[ -f "$MARKER" ] || exit 0

# Optional: auto-expire stale markers (older than 2 hours)
if [ "$(uname)" = "Darwin" ]; then
  MARKER_AGE=$(( $(date +%s) - $(stat -f %m "$MARKER") ))
else
  MARKER_AGE=$(( $(date +%s) - $(stat -c %Y "$MARKER") ))
fi
if [ "$MARKER_AGE" -gt 900 ]; then
  rm -f "$MARKER"
  exit 0
fi

# Extract file_path from tool input
INPUT=$(cat)
echo "$INPUT" | jq empty 2>/dev/null || exit 0
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

# If no file_path found, allow (defensive — don't break unknown tool shapes)
[ -z "$FILE_PATH" ] && exit 0

# ─── Allowlisted paths ───
# 1. Scope files
case "$FILE_PATH" in
  */scopes/*) exit 0 ;;
esac

# 2. Plan files (both project-local and home directory)
case "$FILE_PATH" in
  */.claude/plans/*) exit 0 ;;
esac

# 3. Claude project config files
case "$FILE_PATH" in
  "$PROJECT_DIR"/.claude/*) exit 0 ;;
esac

# 4. Home-directory Claude plans
HOME_DIR="${HOME:-/Users/$(whoami)}"
case "$FILE_PATH" in
  "$HOME_DIR"/.claude/plans/*) exit 0 ;;
esac

# ─── Block everything else ───
HOOK_DIR="$(dirname "$0")"
VIOLATION_DATA=$(jq -n --arg rule "scope-create-gate" --arg file "$FILE_PATH" --arg outcome "blocked" '{rule: $rule, file: $file, outcome: $outcome}')
"$HOOK_DIR/orbital-emit.sh" VIOLATION "$VIOLATION_DATA" 2>/dev/null &

# Resolve entry status from workflow manifest
source "$HOOK_DIR/scope-helpers.sh" 2>/dev/null || true
ENTRY="${WORKFLOW_ENTRY_STATUS:-planning}"

echo "BLOCKED: Write to non-scope file during /scope create"
echo ""
echo "  File: $FILE_PATH"
echo ""
echo "  You must write the scope document first:"
echo "    1. Find next scope number (highest NNN in scopes/**/*.md + 1, zero-padded to 3 digits)"
echo "    2. Copy template from scopes/_template.md"
echo "    3. Write to scopes/$ENTRY/NNN-short-description.md"
echo ""
echo "  After the scope document is written, the gate lifts automatically."
echo "  To abandon: delete .claude/metrics/.scope-create-session"
exit 2
