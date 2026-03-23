#!/bin/bash
# block-push.sh — PreToolUse:Bash hook
#
# Enforces stage-specific git restrictions using flag files
# managed by git-commit-guard.sh (PreToolUse:Skill):
#   .block-push-active    → blocks git push   (during /git-commit)
#   .implementing-session → blocks git commit/add (during /scope-implement)
set -euo pipefail

INPUT=$(cat)

echo "$INPUT" | jq empty 2>/dev/null || exit 0

TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty')
[ -z "$TOOL_NAME" ] && TOOL_NAME="$CLAUDE_TOOL_NAME"
[ "$TOOL_NAME" != "Bash" ] && exit 0

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
PUSH_FLAG="$PROJECT_DIR/.claude/.block-push-active"
IMPL_FLAG="$PROJECT_DIR/.claude/.implementing-session"

COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')
[ -z "$COMMAND" ] && COMMAND="$INPUT"

HOOK_DIR="$(dirname "$0")"

# Build workflow-specific pipeline hint from manifest (only on block path)
_pipeline_after() {
  local start="$1" found=false result=""
  source "$HOOK_DIR/scope-helpers.sh" 2>/dev/null || return
  for s in $WORKFLOW_STATUSES; do
    if [ "$found" = true ]; then
      result="${result:+$result → }$s"
    fi
    [ "$s" = "$start" ] && found=true
  done
  echo "$result"
}

# Block git push during /git-commit
if [ -f "$PUSH_FLAG" ]; then
  if echo "$COMMAND" | grep -qE '(^|[;&|]\s*)git\s+push'; then
    "$HOOK_DIR/orbital-emit.sh" VIOLATION '{"rule":"block-push","outcome":"blocked"}' 2>/dev/null || true
    REMAINING=$(_pipeline_after "completed")
    echo "BLOCKED: /git-commit only commits locally — it does not push to remote."
    echo ""
    echo "Your job is done once the commit is created. Do not push."
    echo "The next workflow step pushes to: ${REMAINING:-the next stage}."
    exit 2
  fi
fi

# Block git commit/add during /scope-implement
if [ -f "$IMPL_FLAG" ]; then
  if echo "$COMMAND" | grep -qE '(^|[;&|]\s*)git\s+(commit|add)'; then
    "$HOOK_DIR/orbital-emit.sh" VIOLATION '{"rule":"block-commit-implementing","outcome":"blocked"}' 2>/dev/null || true
    REMAINING=$(_pipeline_after "implementing")
    echo "BLOCKED: Implementing sessions must not commit."
    echo ""
    echo "Code changes stay uncommitted until the review pipeline handles them."
    echo "Remaining pipeline: ${REMAINING:-review → completed}."
    exit 2
  fi
fi

exit 0
