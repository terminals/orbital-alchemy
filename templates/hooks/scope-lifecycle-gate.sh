#!/bin/bash
# scope-lifecycle-gate.sh — PreToolUse:Bash hook
#
# Intercepts git commit / git push / gh pr create and records session
# UUIDs on active scopes before the command executes.
#
# Session recording:
#   git commit (on feature branch) → records "commit" session on active scope
#   git push to staging / gh pr --base staging → transitions dev → staging (with BATCH_SCOPE_IDS)
#   git push to main / gh pr --base main → transitions staging → production (with BATCH_SCOPE_IDS)
#
# NOTE: completed → dev auto-transition removed (2026-03-04).
# Use /git-dev to explicitly merge feature→dev.
#
# BATCH_SCOPE_IDS must be set (e.g. BATCH_SCOPE_IDS=093,094) for any
# transition to occur. Without it, a warning is printed and no files move.
#
# Exit codes:
#   0 — Allow the command to proceed
#   2 — Block (never used here; transitions are advisory)
set -euo pipefail

INPUT=$(cat)
echo "$INPUT" | jq empty 2>/dev/null || exit 0
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

# ─── Fast exit: only process git commit, git push, gh pr create ───
echo "$COMMAND" | grep -qE '^git (commit|push)|^gh pr create' || exit 0

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"

# ─── Resolve session UUID (from hook input or process tree) ───
SESSION_UUID=$(echo "$INPUT" | jq -r '.session_id // empty')
if [ -z "$SESSION_UUID" ]; then
  SESSION_UUID=$("$SCRIPT_DIR/get-session-id.sh" 2>/dev/null || true)
fi

source "$SCRIPT_DIR/scope-helpers.sh"

# ─── Determine current branch ───
BRANCH=$(cd "$PROJECT_DIR" && git branch --show-current 2>/dev/null || true)

# ─── git commit: record session on active scope ───
if echo "$COMMAND" | grep -qE '^git commit'; then
  # Only on branches matching commit pattern from manifest
  if [[ "$BRANCH" =~ $WORKFLOW_COMMIT_BRANCHES ]]; then
    # Record session on active scopes AND review scopes
    # Note: scopes are gitignored, so no git add needed
    if [ -n "$SESSION_UUID" ]; then
      ACTIVE_SCOPE=$(find_active_scope 2>/dev/null || true)
      if [ -n "$ACTIVE_SCOPE" ] && [ -f "$ACTIVE_SCOPE" ]; then
        append_session_uuid "$ACTIVE_SCOPE" "commit" "$SESSION_UUID"
      fi
      # Also record on all review scopes (for review→completed transitions)
      REVIEW_DIR="$PROJECT_DIR/scopes/review"
      if [ -d "$REVIEW_DIR" ]; then
        for f in "$REVIEW_DIR"/*.md; do
          [ -f "$f" ] || continue
          append_session_uuid "$f" "commit" "$SESSION_UUID"
        done
      fi
    fi

    # NOTE: completed → dev auto-transition removed.
    # Use /git-dev to explicitly merge feature→dev and transition scopes.
  fi
  exit 0
fi

# ─── git push / gh pr create: determine target branch ───
TARGET_BRANCH=""

if echo "$COMMAND" | grep -qE '^git push'; then
  # Check for branch names mentioned in WORKFLOW_BRANCH_MAP
  for mapping in "${WORKFLOW_BRANCH_MAP[@]}"; do
    IFS=':' read -r map_branch map_from map_to map_skey <<< "$mapping"
    if echo "$COMMAND" | grep -qE "\\b${map_branch}\\b"; then
      TARGET_BRANCH="$map_branch"
      break
    fi
  done
  # Also check if current branch matches a mapped branch
  if [ -z "$TARGET_BRANCH" ]; then
    for mapping in "${WORKFLOW_BRANCH_MAP[@]}"; do
      IFS=':' read -r map_branch map_from map_to map_skey <<< "$mapping"
      if [ "$BRANCH" = "$map_branch" ]; then
        TARGET_BRANCH="$map_branch"
        break
      fi
    done
  fi
elif echo "$COMMAND" | grep -qE '^gh pr create'; then
  # gh pr create --base staging / --base main
  TARGET_BRANCH=$(echo "$COMMAND" | grep -oE '\-\-base[[:space:]]+[a-z]+' | awk '{print $2}')
fi

# ─── Resolve target branch to transition via manifest ───
TRANSITION_FROM=""
TRANSITION_TO=""

for mapping in "${WORKFLOW_BRANCH_MAP[@]}"; do
  IFS=':' read -r map_branch map_from map_to map_skey <<< "$mapping"
  if [ "$TARGET_BRANCH" = "$map_branch" ]; then
    TRANSITION_FROM="$map_from"
    TRANSITION_TO="$map_to"
    break
  fi
done

# ─── Execute transition if mapped ───
if [ -n "$TRANSITION_FROM" ] && [ -n "$TRANSITION_TO" ]; then
  if [ -n "$BATCH_SCOPE_IDS" ]; then
    if ! echo "$BATCH_SCOPE_IDS" | grep -qE '^[0-9]+(,[0-9]+)*$'; then
      echo "ERROR: BATCH_SCOPE_IDS contains invalid characters. Must be comma-separated integers with no spaces, e.g. BATCH_SCOPE_IDS=093,094,095" >&2
      exit 1
    fi
    echo ""
    echo "Batch: transitioning scopes [$BATCH_SCOPE_IDS] → $TRANSITION_TO..."
    IFS=',' read -ra BATCH_IDS <<< "$BATCH_SCOPE_IDS"
    for bid in "${BATCH_IDS[@]}"; do
      bash "$SCRIPT_DIR/scope-transition.sh" --from "$TRANSITION_FROM" --to "$TRANSITION_TO" \
        --scope "$bid" ${SESSION_UUID:+--session "$SESSION_UUID"}
    done
    echo ""
  else
    # Guard: require explicit BATCH_SCOPE_IDS to prevent accidental bulk transitions
    SOURCE_DIR="$PROJECT_DIR/scopes/$TRANSITION_FROM"
    if [ -d "$SOURCE_DIR" ]; then
      SOURCE_COUNT=$(find "$SOURCE_DIR" -name '*.md' ! -name '_template.md' 2>/dev/null | wc -l | tr -d ' ')
      if [ "$SOURCE_COUNT" -gt 0 ]; then
        echo "   ⚠️  $SOURCE_COUNT $TRANSITION_FROM scope(s) found but no BATCH_SCOPE_IDS set."
        echo "      Set BATCH_SCOPE_IDS=093,094 to transition specific scopes."
      fi
    fi
  fi
fi

exit 0
