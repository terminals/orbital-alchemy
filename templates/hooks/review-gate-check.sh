#!/bin/bash
# review-gate-check.sh — PreToolUse:Edit hook
#
# Blocks scope completion (status → completed) unless a valid review verdict
# exists with PASS verdict and session separation.
#
# Exit codes:
#   0 — Allow the edit
#   2 — Block (no verdict, failed verdict, or session separation violation)

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty' 2>/dev/null)
NEW_STRING=$(echo "$INPUT" | jq -r '.tool_input.new_string // empty' 2>/dev/null)

# Only enforce on scope files
[[ "$FILE_PATH" == *"scopes/"* && "$FILE_PATH" == *.md ]] || exit 0

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

# Pad to 3 digits for verdict file lookup
# Strip leading zeros first to avoid bash printf treating them as octal
SCOPE_NUM_CLEAN=$(echo "$SCOPE_NUM" | sed 's/^0*//')
[ -z "$SCOPE_NUM_CLEAN" ] && SCOPE_NUM_CLEAN="0"
PADDED=$(printf '%03d' "$SCOPE_NUM_CLEAN")
VERDICT_FILE="$VERDICTS_DIR/${PADDED}.json"

# ─── Check verdict file exists ───
if [ ! -f "$VERDICT_FILE" ]; then
  echo ""
  echo "MUST_BLOCK: No review verdict found for scope $PADDED."
  echo "   Run: /scope review-gate $PADDED"
  echo "   The review gate must pass before a scope can be completed."
  echo ""
  exit 2
fi

# ─── Validate verdict is PASS ───
VERDICT=$(jq -r '.verdict // empty' "$VERDICT_FILE" 2>/dev/null)
if [ "$VERDICT" != "PASS" ]; then
  echo ""
  echo "MUST_BLOCK: Review verdict for scope $PADDED is '$VERDICT', not PASS."
  echo "   Fix the failing criteria and re-run: /scope review-gate $PADDED"
  echo ""
  exit 2
fi

# ─── Validate session separation ───
REVIEW_SESSION=$(jq -r '.reviewSession // empty' "$VERDICT_FILE" 2>/dev/null)
IMPLEMENT_SESSION=$(jq -r '.implementSession // empty' "$VERDICT_FILE" 2>/dev/null)

if [ -n "$REVIEW_SESSION" ] && [ -n "$IMPLEMENT_SESSION" ]; then
  if [ "$REVIEW_SESSION" = "$IMPLEMENT_SESSION" ]; then
    echo ""
    echo "MUST_BLOCK: Session separation violation in verdict for scope $PADDED."
    echo "   The review session ($REVIEW_SESSION) matches the implement session."
    echo "   A different session must run the review gate."
    echo ""
    exit 2
  fi
fi

# All checks passed
exit 0
