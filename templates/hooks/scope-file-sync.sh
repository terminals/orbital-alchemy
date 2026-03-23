#!/bin/bash
# scope-file-sync.sh — Flag out-of-scope files before commits
# Trigger: PreToolUse:Bash (git commit detected)
# Nudge-style: always exits 0
set -e

INPUT=$(cat)
echo "$INPUT" | jq empty 2>/dev/null || exit 0
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')
echo "$COMMAND" | grep -qE "git commit" || exit 0

source "$(dirname "$0")/scope-helpers.sh"
SCOPE=$(find_active_scope) || exit 0

# Get staged files
STAGED=$(cd "$SCOPE_PROJECT_DIR" && git diff --cached --name-only 2>/dev/null)
[ -z "$STAGED" ] && exit 0

# Get file references from scope's Files Summary table
SCOPE_FILES=$(grep -oE '`[^`]+\.(ts|tsx|js|jsx|md|json|sh|css)`' "$SCOPE" | tr -d '`' | sort -u)
[ -z "$SCOPE_FILES" ] && exit 0

# Build a patterns file for grep -Ff matching (O(n) instead of O(n²))
SCOPE_PATTERNS_FILE=$(mktemp)
trap "rm -f '$SCOPE_PATTERNS_FILE'" EXIT
# Add both full paths and basenames as patterns
echo "$SCOPE_FILES" > "$SCOPE_PATTERNS_FILE"
echo "$SCOPE_FILES" | xargs -I{} basename {} >> "$SCOPE_PATTERNS_FILE"

OUT_OF_SCOPE=""
for staged_file in $STAGED; do
  # Skip non-code and meta files
  [[ "$staged_file" == *.lock ]] && continue
  [[ "$staged_file" == *"node_modules"* ]] && continue
  [[ "$staged_file" == *".claude/"* ]] && continue
  [[ "$staged_file" == *"scopes/"* ]] && continue

  # Check if staged file or its basename matches any scope file pattern
  if ! echo "$staged_file" | grep -qFf "$SCOPE_PATTERNS_FILE" && \
     ! basename "$staged_file" | grep -qFf "$SCOPE_PATTERNS_FILE"; then
    OUT_OF_SCOPE="$OUT_OF_SCOPE   - $staged_file\n"
  fi
done

if [ -n "$OUT_OF_SCOPE" ]; then
  echo ""
  echo "⚠️  Files outside scope ($(basename "$SCOPE")):"
  echo -e "$OUT_OF_SCOPE"
  echo "   If intentional, document in PROCESS > Deviations from Spec"
  echo ""
fi

exit 0
