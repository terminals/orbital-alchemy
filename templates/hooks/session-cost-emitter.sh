#!/bin/bash
# session-cost-emitter.sh — Emit SESSION_COST event at SessionEnd
#
# Reads the session JSONL, sums token usage across ALL assistant-type lines
# (NOT just the last system line — token data is per-message on assistant lines).
# Uses grep + jq so it works on both macOS and Linux (avoids tail -r / tac).
#
# Emits:
#   SESSION_COST { session_id, input_tokens, output_tokens,
#                  cache_read_tokens, cache_creation_tokens,
#                  scope_id, phase }
#
# Fails soft: missing JSONL → exit 0 with no emission.
set -e

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/scope-helpers.sh"

# ─── Resolve session ID ───────────────────────────────────────
# Prefer stdin JSON (Claude Code provides session_id on SessionEnd),
# fall back to the cached lookup.
SESSION_ID=""
if [ ! -t 0 ]; then
  STDIN_JSON=$(cat 2>/dev/null || true)
  if [ -n "$STDIN_JSON" ]; then
    SESSION_ID=$(echo "$STDIN_JSON" | jq -r '.session_id // empty' 2>/dev/null || true)
  fi
fi
if [ -z "$SESSION_ID" ]; then
  SESSION_ID=$(bash "$SCRIPT_DIR/get-session-id.sh" 2>/dev/null || true)
fi
[ -z "$SESSION_ID" ] && exit 0

# ─── Find JSONL file ──────────────────────────────────────────
# Claude Code writes sessions to .claude/projects/<slug>/<uuid>.jsonl
JSONL=""
PROJECTS_ROOT="$HOME/.claude/projects"
if [ -d "$PROJECTS_ROOT" ]; then
  # Use find with -print -quit for cross-platform first-match behavior
  JSONL=$(find "$PROJECTS_ROOT" -type f -name "${SESSION_ID}.jsonl" -print 2>/dev/null | head -n 1)
fi
[ -z "$JSONL" ] || [ ! -s "$JSONL" ] && exit 0

# ─── Sum tokens across ALL assistant lines ────────────────────
# Filter to assistant lines first (cheap), then jq-sum the usage fields.
# reduce across a stream of numbers: `[.[]] | add // 0` on compact per-line output.
TOKEN_JSON=$(grep '"type":"assistant"' "$JSONL" 2>/dev/null \
  | jq -s '
      reduce .[] as $m (
        {input:0, output:0, cache_read:0, cache_creation:0};
        .input         += ($m.message.usage.input_tokens                // 0) |
        .output        += ($m.message.usage.output_tokens               // 0) |
        .cache_read    += ($m.message.usage.cache_read_input_tokens     // 0) |
        .cache_creation += ($m.message.usage.cache_creation_input_tokens // 0)
      )
    ' 2>/dev/null || echo '{"input":0,"output":0,"cache_read":0,"cache_creation":0}')

INPUT=$(echo "$TOKEN_JSON"          | jq -r '.input // 0')
OUTPUT=$(echo "$TOKEN_JSON"         | jq -r '.output // 0')
CACHE_READ=$(echo "$TOKEN_JSON"     | jq -r '.cache_read // 0')
CACHE_CREATION=$(echo "$TOKEN_JSON" | jq -r '.cache_creation // 0')

# No usage data → skip emission
if [ "$INPUT" = "0" ] && [ "$OUTPUT" = "0" ] && [ "$CACHE_READ" = "0" ] && [ "$CACHE_CREATION" = "0" ]; then
  exit 0
fi

# ─── Resolve active scope (optional) ──────────────────────────
SCOPE_ID=""
PHASE=""
ACTIVE_SCOPE=$(find_active_scope 2>/dev/null || true)
if [ -n "$ACTIVE_SCOPE" ] && [ -f "$ACTIVE_SCOPE" ]; then
  RAW_ID=$(basename "$ACTIVE_SCOPE" | grep -oE '^[0-9]+' || true)
  if [ -n "$RAW_ID" ]; then
    SCOPE_ID=$(echo "$RAW_ID" | sed 's/^0*//')
    [ -z "$SCOPE_ID" ] && SCOPE_ID="0"
  fi
  STATUS=$(get_frontmatter "$ACTIVE_SCOPE" "status" 2>/dev/null || true)
  [ -n "$STATUS" ] && PHASE="$STATUS"
fi

# ─── Build event data ─────────────────────────────────────────
EVENT_DATA=$(jq -n \
  --arg session_id "$SESSION_ID" \
  --argjson input "$INPUT" \
  --argjson output "$OUTPUT" \
  --argjson cache_read "$CACHE_READ" \
  --argjson cache_creation "$CACHE_CREATION" \
  --arg scope_id "$SCOPE_ID" \
  --arg phase "$PHASE" \
  '{
    session_id: $session_id,
    input_tokens: $input,
    output_tokens: $output,
    cache_read_tokens: $cache_read,
    cache_creation_tokens: $cache_creation,
    scope_id: (if $scope_id == "" then null else ($scope_id | tonumber) end),
    phase: (if $phase == "" then null else $phase end)
  }')

# ─── Emit (non-blocking) ──────────────────────────────────────
EMIT_ARGS=(SESSION_COST "$EVENT_DATA" --session "$SESSION_ID")
if [ -n "$SCOPE_ID" ]; then
  EMIT_ARGS+=(--scope "$SCOPE_ID")
fi
"$SCRIPT_DIR/orbital-emit.sh" "${EMIT_ARGS[@]}" 2>/dev/null &

exit 0
