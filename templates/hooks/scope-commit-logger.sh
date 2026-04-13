#!/bin/bash
# scope-commit-logger.sh — Suggest Implementation Log entry after commits
# Trigger: PostToolUse:Bash (git commit detected)
# Nudge-style: always exits 0
set -e

INPUT=$(cat)
echo "$INPUT" | jq empty 2>/dev/null || exit 0

COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')
echo "$COMMAND" | grep -qE "git commit" || exit 0

# Check commit succeeded
EXIT_CODE=$(echo "$INPUT" | jq -r '.tool_result.exitCode // .tool_result.exit_code // "0"')
[ "$EXIT_CODE" != "0" ] && exit 0

source "$(dirname "$0")/scope-helpers.sh"
SCOPE=$(find_active_scope) || exit 0

COMMIT_HASH=$(cd "$SCOPE_PROJECT_DIR" && git rev-parse --short HEAD 2>/dev/null || true)
COMMIT_MSG=$(cd "$SCOPE_PROJECT_DIR" && git log -1 --pretty=format:%s 2>/dev/null || true)
SCOPE_ID=$(echo "$(basename "$SCOPE")" | grep -oE '[0-9]+' | head -1)

# Emit COMMIT event to Orbital dashboard
HOOK_DIR="$(dirname "$0")"
COMMIT_DATA=$(jq -n --arg hash "$COMMIT_HASH" --arg message "$COMMIT_MSG" '{hash: $hash, message: $message}')
AGENT_DATA=$(jq -n --arg outcome "committed" --arg commit_hash "$COMMIT_HASH" '{outcome: $outcome, commit_hash: $commit_hash}')
"$HOOK_DIR/orbital-emit.sh" COMMIT "$COMMIT_DATA" --scope "$SCOPE_ID" 2>/dev/null &
"$HOOK_DIR/orbital-emit.sh" AGENT_COMPLETED "$AGENT_DATA" --scope "$SCOPE_ID" 2>/dev/null &

echo ""
echo "📝 Consider updating Implementation Log in $(basename "$SCOPE"):"
echo "   Commit: $COMMIT_HASH"
echo "   Add: phase, what changed, issues encountered"
echo ""

exit 0
