---
name: git-main
description: Push or PR scope work to the main branch. Mode-aware - detects trunk vs worktree branching from workflow manifest.
user-invocable: true
---

# /git-main — Push/PR to Main

Push or create a PR to merge scope work into the main branch.

## Workflow

### Step 0: Detect Branching Mode

```bash
BRANCHING_MODE=$(grep '^WORKFLOW_BRANCHING_MODE=' .claude/config/workflow-manifest.sh 2>/dev/null | cut -d'"' -f2)
[ -z "$BRANCHING_MODE" ] && BRANCHING_MODE="trunk"
```

### Step 1: Record Session ID

1. Run: `bash .claude/hooks/get-session-id.sh` — capture the UUID output
2. For each scope in `scopes/completed/`
   (if BATCH_SCOPE_IDS is set, only record on those specific scopes):
   - Append session UUID to `sessions.pushToMain` in frontmatter

### Step 2: Check Current Branch

```bash
CURRENT_BRANCH=$(git branch --show-current)
```

### Step 3: Execute (Mode-Dependent)

#### Trunk Mode (`BRANCHING_MODE=trunk`)

**If on `main`:**
```bash
git push origin main
```

**If on a feature branch:**
- Ask the user: "You're on branch `$CURRENT_BRANCH`. Create a PR to main, or merge directly?"
  - **PR**: `gh pr create --base main --title "scope(NNN): title" --body "..."`
  - **Direct merge**: `git checkout main && git merge $CURRENT_BRANCH && git push origin main`

#### Worktree Mode (`BRANCHING_MODE=worktree`)

Always on a feature branch in worktree mode:
```bash
gh pr create --base main \
  --title "scope(NNN): title" \
  --body "## Summary
Merges scope NNN work into main.

## Scopes
- NNN: title"
```

### Step 4: Scope Transition

For each completed scope being pushed:
```bash
bash .claude/hooks/scope-transition.sh --from completed --to main --scope NNN
```

### Step 5: Signal Completion (REQUIRED)

**Always emit when finished** — this is not optional. Emit success or failure so the dispatch resolves immediately:

```bash
# On success — with a scope:
bash .claude/hooks/orbital-emit.sh AGENT_COMPLETED '{"outcome":"success","action":"pr_main"}' --scope "{NNN}"

# On success — without a scope:
bash .claude/hooks/orbital-emit.sh AGENT_COMPLETED '{"outcome":"success","action":"pr_main"}'

# On failure (push rejected, PR failed, merge conflicts, etc.):
bash .claude/hooks/orbital-emit.sh AGENT_COMPLETED '{"outcome":"failure","action":"pr_main"}' --scope "{NNN}"
```

## Batch Support

When `BATCH_SCOPE_IDS` and `MERGE_MODE` env vars are set:

```bash
MERGE_MODE=${MERGE_MODE:-push}  # push, pr, or direct
```

- **push**: `git push origin main`
- **pr**: `gh pr create --base main`
- **direct**: `git checkout main && git merge ... && git push origin main`

Transition all scopes in `BATCH_SCOPE_IDS` (comma-separated).
