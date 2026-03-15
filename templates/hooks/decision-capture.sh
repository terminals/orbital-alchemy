#!/bin/bash
# decision-capture.sh — Prompt to log decisions after user questions
# Trigger: PostToolUse:AskUserQuestion
# Nudge-style: always exits 0

source "$(dirname "$0")/scope-helpers.sh"
SCOPE=$(find_active_scope) || exit 0

echo ""
echo "📋 User decision made — consider logging in"
echo "   PROCESS > Decisions & Reasoning of $(basename "$SCOPE")"
echo ""

exit 0
