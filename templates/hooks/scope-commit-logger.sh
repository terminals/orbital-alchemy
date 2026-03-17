#!/bin/bash
# scope-commit-logger.sh — Suggest Implementation Log entry after commits
# Trigger: PostToolUse:Bash (git commit detected)
# Nudge-style: always exits 0
set -e

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null)
echo "$COMMAND" | grep -qE "git commit" || exit 0

# Check commit succeeded
EXIT_CODE=$(echo "$INPUT" | jq -r '.tool_result.exitCode // .tool_result.exit_code // "0"' 2>/dev/null)
[ "$EXIT_CODE" != "0" ] && exit 0

source "$(dirname "$0")/scope-helpers.sh"
SCOPE=$(find_active_scope) || exit 0

COMMIT_HASH=$(cd "$SCOPE_PROJECT_DIR" && git rev-parse --short HEAD 2>/dev/null || true)
COMMIT_MSG=$(cd "$SCOPE_PROJECT_DIR" && git log -1 --pretty=format:%s 2>/dev/null || true)
SCOPE_ID=$(echo "$(basename "$SCOPE")" | grep -oE '[0-9]+' | head -1)

# Emit COMMIT event to Orbital dashboard
HOOK_DIR="$(dirname "$0")"
"$HOOK_DIR/orbital-emit.sh" COMMIT "{\"hash\":\"$COMMIT_HASH\",\"message\":\"$COMMIT_MSG\"}" --scope "$SCOPE_ID"
"$HOOK_DIR/orbital-emit.sh" AGENT_COMPLETED "{\"outcome\":\"committed\",\"commit_hash\":\"$COMMIT_HASH\"}" --scope "$SCOPE_ID" &

echo ""
echo "📝 Consider updating Implementation Log in $(basename "$SCOPE"):"
echo "   Commit: $COMMIT_HASH"
echo "   Add: phase, what changed, issues encountered"
echo ""

exit 0
