#!/bin/bash
# exploration-logger.sh — Remind to log exploration findings periodically
# Trigger: PostToolUse:Grep|Glob (search operations)
# Nudge-style: always exits 0

INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty' 2>/dev/null)
[[ "$TOOL_NAME" == "Grep" || "$TOOL_NAME" == "Glob" ]] || exit 0

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
COUNTER_FILE="$PROJECT_DIR/.claude/metrics/.exploration-count"
mkdir -p "$(dirname "$COUNTER_FILE")"

COUNT=$(cat "$COUNTER_FILE" 2>/dev/null || echo "0")
COUNT=$((COUNT + 1))
echo "$COUNT" > "$COUNTER_FILE"

# Remind every 25 searches
if [ $((COUNT % 25)) -eq 0 ]; then
  source "$(dirname "$0")/scope-helpers.sh"
  SCOPE=$(find_active_scope) || exit 0

  echo ""
  echo "🔍 $COUNT searches this session — log key findings in"
  echo "   PROCESS > Exploration Log of $(basename "$SCOPE")"
  echo ""
fi

exit 0
