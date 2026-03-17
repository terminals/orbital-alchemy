#!/bin/bash
# get-session-id.sh — Parallel-safe session UUID lookup
#
# Reads the session ID cached by init-session.sh at session start.
# Walks up the process tree from $PPID to find the session file,
# which handles callers nested at any depth (e.g. subagent shells).
#
# Usage (from skills via Bash tool):
#   SESSION_UUID=$(bash .claude/hooks/get-session-id.sh)
#
# Exit codes:
#   0 — Success, UUID printed to stdout
#   1 — Session ID not found
set -e

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
SESSION_DIR="$PROJECT_DIR/.claude/metrics/.session-ids"

# Walk up the process tree checking each ancestor PID.
# init-session.sh keys on $PPID (Claude Code's PID), but callers
# may be nested deeper (e.g. Skill tool -> Bash tool -> this script).
CURRENT_PID=$PPID
VISITED=""
while [ "$CURRENT_PID" -gt 1 ] 2>/dev/null; do
  # Cycle detection
  case " $VISITED " in
    *" $CURRENT_PID "*) break ;;
  esac
  VISITED="$VISITED $CURRENT_PID"

  # New format: {PID}-{UUID}
  for f in "$SESSION_DIR/${CURRENT_PID}"-*; do
    if [ -f "$f" ]; then
      cat "$f"
      exit 0
    fi
  done
  # Old format: just {PID}
  if [ -f "$SESSION_DIR/$CURRENT_PID" ]; then
    cat "$SESSION_DIR/$CURRENT_PID"
    exit 0
  fi
  # Move to parent
  CURRENT_PID=$(ps -o ppid= -p "$CURRENT_PID" 2>/dev/null | tr -d ' ')
  [ -z "$CURRENT_PID" ] && break
done

echo "ERROR: No session ID found in process tree from PID $PPID. Was init-session.sh invoked?" >&2
exit 1
