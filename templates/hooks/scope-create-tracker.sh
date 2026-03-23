#!/bin/bash
# scope-create-tracker.sh — Track when /scope create is invoked
# Trigger: PostToolUse:Skill
set -e

INPUT=$(cat)
echo "$INPUT" | jq empty 2>/dev/null || exit 0
SKILL=$(echo "$INPUT" | jq -r '.tool_input.skill // empty')

# Only track scope create invocations
[[ "$SKILL" == "scope-create" ]] || exit 0

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
mkdir -p "$PROJECT_DIR/.claude/metrics"
echo "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$PROJECT_DIR/.claude/metrics/.scope-create-session"

exit 0
