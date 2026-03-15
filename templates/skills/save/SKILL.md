---
name: save
description: Entry point for committing work that routes to the proper git workflow. Use when user says commit, save, or push to ensure correct branch handling.
user-invocable: false
---

# /work save - Commit Work to Feature Branch

**Use when the user asks to "commit", "save", or similar.**

## Workflow

### Step 0: Record Session ID

1. Run: `bash .claude/hooks/get-session-id.sh`
2. For each scope in `scopes/review/` with a passing verdict:
   - Append session UUID to `sessions.save` in frontmatter

### Step 1: Check Branch

```bash
git branch --show-current
```

- **Block** if on `main`, `staging`, or `dev` — must be on a feature branch
- Advise: `git checkout -b feat/descriptive-name`

### Step 2: Scope Transition (local only)

Find scopes in `scopes/review/` that have a passing verdict:

1. List files in `scopes/review/*.md`
2. For each, extract the scope number and check `.claude/review-verdicts/{NNN}.json`
3. If verdict exists and `verdict === "PASS"`:
   - `mv scopes/review/{file} scopes/completed/`
   - Update frontmatter: `status: completed`
   - Update DASHBOARD: `📦 **Status**: Committed`
4. If scope is in `scopes/review/` with **no** passing verdict:
   - Warn: "Scope {NNN} is in review but hasn't passed the review gate."
   - Suggest: "Run `/scope review-gate {NNN}` before committing."
   - **Advisory only** — don't block the commit (intermediate commits are fine)

### Step 3: Commit

```bash
git add <specific code files — scopes are gitignored>
git commit -m "type(scope): description"
```

- Stage only code files (scopes/ is gitignored, no need to worry about them)
- Follow conventional commit format
- Do NOT push or create PRs — those are separate skills

### Step 4: Signal Completion

If working on a dispatched scope, emit the agent completion event:

```bash
bash .claude/hooks/orbital-emit.sh AGENT_COMPLETED '{"outcome":"success","action":"save"}' --scope "{NNN}"
```

## Quick Reference

| User Says | Action |
|-----------|--------|
| "commit" | Check branch, then commit |
| "save" | Same as commit |
| "push" | Commit first, then advise: `/git pr-dev` to merge into dev |
| "push to main" | STOP — explain the workflow: save → pr-dev → pr-staging → pr-production |
| "create PR" | Commit first, then advise: `/git pr-staging` |
| "emergency fix" | Use `/git hotfix` |

## What This Skill Does NOT Do

- **No push** — use `/git pr-dev` to merge feature→dev
- **No PR creation** — use `/git pr-staging` for dev→staging PRs
- **No scope moves beyond review→completed** — each lifecycle step is its own skill
