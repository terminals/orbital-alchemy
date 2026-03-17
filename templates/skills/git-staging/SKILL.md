---
name: git-staging
description: Creates GitHub PR from dev to staging for release visibility and CI gate. Use when dev branch work is ready for staging review.
user-invocable: true
---

# /git-staging — GitHub PR from Dev to Staging

Creates a GitHub PR from dev to staging. Staging is a release candidate — the PR provides an audit trail, CI gate, and selective promotion visibility.

## Prerequisites

- Changes merged into dev (via `/git-dev`)
- Dev branch is up to date with remote
- No merge conflicts with staging

## Workflow

### Step 1: Scope Transition (local only)

Find scopes in `scopes/dev/`:
1. For each scope file in `scopes/dev/*.md`:
   - `mv scopes/dev/{file} scopes/staging/`
   - Update frontmatter: `status: staging`
   - Update DASHBOARD: `🚀 **Status**: Staging PR Created`

If BATCH_SCOPE_IDS is set, only transition those specific scopes.

### Step 2: Ensure Remote is Up to Date

```bash
git push origin dev
```

### Step 3: Create GitHub PR

```bash
gh pr create --base staging --head dev \
  --title "release: <summary of scopes>" \
  --body "## Summary

- Scope NNN: <title>
- Scope NNN: <title>

## Changes

<bullet list of key changes>

## Testing

- [ ] Quality gates pass on dev
- [ ] No regressions in staging tests
- [ ] Deployment verified healthy

## Checklist

- [ ] No console.log statements
- [ ] No any types added
- [ ] Files under 400 lines"
```

### Step 4: Signal Completion

```bash
bash .claude/hooks/orbital-emit.sh AGENT_COMPLETED '{"outcome":"success","action":"pr_staging"}' --scope "{NNN}"
```

### Step 5: Monitor CI

```bash
gh pr checks
gh pr view --web
```

## Output

```
╔═══════════════════════════════════════════════════════════════╗
║  PR created: dev → staging                                   ║
╠═══════════════════════════════════════════════════════════════╣
║  PR: #NNN — release: <summary>                               ║
║  Scopes transitioned: 093, 094 → staging                     ║
║                                                              ║
║  Next: Review PR, merge, then /git-production                ║
╚═══════════════════════════════════════════════════════════════╝
```

## If PR Checks Fail

```bash
# See what failed
gh pr checks

# Fix locally on dev, push
git checkout dev
# ... make fixes ...
git add <files>
git commit -m "fix: address CI feedback"
git push origin dev
# PR updates automatically
```

## Batch Support

When dispatched by the batch orchestrator with `BATCH_SCOPE_IDS`:
- Only transition the specified scope IDs
- The batch orchestrator tracks completion via `onScopeStatusChanged`

## Related

- `/git-dev` — Merge feature→dev (previous step)
- `/git-production` — Release PR staging→main (next step)
