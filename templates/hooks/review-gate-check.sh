#!/bin/bash
# review-gate-check.sh — PreToolUse:Edit hook
#
# Blocks scope completion (status → completed) unless a valid review verdict
# exists with PASS verdict and session separation.
#
# Exit codes:
#   0 — Allow the edit
#   2 — Block (no verdict, failed verdict, or session separation violation)
set -euo pipefail

INPUT=$(cat)
echo "$INPUT" | jq empty 2>/dev/null || exit 0

FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')
NEW_STRING=$(echo "$INPUT" | jq -r '.tool_input.new_string // empty')

# Only enforce on scope files
source "$(dirname "$0")/scope-helpers.sh"
is_scope_file "$FILE_PATH" || exit 0

# Only enforce when status is being set to completed
echo "$NEW_STRING" | grep -qiE "status:.*completed" || exit 0

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
VERDICTS_DIR="$PROJECT_DIR/.claude/review-verdicts"

# ─── Extract scope number from filename ───
FILENAME=$(basename "$FILE_PATH" .md)
# Handle patterns: 083-platform-fees, 047a-critical-fixes
SCOPE_NUM=$(echo "$FILENAME" | grep -oE '^[0-9]+' | head -1)

if [ -z "$SCOPE_NUM" ]; then
  # Can't determine scope number — allow (template files, etc.)
  exit 0
fi

# Pad to 3 digits for verdict file lookup (force base-10 to avoid octal)
SCOPE_NUM_CLEAN=$((10#${SCOPE_NUM}))
PADDED=$(printf '%03d' "$SCOPE_NUM_CLEAN")
VERDICT_FILE="$VERDICTS_DIR/${PADDED}.json"

# ─── Check verdict file exists ───
if [ ! -f "$VERDICT_FILE" ]; then
  echo "" >&2
  echo "MUST_BLOCK: No review verdict found for scope $PADDED." >&2
  echo "   Run: /scope-post-review $PADDED" >&2
  echo "   The review gate must pass before a scope can be completed." >&2
  echo "   Verdict file expected at: .claude/review-verdicts/${PADDED}.json" >&2
  echo "   Format: {\"verdict\": \"PASS\", \"reviewSession\": \"uuid\", \"implementSession\": \"uuid\"}" >&2
  echo "" >&2
  exit 2
fi

# ─── Validate verdict is PASS ───
VERDICT=$(jq -r '.verdict // empty' "$VERDICT_FILE")
if [ "$VERDICT" != "PASS" ]; then
  echo "" >&2
  echo "MUST_BLOCK: Review verdict for scope $PADDED is '$VERDICT', not PASS." >&2
  echo "   Fix the failing criteria and re-run: /scope-post-review $PADDED" >&2
  echo "   Verdict file: .claude/review-verdicts/${PADDED}.json" >&2
  echo "" >&2
  exit 2
fi

# ─── Validate session separation ───
REVIEW_SESSION=$(jq -r '.reviewSession // empty' "$VERDICT_FILE")
IMPLEMENT_SESSION=$(jq -r '.implementSession // empty' "$VERDICT_FILE")

if [ -n "$REVIEW_SESSION" ] && [ -n "$IMPLEMENT_SESSION" ]; then
  if [ "$REVIEW_SESSION" = "$IMPLEMENT_SESSION" ]; then
    echo "" >&2
    echo "MUST_BLOCK: Session separation violation in verdict for scope $PADDED." >&2
    echo "   The review session ($REVIEW_SESSION) matches the implement session." >&2
    echo "   A different Claude Code session must run /scope-post-review (the user starts a new session)." >&2
    echo "" >&2
    exit 2
  fi
fi

# All checks passed
exit 0
