#!/bin/bash
# git-commit-guard.sh — PreToolUse:Skill hook
#
# Manages skill-scoped flag files so block-push.sh can enforce
# stage-specific restrictions:
#   /git-commit      → .block-push-active    (blocks git push)
#   /scope-implement → .implementing-session  (blocks git commit/add)
# Clears flags when any other skill is invoked.
set -euo pipefail

INPUT=$(cat)
echo "$INPUT" | jq empty 2>/dev/null || exit 0

SKILL=$(echo "$INPUT" | jq -r '.tool_input.skill // empty')
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"

PUSH_FLAG="$PROJECT_DIR/.claude/.block-push-active"
IMPL_FLAG="$PROJECT_DIR/.claude/.implementing-session"

# /git-commit → block pushes during commit skill
# Store parent PID so block-push.sh can detect stale flags from dead sessions
if [ "$SKILL" = "git-commit" ]; then
  echo "$PPID" > "$PUSH_FLAG"
else
  rm -f "$PUSH_FLAG"
fi

# /scope-implement → block commits during implementing
if [ "$SKILL" = "scope-implement" ]; then
  echo "$PPID" > "$IMPL_FLAG"
else
  rm -f "$IMPL_FLAG"
fi

exit 0
