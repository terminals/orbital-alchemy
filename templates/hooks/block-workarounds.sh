#!/bin/bash
#
# Claude Code PreToolUse Hook: Block Dangerous Workarounds
#
# Blocks two critical patterns that bypass safety:
# 1. --no-verify (skips pre-commit hooks)
# 2. Direct push to main (bypasses PR workflow)
#

INPUT=$(cat)

TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty' 2>/dev/null)
[ -z "$TOOL_NAME" ] && TOOL_NAME="$CLAUDE_TOOL_NAME"

# Only process Bash tool calls
[ "$TOOL_NAME" != "Bash" ] && exit 0

COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null)
[ -z "$COMMAND" ] && COMMAND="$INPUT"

HOOK_DIR="$(dirname "$0")"

# Override mechanism: OVERRIDE_RULE="rule-name:reason"
# When set, logs the override and allows the command through
if [ -n "$OVERRIDE_RULE" ]; then
  RULE_NAME="${OVERRIDE_RULE%%:*}"
  REASON="${OVERRIDE_RULE#*:}"
  "$HOOK_DIR/orbital-emit.sh" OVERRIDE "{\"rule\":\"$RULE_NAME\",\"reason\":\"$REASON\",\"outcome\":\"overridden\"}"
  echo "OVERRIDE: Rule '$RULE_NAME' overridden (reason: $REASON)"
  exit 0
fi

# Pattern 1: --no-verify flag
if echo "$COMMAND" | grep -qE "\-\-no-verify"; then
  "$HOOK_DIR/orbital-emit.sh" VIOLATION "{\"rule\":\"no-verify\",\"pattern\":\"--no-verify\",\"outcome\":\"blocked\"}"
  echo "BLOCKED: Attempting to skip verification hooks"
  echo ""
  echo "Fix the failing checks instead:"
  echo "  cd backend && npm run type-check"
  echo "  cd backend && npm run lint"
  echo ""
  echo "If a check is genuinely wrong, discuss with the user."
  exit 2
fi

# Pattern 2: Direct push to main
if echo "$COMMAND" | grep -qE "git push.*(origin[[:space:]]+main|:main([[:space:]]|$)|HEAD:main)"; then
  "$HOOK_DIR/orbital-emit.sh" VIOLATION "{\"rule\":\"push-main\",\"pattern\":\"push to main\",\"outcome\":\"blocked\"}"
  echo "BLOCKED: Direct push to main is forbidden"
  echo ""
  echo "Use /work save to route to the proper workflow:"
  echo "  - Creates feature branch if needed"
  echo "  - Opens PR to staging (not main)"
  echo "  - Ensures CI runs before merge"
  exit 2
fi

exit 0
