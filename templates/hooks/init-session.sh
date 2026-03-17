#!/bin/bash
#
# Claude Code SessionStart Hook: Session Initialization
#
set -e

INPUT=$(cat)
SOURCE=$(echo "$INPUT" | jq -r '.source // "startup"' 2>/dev/null)
[ -z "$SOURCE" ] && SOURCE="startup"

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"

# ─── Cache session ID for parallel-safe lookup by skills ───
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty' 2>/dev/null)
if [ -n "$SESSION_ID" ]; then
  SESSION_DIR="$PROJECT_DIR/.claude/metrics/.session-ids"
  mkdir -p "$SESSION_DIR"
  printf '%s' "$SESSION_ID" > "$SESSION_DIR/${PPID}-${SESSION_ID}"
  # Clean up stale session files older than 4h with PID liveness check
  find "$SESSION_DIR" -type f -mmin +240 2>/dev/null | while IFS= read -r f; do
    STALE_PID=$(basename "$f" | cut -d'-' -f1)
    if [ -n "$STALE_PID" ] && ! kill -0 "$STALE_PID" 2>/dev/null; then
      rm -f "$f"
    fi
  done
fi

# Clean stale scope-create marker from previous sessions
rm -f "$PROJECT_DIR/.claude/metrics/.scope-create-session"

# Resolve project name from orbital.config.json or git repo name
PROJECT_NAME=$(cat "$PROJECT_DIR/.claude/orbital.config.json" 2>/dev/null | grep '"projectName"' | sed 's/.*: *"//;s/".*//' || basename "$(git -C "$PROJECT_DIR" rev-parse --show-toplevel 2>/dev/null)" 2>/dev/null || echo "Project")

# Abbreviated banner for resumed/compacted sessions
if [ "$SOURCE" = "resume" ] || [ "$SOURCE" = "compact" ]; then
  cat << EOF

══════════════════════════════════════════════════════════════════════════════
${PROJECT_NAME} SESSION RESUMED
══════════════════════════════════════════════════════════════════════════════

  Rules: .claude/quick/rules.md | Git: /git-commit | Test: /test-checks

══════════════════════════════════════════════════════════════════════════════

EOF
  exit 0
fi

# Full banner for new/cleared sessions
cat << EOF

══════════════════════════════════════════════════════════════════════════════
${PROJECT_NAME} SESSION INITIALIZED
══════════════════════════════════════════════════════════════════════════════

KEY REFERENCES:

   Entry point:    .claude/INDEX.md
   All rules:      .claude/quick/rules.md
   Anti-patterns:  .claude/anti-patterns/dangerous-shortcuts.md

GIT WORKFLOW:

   /git-commit   → Commit work
   /git-main     → Push to main (or /git-staging, /git-production for Gitflow)

══════════════════════════════════════════════════════════════════════════════

EOF

# Emit session start event to Orbital dashboard (non-blocking)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
"$SCRIPT_DIR/orbital-emit.sh" SESSION_START "{\"source\":\"$SOURCE\"}" 2>/dev/null &

exit 0
