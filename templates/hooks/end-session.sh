#!/bin/bash
#
# Claude Code SessionEnd Hook: Session Cleanup
#
# Emits SESSION_END event to Orbital dashboard so active dispatch indicators
# are cleared when a Claude session exits normally.
#
set -e

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PID="$PPID"

# Emit session end event to Orbital dashboard (non-blocking)
"$SCRIPT_DIR/orbital-emit.sh" SESSION_END "{\"pid\":$PID}" 2>/dev/null &

# Clean up cached session ID file (new glob format + old format)
rm -f "$PROJECT_DIR/.claude/metrics/.session-ids/${PID}"-* 2>/dev/null
rm -f "$PROJECT_DIR/.claude/metrics/.session-ids/$PID" 2>/dev/null

# Clean up skill guard flags
rm -f "$PROJECT_DIR/.claude/.block-push-active" 2>/dev/null

# SessionEnd hooks must never block termination
exit 0
