#!/bin/bash
# scope-gate.sh — After plan approval, instruct agent to write scope doc
# Trigger: PostToolUse:ExitPlanMode
# Only fires when /scope create was invoked this session

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
MARKER="$PROJECT_DIR/.claude/metrics/.scope-create-session"

# Only act if /scope create was invoked this session
[ -f "$MARKER" ] || exit 0

# NOTE: Marker is NOT deleted here — scope-create-gate.sh (PreToolUse)
# blocks non-scope writes until the scope document is created.
# scope-create-cleanup.sh (PostToolUse) removes the marker after the scope is written.

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  SCOPE DOCUMENT REQUIRED"
echo ""
echo "  Write the scope document now using your plan."
echo "  Follow the create skill steps:"
echo "    1. Find next scope number"
echo "    2. Copy template from scopes/_template.md"
echo "    3. Fill SPECIFICATION from your plan"
echo "    4. Set status: planning, spec_locked: true"
echo ""
echo "  ⛔ Writes to non-scope files are BLOCKED until"
echo "     the scope document is written."
echo ""
echo "  Then STOP. Implementation is a separate session:"
echo "    /scope implement NNN"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

exit 0
