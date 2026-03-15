#!/bin/bash
#
# Claude Code SessionStart Hook: Session Initialization
#

INPUT=$(cat)
SOURCE=$(echo "$INPUT" | jq -r '.source // "startup"' 2>/dev/null)
[ -z "$SOURCE" ] && SOURCE="startup"

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"

# ─── Cache session ID for parallel-safe lookup by skills ───
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty' 2>/dev/null)
if [ -n "$SESSION_ID" ]; then
  SESSION_DIR="$PROJECT_DIR/.claude/metrics/.session-ids"
  mkdir -p "$SESSION_DIR"
  printf '%s' "$SESSION_ID" > "$SESSION_DIR/$PPID"
  # Clean up stale session files older than 24h
  find "$SESSION_DIR" -type f -mtime +1 -delete 2>/dev/null
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

  Rules: .claude/quick/rules.md | Git: /work save | Test: /test pre-commit

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

GIT WORKFLOW (NEVER push directly to main):

   /work save             → Routes to correct workflow
   /git pr-staging        → PR from feature branch to staging
   /git pr-production     → Release from staging to main

══════════════════════════════════════════════════════════════════════════════

EOF

# Emit session start event to Orbital dashboard (non-blocking)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
"$SCRIPT_DIR/orbital-emit.sh" SESSION_START "{\"source\":\"$SOURCE\"}" 2>/dev/null &

exit 0
