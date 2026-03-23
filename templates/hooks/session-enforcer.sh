#!/bin/bash
# session-enforcer.sh — PreToolUse:Edit|Write hook
#
# Hard-blocks scope status transitions when the CURRENT session's UUID
# is not recorded in the scope's sessions.<requiredKey> array.
#
# Handles both Edit (old_string/new_string) and Write (full content) tools.
# Gracefully allows legacy scopes that don't have a sessions: block at all.
set -e

INPUT=$(cat)
# Validate JSON input
echo "$INPUT" | jq empty 2>/dev/null || exit 0

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"

# Extract the file being edited/written
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')
[ -z "$FILE_PATH" ] && exit 0

# Only enforce on scope files (bash case * matches / in patterns)
case "$FILE_PATH" in
  */scopes/*.md) ;;
  *) exit 0 ;;
esac

# ─── Determine tool type and extract statuses ───
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // "Edit"')

if [ "$TOOL_NAME" = "Write" ]; then
  # Write tool: compare existing file on disk vs new content
  if [ ! -f "$FILE_PATH" ]; then
    # New file creation — no status transition to enforce
    exit 0
  fi
  OLD_STATUS=$(sed -n '/^---$/,/^---$/p' "$FILE_PATH" | grep -oE '^status:\s*\S+' | head -1 | sed 's/status:[[:space:]]*//')
  NEW_CONTENT=$(echo "$INPUT" | jq -r '.tool_input.content // empty')
  [ -z "$NEW_CONTENT" ] && exit 0
  TARGET_STATUS=$(echo "$NEW_CONTENT" | sed -n '/^---$/,/^---$/p' | grep -oE '^status:\s*\S+' | head -1 | sed 's/status:[[:space:]]*//')
else
  # Edit tool: compare old_string vs new_string
  NEW_STRING=$(echo "$INPUT" | jq -r '.tool_input.new_string // empty')
  [ -z "$NEW_STRING" ] && exit 0
  TARGET_STATUS=$(echo "$NEW_STRING" | grep -oE 'status:\s*\S+' | head -1 | sed 's/status:[[:space:]]*//')
  OLD_STRING=$(echo "$INPUT" | jq -r '.tool_input.old_string // empty')
  OLD_STATUS=$(echo "$OLD_STRING" | grep -oE 'status:\s*\S+' | head -1 | sed 's/status:[[:space:]]*//')
fi

# No status in the edit/write — not a status transition
[ -z "$TARGET_STATUS" ] && exit 0

# If status isn't changing, allow the edit
[ "$TARGET_STATUS" = "$OLD_STATUS" ] && exit 0

# ─── Map target status to required session key ───
# This matrix matches WHO actually makes each transition:
#   - createScope: /scope-create → planning
#   - reviewScope: /scope-pre-review → backlog
#   - implementScope: /scope-implement → implementing
#   - verifyScope: /scope-post-review → review (different session required)
#   - commit: /git-commit → completed
#   - prDev: /git-dev → dev
#   - pushToStaging: /git-staging → staging
#   - pushToProduction: /git-production → production
# ─── Source workflow manifest for edge-based session key lookup ───
MANIFEST_FILE="${PROJECT_DIR}/.claude/config/workflow-manifest.sh"
REQUIRED_KEY=""

if [ -f "$MANIFEST_FILE" ]; then
  source "$MANIFEST_FILE"
  # Look up session key from WORKFLOW_EDGES: "from:to:sessionKey"
  for edge_entry in "${WORKFLOW_EDGES[@]}"; do
    IFS=':' read -r _from edge_to edge_skey <<< "$edge_entry"
    if [ "$edge_to" = "$TARGET_STATUS" ] && [ -n "$edge_skey" ]; then
      REQUIRED_KEY="$edge_skey"
      break
    fi
  done
  # No session key for this status — not enforced
  [ -z "$REQUIRED_KEY" ] && exit 0
else
  # Fallback: hardcoded keys (don't silently disable enforcement)
  case "$TARGET_STATUS" in
    planning)                   REQUIRED_KEY="createScope" ;;
    backlog)                    REQUIRED_KEY="reviewScope" ;;
    implementing)               REQUIRED_KEY="implementScope" ;;
    review)                     REQUIRED_KEY="reviewGate" ;;
    completed)                  REQUIRED_KEY="commit" ;;
    dev)                        REQUIRED_KEY="prDev" ;;
    staging)                    REQUIRED_KEY="pushToStaging" ;;
    production)                 REQUIRED_KEY="pushToProduction" ;;
    main)                       REQUIRED_KEY="pushToMain" ;;
    *) exit 0 ;;
  esac
fi

# Get current session ID from hook stdin
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty')
if [ -z "$SESSION_ID" ]; then
  # If we can't identify the session, allow (graceful degradation)
  exit 0
fi

# ─── Record session UUID on scope for this transition ───
# This ensures the UUID is present even for direct Edit transitions
# (scope-lifecycle-gate.sh only records on Bash/git commands)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/scope-helpers.sh" 2>/dev/null || true
if [ -f "$FILE_PATH" ] && type append_session_uuid &>/dev/null; then
  append_session_uuid "$FILE_PATH" "$REQUIRED_KEY" "$SESSION_ID"
fi

# ─── Read scope file and check sessions block ───
# For Write tool, check the FILE ON DISK (sessions were written by the
# scope-lifecycle-gate hook before this call). For Edit tool, also check the file on disk.
CHECK_FILE="$FILE_PATH"
if [ ! -f "$CHECK_FILE" ]; then
  exit 0
fi

# Check if sessions: block exists at all in frontmatter
FRONTMATTER=$(sed -n '/^---$/,/^---$/p' "$CHECK_FILE")
if ! echo "$FRONTMATTER" | grep -q '^sessions:'; then
  # Legacy scope without sessions field — allow (backwards compatible)
  exit 0
fi

# Look for the specific session key (handles both 2-space and 4-space indent)
SESSIONS_LINE=$(echo "$FRONTMATTER" | grep "^[[:space:]]*$REQUIRED_KEY:" | head -1)

if [ -z "$SESSIONS_LINE" ]; then
  # sessions: block exists but this key is missing — session not recorded
  echo "MUST_BLOCK: Session $SESSION_ID not found in sessions.$REQUIRED_KEY. The scope-lifecycle-gate hook should have recorded this — check .claude/hooks/scope-lifecycle-gate.sh. Format: sessions use inline YAML arrays, e.g. $REQUIRED_KEY: [$SESSION_ID]" >&2
  exit 2
fi

# Check if our UUID appears in the line (fixed-string match, not regex)
if echo "$SESSIONS_LINE" | grep -qF "$SESSION_ID"; then
  exit 0
fi

echo "MUST_BLOCK: Session $SESSION_ID not found in sessions.$REQUIRED_KEY. The scope-lifecycle-gate hook should have recorded this — check .claude/hooks/scope-lifecycle-gate.sh. Format: sessions use inline YAML arrays — append UUID to existing array, e.g. $REQUIRED_KEY: [existing-uuid, $SESSION_ID]" >&2
exit 2
