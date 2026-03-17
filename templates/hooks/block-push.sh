#!/bin/bash
# block-push.sh — PreToolUse:Bash hook
#
# Blocks git push commands when /git-commit is the active skill.
# The flag file is managed by git-commit-guard.sh (PreToolUse:Skill).
set -euo pipefail

INPUT=$(cat)

TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty' 2>/dev/null)
[ -z "$TOOL_NAME" ] && TOOL_NAME="$CLAUDE_TOOL_NAME"
[ "$TOOL_NAME" != "Bash" ] && exit 0

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
FLAG="$PROJECT_DIR/.claude/.block-push-active"

# Only enforce when /git-commit is active
[ ! -f "$FLAG" ] && exit 0

COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null)
[ -z "$COMMAND" ] && COMMAND="$INPUT"

if echo "$COMMAND" | grep -qE '(^|[;&|]\s*)git\s+push'; then
  HOOK_DIR="$(dirname "$0")"
  "$HOOK_DIR/orbital-emit.sh" VIOLATION "{\"rule\":\"block-push\",\"outcome\":\"blocked\"}" 2>/dev/null || true
  echo "BLOCKED: /git-commit only commits locally — it does not push to remote."
  echo ""
  echo "Your job is done once the commit is created. Do not push."
  exit 2
fi

exit 0
