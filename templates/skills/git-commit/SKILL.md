---
name: git-commit
description: Entry point for committing work that routes to the proper git workflow. Use when user says commit, save, or push to ensure correct branch handling.
user-invocable: true
---

# /git-commit - Commit Work to Feature Branch

**Use when the user asks to "commit", "save", or similar.**

## Workflow

### Step 0a: Detect Branching Mode

```bash
BRANCHING_MODE=$(grep '^WORKFLOW_BRANCHING_MODE=' .claude/config/workflow-manifest.sh 2>/dev/null | cut -d'"' -f2)
[ -z "$BRANCHING_MODE" ] && BRANCHING_MODE="trunk"
```

### Step 0b: Record Session ID

1. Run: `bash .claude/hooks/get-session-id.sh`
2. For each scope in `scopes/review/` with a passing verdict
   (if BATCH_SCOPE_IDS is set, only record on those specific scopes):
   - Append session UUID to `sessions.commit` in frontmatter

### Step 1: Check Branch

```bash
git branch --show-current
```

- **Trunk mode**: Allow commits on any branch including `main`
- **Worktree mode**: Allow commits on the worktree's feature branch
- **Gitflow mode** (if `BRANCHING_MODE=worktree` and dev/staging/production lists exist): Block if on `main`, `staging`, or `dev` — must be on a feature branch

### Step 2: Scope Transition (local only)

Find scopes in `scopes/review/` that have a passing verdict:

1. List files in `scopes/review/*.md`
2. For each, extract the scope number and check `.claude/review-verdicts/{NNN}.json`

If BATCH_SCOPE_IDS is set, only process those specific scopes (skip any not in the list).

3. If verdict exists and `verdict === "PASS"`:
   - Transition: `bash .claude/hooks/scope-transition.sh --from review --to completed --scope {NNN}`
   - Update DASHBOARD: `📦 **Status**: Committed`
4. If scope is in `scopes/review/` with **no** passing verdict:
   - Warn: "Scope {NNN} is in review but hasn't passed the review gate."
   - Suggest: "Run `/scope-verify {NNN}` before committing."
   - **Advisory only** — don't block the commit (intermediate commits are fine)

### Step 3: Commit

**Determine which files to stage** — scope-aware, not a blanket `git add .`:

1. For each scope being committed (from Step 2), read its **Files Summary** table from the scope document (`scopes/review/{NNN}*.md` or `scopes/completed/{NNN}*.md`)
2. Also check `.claude/review-findings/{NNN}.json` — each finding has a `file` field listing reviewed files
3. Cross-reference against `git status` — only stage files that appear in the scope's Files Summary or review findings
4. If files exist in `git status` that don't belong to any scope being committed, leave them unstaged

```bash
git add <files from scope Files Summary + review findings>
git commit -m "type(scope): description"
```

- Stage only scope-owned code files (scopes/ is gitignored, no need to worry about them)
- If multiple scopes are being committed (batch), include files from ALL scopes in the batch
- Follow conventional commit format
- Do NOT push or create PRs — those are separate skills

### Step 4: Signal Completion (REQUIRED)

**Always emit when finished** — this is not optional. Emit success or failure so the dispatch resolves immediately:

```bash
# On success — with a scope:
bash .claude/hooks/orbital-emit.sh AGENT_COMPLETED '{"outcome":"success","action":"save"}' --scope "{NNN}"

# On success — without a scope (general commit):
bash .claude/hooks/orbital-emit.sh AGENT_COMPLETED '{"outcome":"success","action":"save"}'

# On failure (commit failed, no files to stage, etc.):
bash .claude/hooks/orbital-emit.sh AGENT_COMPLETED '{"outcome":"failure","action":"save"}' --scope "{NNN}"
```

The `--scope` flag is optional. Omit it when committing work that isn't tied to a specific scope.

## Quick Reference

| User Says | Action |
|-----------|--------|
| "commit" | Check branch, then commit |
| "save" | Same as commit |
| "push" | Commit first, then advise: `/git-main` to push to main |
| "push to main" | Commit first, then use `/git-main` |
| "create PR" | Commit first, then advise: `/git-main` (or `/git-staging` if using Gitflow) |
| "emergency fix" | Use `/git-hotfix` |

## What This Skill Does NOT Do

- **No push** — use `/git-main` to push/PR to main (or `/git-dev` in Gitflow mode)
- **No PR creation** — use `/git-main`, `/git-dev`, `/git-staging`, or `/git-production` for PR workflows
- **No scope moves beyond review→completed** — each lifecycle step is its own skill
