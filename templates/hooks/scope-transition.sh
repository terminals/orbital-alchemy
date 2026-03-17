#!/bin/bash
# scope-transition.sh — Centralized scope lifecycle transition utility
#
# Moves scope files between lifecycle directories and updates frontmatter.
#
# Usage:
#   scope-transition.sh <direction|--from STATUS --to STATUS> [--scope ID] [--session UUID]
#
# Directions (backward-compat aliases):
#   to-dev        — completed → dev   (called by /git-dev skill)
#   to-staging    — dev → staging     (on push/PR to staging)
#   to-production — staging → production (on push/PR to main)
#
# Generic form (manifest-driven):
#   --from completed --to dev
#   --from dev --to staging
#
# Options:
#   --scope ID    — Transition a specific scope by numeric ID
#   --session UUID — Session UUID to record (default: from get-session-id.sh)
#
# Exit codes:
#   0 — Success (or nothing to transition)
#   1 — Invalid arguments

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/scope-helpers.sh"

# ─── Parse arguments ───
DIRECTION=""
SCOPE_ID=""
SESSION_UUID=""
FROM_STATUS=""
TO_STATUS=""

while [ $# -gt 0 ]; do
  case "$1" in
    to-dev|to-staging|to-production) DIRECTION="$1" ;;
    --from) FROM_STATUS="$2"; shift ;;
    --to) TO_STATUS="$2"; shift ;;
    --scope) SCOPE_ID="$2"; shift ;;
    --session) SESSION_UUID="$2"; shift ;;
    *) echo "Unknown argument: $1" >&2; exit 1 ;;
  esac
  shift
done

# ─── Resolve direction alias or --from/--to ───
if [ -n "$DIRECTION" ]; then
  # Resolve via WORKFLOW_DIRECTION_ALIASES (from manifest or fallback)
  RESOLVED=false
  for alias_entry in "${WORKFLOW_DIRECTION_ALIASES[@]}"; do
    IFS=':' read -r alias_name alias_from alias_to alias_skey <<< "$alias_entry"
    if [ "$alias_name" = "$DIRECTION" ]; then
      SOURCE_STATUS="$alias_from"
      TARGET_STATUS="$alias_to"
      SESSION_KEY="$alias_skey"
      RESOLVED=true
      break
    fi
  done

  if [ "$RESOLVED" = false ]; then
    echo "ERROR: Unknown direction '$DIRECTION'" >&2
    exit 1
  fi
elif [ -n "$FROM_STATUS" ] && [ -n "$TO_STATUS" ]; then
  # Generic --from/--to: look up session key from WORKFLOW_EDGES
  SOURCE_STATUS="$FROM_STATUS"
  TARGET_STATUS="$TO_STATUS"
  SESSION_KEY=""
  for edge_entry in "${WORKFLOW_EDGES[@]}"; do
    IFS=':' read -r edge_from edge_to edge_skey <<< "$edge_entry"
    if [ "$edge_from" = "$SOURCE_STATUS" ] && [ "$edge_to" = "$TARGET_STATUS" ]; then
      SESSION_KEY="$edge_skey"
      break
    fi
  done
else
  echo "Usage: scope-transition.sh <direction|--from STATUS --to STATUS> [--scope ID] [--session UUID]" >&2
  echo "Directions: to-dev, to-staging, to-production (backward-compat aliases)" >&2
  echo "Generic:    --from completed --to dev (manifest-driven)" >&2
  exit 1
fi

# ─── PID-aware file lock (survives kill -9 via stale detection) ───
LOCK_DIR="/tmp/orbital-scope-${SCOPE_ID:-all}.lock"
if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  LOCK_PID=$(cat "$LOCK_DIR/pid" 2>/dev/null)
  if [ -n "$LOCK_PID" ] && ! kill -0 "$LOCK_PID" 2>/dev/null; then
    rm -rf "$LOCK_DIR" && mkdir "$LOCK_DIR"
  else
    echo "Scope ${SCOPE_ID:-all} locked by PID $LOCK_PID" >&2; exit 0
  fi
fi
echo $$ > "$LOCK_DIR/pid"
trap 'rm -rf "$LOCK_DIR" 2>/dev/null' EXIT

SOURCE_DIR="$SCOPE_PROJECT_DIR/scopes/$SOURCE_STATUS"
TARGET_DIR="$SCOPE_PROJECT_DIR/scopes/$TARGET_STATUS"

# ─── Resolve session UUID ───
if [ -z "$SESSION_UUID" ]; then
  SESSION_UUID=$("$SCRIPT_DIR/get-session-id.sh" 2>/dev/null || true)
fi

# ─── Find matching scopes ───
SCOPES_TO_TRANSITION=""

if [ -n "$SCOPE_ID" ]; then
  # Specific scope requested
  SCOPE_FILE=$(find_scope_by_id "$SCOPE_ID")
  if [ -n "$SCOPE_FILE" ]; then
    FILE_STATUS=$(get_frontmatter "$SCOPE_FILE" "status")
    if [ "$FILE_STATUS" = "$SOURCE_STATUS" ]; then
      SCOPES_TO_TRANSITION="$SCOPE_FILE"
    fi
  fi
else
  # Find all scopes in source directory with matching status
  SCOPES_TO_TRANSITION=$(find_scopes_by_status "$SOURCE_STATUS" "$SOURCE_DIR" 2>/dev/null || true)
fi

if [ -z "$SCOPES_TO_TRANSITION" ]; then
  exit 0
fi

# ─── Transition each scope ───
mkdir -p "$TARGET_DIR"
TRANSITIONED=0
TODAY=$(date +%Y-%m-%d)

for scope_file in $SCOPES_TO_TRANSITION; do
  [ -f "$scope_file" ] || continue
  FILENAME=$(basename "$scope_file")
  SCOPE_TITLE=$(get_frontmatter "$scope_file" "title")
  SCOPE_NUM=$(get_frontmatter "$scope_file" "id")

  # 1. Update status in frontmatter
  set_frontmatter "$scope_file" "status" "$TARGET_STATUS"

  # 2. Update the date
  set_frontmatter "$scope_file" "updated" "$TODAY"

  # 2b. Record baseCommit when entering implementing
  if [ "$TARGET_STATUS" = "implementing" ]; then
    BASE_SHA=$(git rev-parse HEAD 2>/dev/null)
    [ -n "$BASE_SHA" ] && set_frontmatter "$scope_file" "baseCommit" "$BASE_SHA"
  fi

  # 3. Record session UUID if available
  if [ -n "$SESSION_UUID" ] && [ -n "$SESSION_KEY" ]; then
    append_session_uuid "$scope_file" "$SESSION_KEY" "$SESSION_UUID"
  fi

  # 4. Move file to target directory (scopes are gitignored, use plain mv)
  mv "$scope_file" "$TARGET_DIR/$FILENAME"

  # 5. Print summary
  echo "   Scope $SCOPE_NUM ($FILENAME): $SOURCE_STATUS → $TARGET_STATUS"
  TRANSITIONED=$((TRANSITIONED + 1))
done

if [ "$TRANSITIONED" -gt 0 ]; then
  echo "   Transitioned $TRANSITIONED scope(s) $SOURCE_STATUS → $TARGET_STATUS"
fi
