#!/bin/bash
# scope-prepare.sh — One-shot scope file preparation
#
# Consolidates file lookup, ID assignment, template scaffolding,
# session recording, and gate cleanup into a single Bash call.
#
# Modes:
#   --promote ID     Promote icebox idea to planning (renumber + move + scaffold)
#   --scaffold ID    Apply template to existing planning scope
#   --new            Create brand new scope
#
# Options:
#   --title "..."    Scope title (required for --new)
#   --desc "..."     Description / problem statement
#   --category "..." Category tag (default: TBD)
#
# Output: JSON to stdout
# Errors: to stderr
# Exit: 0=success, 1=arg error, 2=source not found, 3=template missing, 4=collision
set -e

HOOK_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$HOOK_DIR/scope-helpers.sh"

# ─── Argument parsing ────────────────────────────────────────────
MODE=""
SOURCE_ID=""
TITLE=""
DESCRIPTION=""
CATEGORY="TBD"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --promote)   MODE="promote";  SOURCE_ID="$2"; shift 2 ;;
    --scaffold)  MODE="scaffold"; SOURCE_ID="$2"; shift 2 ;;
    --new)       MODE="new"; shift ;;
    --title)     TITLE="$2"; shift 2 ;;
    --desc)      DESCRIPTION="$2"; shift 2 ;;
    --category)  CATEGORY="$2"; shift 2 ;;
    *)           echo "Unknown argument: $1" >&2; exit 1 ;;
  esac
done

if [ -z "$MODE" ]; then
  echo "Usage: scope-prepare.sh --promote ID | --scaffold ID | --new --title \"...\"" >&2
  exit 1
fi

if [ "$MODE" = "new" ] && [ -z "$TITLE" ]; then
  echo "Error: --new requires --title" >&2
  exit 1
fi

# ─── Session ID (inlined from get-session-id.sh) ────────────────
SESSION_ID=""
SESSION_DIR="$SCOPE_PROJECT_DIR/.claude/metrics/.session-ids"
if [ -d "$SESSION_DIR" ]; then
  CURRENT_PID=$PPID
  VISITED=""
  while [ "$CURRENT_PID" -gt 1 ] 2>/dev/null; do
    case " $VISITED " in *" $CURRENT_PID "*) break ;; esac
    VISITED="$VISITED $CURRENT_PID"
    for f in "$SESSION_DIR/${CURRENT_PID}"-*; do
      if [ -f "$f" ]; then
        SESSION_ID=$(cat "$f")
        break 2
      fi
    done
    if [ -f "$SESSION_DIR/$CURRENT_PID" ]; then
      SESSION_ID=$(cat "$SESSION_DIR/$CURRENT_PID")
      break
    fi
    CURRENT_PID=$(ps -o ppid= -p "$CURRENT_PID" 2>/dev/null | tr -d ' ')
    [ -z "$CURRENT_PID" ] && break
  done
fi

# ─── Resolve source file + extract metadata ─────────────────────
OLD_FILE=""
NOW_DATE=$(date +%Y-%m-%d)
NOW_TIME=$(date +%H:%M)
CREATED_DATE="$NOW_DATE"

case "$MODE" in
  promote)
    OLD_FILE=$(find_scope_by_id "$SOURCE_ID")
    if [ -z "$OLD_FILE" ] || [ ! -f "$OLD_FILE" ]; then
      echo "Error: Scope $SOURCE_ID not found" >&2
      exit 2
    fi
    [ -z "$TITLE" ] && TITLE=$(get_frontmatter "$OLD_FILE" "title")
    # Preserve original created date
    orig_created=$(get_frontmatter "$OLD_FILE" "created")
    [ -n "$orig_created" ] && CREATED_DATE="$orig_created"
    # Extract description from body (everything after frontmatter closing ---)
    if [ -z "$DESCRIPTION" ]; then
      DESCRIPTION=$(awk 'BEGIN{fm=0} /^---$/{fm++; next} fm>=2{print}' "$OLD_FILE" | head -20 | sed '/^$/d' | head -5)
    fi
    # Get category if set
    orig_cat=$(get_frontmatter "$OLD_FILE" "category")
    [ -n "$orig_cat" ] && [ "$orig_cat" != "TBD" ] && CATEGORY="$orig_cat"
    ;;

  scaffold)
    OLD_FILE=$(find_scope_by_id "$SOURCE_ID")
    if [ -z "$OLD_FILE" ] || [ ! -f "$OLD_FILE" ]; then
      echo "Error: Scope $SOURCE_ID not found" >&2
      exit 2
    fi
    [ -z "$TITLE" ] && TITLE=$(get_frontmatter "$OLD_FILE" "title")
    orig_created=$(get_frontmatter "$OLD_FILE" "created")
    [ -n "$orig_created" ] && CREATED_DATE="$orig_created"
    if [ -z "$DESCRIPTION" ]; then
      DESCRIPTION=$(awk 'BEGIN{fm=0} /^---$/{fm++; next} fm>=2{print}' "$OLD_FILE" | head -20 | sed '/^$/d' | head -5)
    fi
    orig_cat=$(get_frontmatter "$OLD_FILE" "category")
    [ -n "$orig_cat" ] && [ "$orig_cat" != "TBD" ] && CATEGORY="$orig_cat"
    ;;
esac

# ─── Compute scope ID ───────────────────────────────────────────
compute_next_id() {
  local max_id=0
  if [ -d "$SCOPE_PROJECT_DIR/scopes" ]; then
    for dir in "$SCOPE_PROJECT_DIR/scopes"/*/; do
      [ -d "$dir" ] || continue
      [ "$(basename "$dir")" = "icebox" ] && continue
      for f in "$dir"*.md; do
        [ -f "$f" ] || continue
        local num
        num=$(basename "$f" | grep -oE '^[0-9]+' | sed 's/^0*//')
        [ -z "$num" ] && continue
        [ "$num" -gt "$max_id" ] 2>/dev/null && max_id=$num
      done
    done
  fi
  echo $((max_id + 1))
}

case "$MODE" in
  promote)
    SCOPE_ID=$(compute_next_id)
    ;;
  scaffold)
    # Use existing ID from frontmatter
    SCOPE_ID=$(get_frontmatter "$OLD_FILE" "id" | sed 's/^0*//')
    [ -z "$SCOPE_ID" ] && SCOPE_ID=$(basename "$OLD_FILE" | grep -oE '^[0-9]+' | sed 's/^0*//')
    ;;
  new)
    SCOPE_ID=$(compute_next_id)
    ;;
esac

PADDED_ID=$(printf '%03d' "$SCOPE_ID")

# ─── Build slug + paths ─────────────────────────────────────────
SLUG=$(printf '%s' "$TITLE" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g; s/--*/-/g; s/^-//; s/-$//' | cut -c1-60)
PLANNING_DIR="$SCOPE_PROJECT_DIR/scopes/planning"
mkdir -p "$PLANNING_DIR"
NEW_FILE="$PLANNING_DIR/${PADDED_ID}-${SLUG}.md"

# For scaffold mode, the target IS the existing file (possibly same path)
if [ "$MODE" = "scaffold" ]; then
  NEW_FILE="$OLD_FILE"
fi

# Collision check (promote/new only)
if [ "$MODE" != "scaffold" ] && [ -f "$NEW_FILE" ]; then
  echo "Error: Target file already exists: $NEW_FILE" >&2
  exit 4
fi

# ─── Template scaffolding ───────────────────────────────────────
TEMPLATE="$SCOPE_PROJECT_DIR/scopes/_template.md"
if [ ! -f "$TEMPLATE" ]; then
  echo "Error: Template not found: $TEMPLATE (run 'orbital init' first)" >&2
  exit 3
fi

# Escape description for sed replacement (handle &, /, \, newlines)
ESCAPED_DESC=$(printf '%s' "$DESCRIPTION" | head -1 | sed 's/[&/\]/\\&/g')
[ -z "$ESCAPED_DESC" ] && ESCAPED_DESC="[Problem statement - what's broken or needed]"

# Escape title for sed
ESCAPED_TITLE=$(printf '%s' "$TITLE" | sed 's/[&/\]/\\&/g; s/"/\\"/g')

# Build sessions line
if [ -n "$SESSION_ID" ]; then
  SESSIONS_REPLACEMENT="sessions:\\
  createScope: [$SESSION_ID]"
else
  SESSIONS_REPLACEMENT="sessions: {}"
fi

# Apply template substitutions
# Note: some template lines have trailing YAML comments (e.g. "category: "TBD"  # ..."),
# so we match the value portion without anchoring to end-of-line.
sed \
  -e "s/^id: NNN/id: $PADDED_ID/" \
  -e "s/^title: \"Scope Title\"/title: \"$ESCAPED_TITLE\"/" \
  -e "s/^category: \"TBD\".*/category: \"$CATEGORY\"/" \
  -e "s/^created: YYYY-MM-DD/created: $CREATED_DATE/" \
  -e "s/^updated: YYYY-MM-DD/updated: $NOW_DATE/" \
  -e "s/^sessions: {}.*/$SESSIONS_REPLACEMENT/" \
  -e "s/# Scope NNN: Title/# Scope $PADDED_ID: $ESCAPED_TITLE/" \
  -e "s/YYYY-MM-DD HH:MM/$NOW_DATE $NOW_TIME/g" \
  -e "s/Scope created$/Scope created via \/scope-create/" \
  -e "s/\[Problem statement - what's broken or needed\]/$ESCAPED_DESC/" \
  -e "s/\[What prompted this exploration\]/$ESCAPED_DESC/" \
  "$TEMPLATE" > "$NEW_FILE"

# ─── Cleanup old file (promote only) ────────────────────────────
if [ "$MODE" = "promote" ] && [ -n "$OLD_FILE" ] && [ "$OLD_FILE" != "$NEW_FILE" ]; then
  rm -f "$OLD_FILE"
fi

# ─── Gate lifecycle: remove marker + emit event ─────────────────
MARKER="$SCOPE_PROJECT_DIR/.claude/metrics/.scope-create-session"
rm -f "$MARKER"

# Emit event in background (non-blocking)
"$HOOK_DIR/orbital-emit.sh" SCOPE_GATE_LIFTED \
  "{\"scope_file\":\"$NEW_FILE\",\"id\":$SCOPE_ID,\"mode\":\"$MODE\"}" \
  --scope "$SCOPE_ID" --session "$SESSION_ID" 2>/dev/null &

# ─── JSON output ────────────────────────────────────────────────
# Compute relative path
REL_PATH="${NEW_FILE#"$SCOPE_PROJECT_DIR/"}"

# Manual JSON construction (no jq dependency)
printf '{"id":"%s","path":"%s","title":"%s","description":"%s","session_id":"%s","category":"%s","mode":"%s"}\n' \
  "$PADDED_ID" \
  "$REL_PATH" \
  "$(printf '%s' "$TITLE" | sed 's/"/\\"/g')" \
  "$(printf '%s' "$DESCRIPTION" | head -1 | sed 's/"/\\"/g')" \
  "$SESSION_ID" \
  "$CATEGORY" \
  "$MODE"

# Print reminder to stderr (visible to Claude but not parsed as JSON)
echo "" >&2
echo "Scope document written. Write gate lifted." >&2
echo "Remember: STOP here. Implementation is a separate session:" >&2
echo "  /scope-implement $PADDED_ID" >&2
