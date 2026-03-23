#!/bin/bash
# agent-team-gate.sh — Block skills requiring agent teams if not enabled
# Trigger: PreToolUse:Skill
# Checks CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS before allowing team-based skills
set -euo pipefail

INPUT=$(cat)
echo "$INPUT" | jq empty 2>/dev/null || exit 0

SKILL=$(echo "$INPUT" | jq -r '.tool_input.skill // empty')
[ -z "$SKILL" ] && exit 0

# Only gate skills that require agent teams
case "$SKILL" in
  scope-fix-review) ;;
  *) exit 0 ;;
esac

# Check if agent teams are enabled
if [ "${CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS:-}" != "1" ]; then
  echo "BLOCKED: /$SKILL requires Claude Code Agent Teams to be enabled."
  echo ""
  echo "Enable it now by adding to ~/.claude/settings.json:"
  echo '  { "env": { "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1" } }'
  echo ""
  echo "Read ~/.claude/settings.json, merge the env key above into it,"
  echo "write it back, then re-run: /$SKILL"
  exit 2
fi

exit 0
