#!/bin/bash
# scope-file-sync.sh — Flag out-of-scope files before commits
# Trigger: PreToolUse:Bash (git commit detected)
# Nudge-style: always exits 0

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null)
echo "$COMMAND" | grep -qE "git commit" || exit 0

source "$(dirname "$0")/scope-helpers.sh"
SCOPE=$(find_active_scope) || exit 0

# Get staged files
STAGED=$(cd "$SCOPE_PROJECT_DIR" && git diff --cached --name-only 2>/dev/null)
[ -z "$STAGED" ] && exit 0

# Get file references from scope's Files Summary table
SCOPE_FILES=$(grep -oE '`[^`]+\.(ts|tsx|js|jsx|md|json|sh|css)`' "$SCOPE" | tr -d '`' | sort -u)
[ -z "$SCOPE_FILES" ] && exit 0

OUT_OF_SCOPE=""
for staged_file in $STAGED; do
  # Skip non-code and meta files
  [[ "$staged_file" == *.lock ]] && continue
  [[ "$staged_file" == *"node_modules"* ]] && continue
  [[ "$staged_file" == *".claude/"* ]] && continue
  [[ "$staged_file" == *"scopes/"* ]] && continue

  MATCH=false
  for scope_file in $SCOPE_FILES; do
    if [[ "$staged_file" == *"$scope_file"* ]] || [[ "$scope_file" == *"$(basename "$staged_file")"* ]]; then
      MATCH=true
      break
    fi
  done
  [ "$MATCH" = false ] && OUT_OF_SCOPE="$OUT_OF_SCOPE   - $staged_file\n"
done

if [ -n "$OUT_OF_SCOPE" ]; then
  echo ""
  echo "⚠️  Files outside scope ($(basename "$SCOPE")):"
  echo -e "$OUT_OF_SCOPE"
  echo "   If intentional, document in PROCESS > Deviations from Spec"
  echo ""
fi

exit 0
