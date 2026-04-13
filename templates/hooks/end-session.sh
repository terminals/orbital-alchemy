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
# normal_exit=true tells the server this was a clean shutdown, so dispatches
# should resolve as "completed" rather than "abandoned".
SESSION_DATA="{\"pid\":$PID,\"normal_exit\":true"
# Include dispatch ID if this session was launched by Orbital dispatch
if [ -n "$ORBITAL_DISPATCH_ID" ]; then
  SESSION_DATA="${SESSION_DATA},\"dispatch_id\":\"$ORBITAL_DISPATCH_ID\""
fi
SESSION_DATA="${SESSION_DATA}}"
"$SCRIPT_DIR/orbital-emit.sh" SESSION_END "$SESSION_DATA" 2>/dev/null &

# Clean up cached session ID file (new glob format + old format)
rm -f "$PROJECT_DIR/.claude/metrics/.session-ids/${PID}"-* 2>/dev/null
rm -f "$PROJECT_DIR/.claude/metrics/.session-ids/$PID" 2>/dev/null

# Clean up skill guard flags
rm -f "$PROJECT_DIR/.claude/.block-push-active" 2>/dev/null
rm -f "$PROJECT_DIR/.claude/.implementing-session" 2>/dev/null

# SessionEnd hooks must never block termination
exit 0
