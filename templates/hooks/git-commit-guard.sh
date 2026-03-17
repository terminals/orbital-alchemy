#!/bin/bash
# git-commit-guard.sh — PreToolUse:Skill hook
#
# Sets a flag when /git-commit is invoked so block-push.sh can
# block git push during that skill. Clears the flag for any other skill.
set -euo pipefail

INPUT=$(cat)

SKILL=$(echo "$INPUT" | jq -r '.tool_input.skill // empty' 2>/dev/null)
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
FLAG="$PROJECT_DIR/.claude/.block-push-active"

if [ "$SKILL" = "git-commit" ]; then
  touch "$FLAG"
else
  rm -f "$FLAG"
fi

exit 0
