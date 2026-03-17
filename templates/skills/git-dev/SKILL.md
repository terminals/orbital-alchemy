---
name: git-dev
description: Merges feature branch into dev with direct merge (no PR). Use when feature work is committed and ready to integrate into the dev branch.
user-invocable: true
---

# /git-dev — Merge Feature Branch into Dev

Direct merge from feature branch into dev. The review gate already provides the quality gate, so no PR is needed for this step.

## Prerequisites

- On a feature branch (not main/staging/dev)
- All changes committed (clean working tree)
- Feature branch has scope work committed via `/git-commit`

## Workflow

### Step 0: Record Session ID

1. Run: `bash .claude/hooks/get-session-id.sh`
2. For each scope in `scopes/completed/`:
   - Append session UUID to `sessions.prDev` in frontmatter

### Step 1: Verify Ready State

```bash
# Check you're on a feature branch
BRANCH=$(git branch --show-current)

# Block if on main/staging/dev
if [[ "$BRANCH" == "main" || "$BRANCH" == "staging" || "$BRANCH" == "dev" ]]; then
  echo "Must be on a feature branch, not $BRANCH"
  exit 1
fi

# Check for uncommitted changes
git status --porcelain
```

### Step 2: Scope Transition (local only)

Find scopes in `scopes/completed/`:
1. For each scope file in `scopes/completed/*.md`:
   - `mv scopes/completed/{file} scopes/dev/`
   - Update frontmatter: `status: dev`
   - Update DASHBOARD: `🔀 **Status**: Merged to Dev`

If BATCH_SCOPE_IDS is set, only transition those specific scopes.

### Step 3: Merge into Dev

```bash
# Save current branch name
FEATURE_BRANCH=$(git branch --show-current)

# Fetch latest dev
git fetch origin dev

# Checkout dev and merge
git checkout dev
git merge "$FEATURE_BRANCH"
git push origin dev

# Return to feature branch
git checkout "$FEATURE_BRANCH"
```

If merge conflicts occur, resolve them before continuing.

### Step 4: Signal Completion

```bash
bash .claude/hooks/orbital-emit.sh AGENT_COMPLETED '{"outcome":"success","action":"pr_dev"}' --scope "{NNN}"
```

## Output

```
╔═══════════════════════════════════════════════════════════════╗
║  Merged feature branch into dev                              ║
╠═══════════════════════════════════════════════════════════════╣
║  Branch: feat/my-feature → dev                               ║
║  Scopes transitioned: 093, 094 → dev                         ║
║                                                              ║
║  Next: /git-staging to create a PR from dev to staging       ║
╚═══════════════════════════════════════════════════════════════╝
```

## Batch Support

When dispatched by the batch orchestrator with `BATCH_SCOPE_IDS`:
- Only transition the specified scope IDs
- The batch orchestrator tracks completion via `onScopeStatusChanged`

## Related

- `/git-commit` — Commit work to feature branch (previous step)
- `/git-staging` — Create PR from dev to staging (next step)
