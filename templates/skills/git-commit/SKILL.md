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
2. For each scope in `scopes/review/` with a passing verdict:
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

```bash
git add <specific code files — scopes are gitignored>
git commit -m "type(scope): description"
```

- Stage only code files (scopes/ is gitignored, no need to worry about them)
- Follow conventional commit format
- Do NOT push or create PRs — those are separate skills

### Step 4: Signal Completion (REQUIRED)

**Always emit after a successful commit** — this is not optional:

```bash
# With a scope:
bash .claude/hooks/orbital-emit.sh AGENT_COMPLETED '{"outcome":"success","action":"save"}' --scope "{NNN}"

# Without a scope (general commit):
bash .claude/hooks/orbital-emit.sh AGENT_COMPLETED '{"outcome":"success","action":"save"}'
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
