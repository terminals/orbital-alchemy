#!/bin/bash
# Agent Trigger Hook - Auto-invokes agent review points when editing sensitive files
#
# This PreToolUse hook detects when Edit/Write operations target files matching
# patterns in agent-triggers.json, then outputs relevant review points to guide
# the AI assistant during security-sensitive modifications.
set -e

INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty' 2>/dev/null)

# Only process Edit and Write tools
if [ "$TOOL_NAME" != "Edit" ] && [ "$TOOL_NAME" != "Write" ]; then
  exit 0
fi

# Require jq for JSON parsing and output
command -v jq >/dev/null 2>&1 || exit 0

FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty' 2>/dev/null)
[ -z "$FILE_PATH" ] && exit 0

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
RELATIVE_PATH="${FILE_PATH#$PROJECT_DIR/}"
CONFIG_PATH="$PROJECT_DIR/.claude/config/agent-triggers.json"
[ ! -f "$CONFIG_PATH" ] && exit 0

# Find matching patterns
MATCHED_AGENTS=""
MATCHED_POINTS=""
MODE="FULL"

while IFS= read -r pattern_data; do
  PATTERN=$(echo "$pattern_data" | jq -r '.pattern')

  if echo "$RELATIVE_PATH" | grep -qE "$PATTERN"; then
    # Collect agents (deduped)
    for agent in $(echo "$pattern_data" | jq -r '.agents[]' 2>/dev/null); do
      echo "$MATCHED_AGENTS" | grep -q "$agent" || MATCHED_AGENTS="$MATCHED_AGENTS $agent"
    done

    # SECURITY mode takes precedence
    [ "$(echo "$pattern_data" | jq -r '.mode')" = "SECURITY" ] && MODE="SECURITY"

    # Collect key points
    MATCHED_POINTS="$MATCHED_POINTS$(echo "$pattern_data" | jq -r '.keyPoints[]' 2>/dev/null | sed 's/^/\n/')"
  fi
done < <(jq -c '.patterns[]' "$CONFIG_PATH")

# No matches = silent pass
[ -z "$MATCHED_AGENTS" ] && exit 0

# Build emoji string
EMOJIS=""
for agent in $MATCHED_AGENTS; do
  EMOJI=$(jq -r ".agentEmojis[\"$agent\"] // \"?\"" "$CONFIG_PATH")
  EMOJIS="$EMOJIS$EMOJI "
done

# Truncate file path for display if too long
DISPLAY_PATH="$RELATIVE_PATH"
if [ ${#DISPLAY_PATH} -gt 55 ]; then
  DISPLAY_PATH="...${DISPLAY_PATH: -52}"
fi

# Output system message
echo ""
if [ "$MODE" = "SECURITY" ]; then
  echo "╔══════════════════════════════════════════════════════════════════╗"
  echo "║ 🔐 SECURITY MODE ACTIVATED                                        ║"
else
  echo "╔══════════════════════════════════════════════════════════════════╗"
  echo "║ 🎯 AGENT REVIEW TRIGGERED                                         ║"
fi
echo "╠══════════════════════════════════════════════════════════════════╣"
printf "║  File: %-58s ║\n" "$DISPLAY_PATH"
printf "║  Agents: %-56s ║\n" "$EMOJIS"
echo "╠══════════════════════════════════════════════════════════════════╣"
echo "║  📋 KEY REVIEW POINTS:                                            ║"
echo "$MATCHED_POINTS" | sort -u | while read -r point; do
  if [ -n "$point" ]; then
    # Truncate point if too long
    if [ ${#point} -gt 60 ]; then
      point="${point:0:57}..."
    fi
    printf "║  □ %-62s║\n" "$point"
  fi
done
echo "╚══════════════════════════════════════════════════════════════════╝"
echo ""

# Emit agent trigger event to Orbital dashboard (non-blocking)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
AGENTS_JSON=$(echo "$MATCHED_AGENTS" | xargs | tr ' ' '\n' | jq -R . | jq -s .)
"$SCRIPT_DIR/orbital-emit.sh" AGENT_STARTED "{\"agents\":$AGENTS_JSON,\"file\":\"$RELATIVE_PATH\",\"mode\":\"$MODE\"}" 2>/dev/null &

exit 0
