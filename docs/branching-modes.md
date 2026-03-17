# Branching Modes & Workflow Changes

This document explains how Orbital Command's workflow system now works, including the two branching modes, the new default workflow, and the safety improvements introduced alongside them.

---

## Two Branching Modes

Every workflow config now has an optional `branchingMode` field (`"trunk"` or `"worktree"`). If omitted, it defaults to `"trunk"`.

### Trunk Mode (default)

All work happens on the current branch. This is the simplest setup — there's no branch switching, no worktree creation, and no isolation between concurrent scopes.

| Aspect | Behavior |
|--------|----------|
| Branch | Work happens on whatever branch you're on (including `main`) |
| Commits | `/work save` allows commits on any branch |
| Push to main | `/git pr-main` pushes directly or creates a PR depending on current branch |
| Concurrent scopes | Scopes share the same working directory — one at a time is safest |
| Best for | Solo developers, small projects, rapid iteration |

### Worktree Mode

Each scope gets its own `git worktree`, providing true filesystem isolation for parallel work. When a scope is dispatched to `implementing`, Orbital creates a worktree at `.worktrees/scope-{NNN}` on branch `feat/scope-{NNN}`.

| Aspect | Behavior |
|--------|----------|
| Branch | Each scope runs on its own `feat/scope-{NNN}` branch in its own directory |
| Commits | `/work save` commits on the scope's feature branch |
| Push to main | `/git pr-main` always creates a PR from the feature branch |
| Concurrent scopes | Fully isolated — multiple scopes can run in parallel without conflicts |
| Best for | Teams, complex projects, parallel scope execution |

**Worktree lifecycle:**

```
Dispatch to implementing
  └─ git worktree add .worktrees/scope-{NNN} -b feat/scope-{NNN}
  └─ Symlink: .worktrees/scope-{NNN}/scopes → {project}/scopes
  └─ Symlink: .worktrees/scope-{NNN}/.claude → {project}/.claude
  └─ Claude session launches inside the worktree directory

Scope completes (or fails)
  └─ git worktree remove .worktrees/scope-{NNN} --force
  └─ git branch -d feat/scope-{NNN}  (if merged)
```

The symlinks ensure that scope files and Claude hooks/config are shared across all worktrees — they're the same files, not copies.

---

## Two Default Workflows

### Default (new) — 7 lists, trunk mode

The new default is a simpler, trunk-based workflow with no deployment pipeline. Work flows from idea to main in a straight line.

```
  Planning                Development              Main
┌──────────────────┐  ┌──────────────────────┐  ┌────────┐
│ Icebox → Planning│  │ Implementing → Review│  │  Main  │
│        → Backlog │  │            → Completed│  │        │
└──────────────────┘  └──────────────────────┘  └────────┘

Forward path:  icebox → planning → backlog → implementing → review → completed → main
Shortcuts:     planning → implementing (fast track), implementing → completed (skip review)
```

**Key properties:**
- `branchingMode: "trunk"`
- `terminalStatuses: ["main"]`
- `commitBranchPatterns: "^(main|feat/|fix/|scope/|chore/)"`
- No `lifecycle-gate` hook (no dev/staging/production pipeline)
- No `DEPLOY_STARTED` / `DEPLOY_HEALTHY` event inference

**The `completed → main` edge** uses the new `/git pr-main` skill, which detects branching mode and either pushes directly (trunk on main) or creates a PR (trunk on feature branch, or worktree mode).

### Gitflow (renamed from old default) — 9 lists, worktree mode

The previous default is now a preset called "Gitflow". It has the full dev/staging/production deployment pipeline.

```
  Planning            Development            Dev    Staging    Production
┌────────────┐  ┌──────────────────────┐  ┌──────┐ ┌──────┐  ┌──────────┐
│ Icebox     │  │ Implementing         │  │ Dev  │ │Staging│  │Production│
│ Planning   │  │ Review               │  │      │ │      │  │          │
│ Backlog    │  │ Completed            │  │      │ │      │  │          │
└────────────┘  └──────────────────────┘  └──────┘ └──────┘  └──────────┘

Forward path:  ... → completed → dev → staging → production
```

**Key properties:**
- `branchingMode: "worktree"`
- `terminalStatuses: ["completed", "dev", "staging", "production"]`
- Includes `lifecycle-gate` hook for git push/PR interception
- Includes `DEPLOY_STARTED` / `DEPLOY_HEALTHY` event inference

### Other Presets

| Preset | Lists | Mode | Notes |
|--------|-------|------|-------|
| Development | 5 (backlog→dev) | trunk | Lightweight dev workflow |
| Minimal | 3 (todo→done) | trunk | Kanban-style, no hooks |

---

## New Skill: `/git pr-main`

Handles the `completed → main` transition. Mode-aware:

| Mode | On main | On feature branch |
|------|---------|-------------------|
| Trunk | `git push origin main` | Asks: PR or direct merge |
| Worktree | N/A (always on feature branch) | `gh pr create --base main` |

**Batch support:** When dispatched as a batch, reads `MERGE_MODE` env var (`push`, `pr`, or `direct`) and `BATCH_SCOPE_IDS` to process multiple scopes.

---

## Updated Skills

### `/work save`

Now detects branching mode before checking the current branch:
- **Trunk mode:** Allows commits on any branch, including `main`
- **Worktree mode:** Allows commits on the worktree's feature branch
- **Gitflow mode:** Blocks commits on `main`, `staging`, `dev` (must be on a feature branch)

### `/git` Router

Detects mode and shows appropriate sub-commands:
- **Trunk:** `pr-main`, `hotfix`
- **Worktree/Gitflow:** `pr-main`, `pr-dev`, `pr-staging`, `pr-production`, `hotfix`

### `/scope review-gate`

Step 3a (Spec Compliance) now uses `baseCommit` from scope frontmatter for the diff baseline:
- If `baseCommit` exists: `git diff ${baseCommit}...HEAD`
- If missing + worktree mode: `git diff main...HEAD`
- If missing + trunk mode: `git diff HEAD~10...HEAD` (heuristic fallback)

The `baseCommit` SHA is recorded automatically by `scope-transition.sh` when a scope enters `implementing`.

### `/git hotfix`

Now detects branching mode. In trunk mode, Step 6 (Backport to Staging) is skipped since there's no staging branch.

---

## Batch Dispatch Changes

### Merge Mode Selector

The batch preflight modal now includes a merge mode selector with three options:
- **Push** (default in trunk) — `git push origin main`
- **PR** (default in worktree) — `gh pr create --base main`
- **Direct Merge** — `git checkout main && git merge ... && git push`

The selected mode is passed as `MERGE_MODE` env var to the launched CLI session.

### Dynamic Labels

Batch action labels (e.g., "Push to Main", "Merge to Dev") are now computed dynamically from the workflow engine rather than hardcoded. This means custom workflows automatically get correct labels.

---

## Safety Improvements

### Atomic File Operations (Part C)

**Problem:** `sed -i` on scope files could corrupt YAML frontmatter if two hooks ran concurrently (e.g., parallel scope transitions during batch dispatch).

**Fix:**
- `set_frontmatter()` now writes to a temp file and does an atomic `mv` (rename) instead of in-place sed
- `append_session_uuid()` rewritten as a single-pass `awk` script instead of 3+ sequential `sed -i` calls, also using temp+rename
- Workflow manifest writes in `workflow-service.ts` also use temp+rename

### File Locking (Part C)

**Problem:** Concurrent scope transitions for the same scope could race.

**Fix:** `scope-transition.sh` now acquires a PID-aware `mkdir` lock at `/tmp/orbital-scope-{ID}.lock` before transitioning. If the lock exists but the PID is dead, the stale lock is recovered. The lock is released via `trap EXIT`.

### baseCommit Recording (Part C)

When a scope transitions to `implementing`, the current `HEAD` SHA is recorded as `baseCommit` in the scope's frontmatter. This gives the review gate a reliable diff baseline in any branching mode.

### Session ID Collision Fix (Part D)

**Problem:** Session ID files were keyed by PID alone (`$PPID`). If a session exited and a new process reused the same PID, the new session would overwrite the old file and could be mistakenly associated with a different scope.

**Fix:**
- Session ID files now use `{PID}-{UUID}` format (e.g., `12345-abc123-...`)
- `get-session-id.sh` matches by PID prefix glob, with backward-compatible fallback to old format
- `end-session.sh` cleans up both formats
- `discoverNewSession()` in `terminal-launcher.ts` extracts PID prefixes for comparison
- Stale cleanup reduced from 24h to 4h with PID liveness checking
- Cycle detection added to process tree walk

### Manifest-Driven Session Enforcer (Part D)

**Problem:** `session-id-enforcer.sh` had a hardcoded case statement mapping target statuses to session keys. Custom workflows with different statuses would silently bypass enforcement.

**Fix:** The enforcer now sources the workflow manifest and looks up session keys from `WORKFLOW_EDGES`. Falls back to the hardcoded case statement only if the manifest file is missing (never silently disables enforcement).

### Remote-Agnostic Push Blocking (Part D)

**Problem:** `block-workarounds.sh` only blocked `git push origin main` — pushes to other remotes (e.g., `upstream`, `github`) were not caught.

**Fix:** The regex now matches any remote name, not just `origin`.

---

## Removed: Force Flag Bypass

Previously, the dispatch API accepted a `force` flag that skipped the active session guard, and the frontend sent `force: true` when an active session existed. This allowed launching duplicate sessions for the same scope.

The `force` flag has been removed from both the API and the frontend. If a scope has an active dispatch, a new dispatch will be rejected with a 409 conflict.

---

## Configuration

### Setting Branching Mode

**In the UI:** Workflow Config Settings panel now has a Branching Mode radio selector (Trunk / Worktree).

**In JSON:** Add `branchingMode` to your workflow config:
```json
{
  "version": 1,
  "name": "My Workflow",
  "branchingMode": "trunk",
  ...
}
```

**In the shell manifest:** The engine emits `WORKFLOW_BRANCHING_MODE="trunk"` (or `"worktree"`) in the auto-generated manifest. Skills read this to adapt their behavior.

### New API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/orbital/git/status` | GET | Returns `{ branch, dirty, detached }` |
| `/api/orbital/worktrees` | GET | Lists active git worktrees with branch and head info |

---

## File Inventory

| Category | Files Changed |
|----------|--------------|
| Schema + Engine | `shared/workflow-config.ts`, `shared/workflow-engine.ts`, `src/components/workflow/validateConfig.ts` |
| Presets | `templates/presets/default.json` (replaced), `templates/presets/gitflow.json` (new), `shared/default-workflow.json` (replaced), `templates/presets/development.json`, `templates/presets/minimal.json` |
| Skills | `templates/skills/pr-main/SKILL.md` (new), `templates/skills/git/SKILL.md`, `templates/skills/save/SKILL.md`, `templates/skills/review-gate/SKILL.md`, `templates/skills/hotfix/SKILL.md` |
| Frontend | `src/components/SprintContainer.tsx`, `src/components/BatchPreflightModal.tsx`, `src/components/DispatchPopover.tsx`, `src/components/workflow/ConfigSettingsPanel.tsx`, `src/hooks/useKanbanDnd.ts` |
| Server | `server/routes/dispatch-routes.ts`, `server/routes/sprint-routes.ts`, `server/routes/data-routes.ts`, `server/services/batch-orchestrator.ts`, `server/services/workflow-service.ts`, `server/utils/terminal-launcher.ts`, `server/utils/worktree-manager.ts` (new) |
| Hooks | `templates/hooks/scope-helpers.sh`, `templates/hooks/scope-transition.sh`, `templates/hooks/init-session.sh`, `templates/hooks/get-session-id.sh`, `templates/hooks/end-session.sh`, `templates/hooks/session-id-enforcer.sh`, `templates/hooks/block-workarounds.sh` |
| Config | `.gitignore` |
