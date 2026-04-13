---
name: scope-implement
description: Executes scope documents end-to-end following defined phases and checkpoints. Use when ready to implement a scoped feature, executing planned work, or following a scope.
user-invocable: true
---

# /scope-implement - Execute a Scope

## Workflow

### 0. Record Session ID

1. Run: `bash .claude/hooks/get-session-id.sh` — capture the UUID output
2. Read the scope file's YAML frontmatter `sessions` field
3. If `sessions:` key doesn't exist in frontmatter, add `sessions: {}` after `tags:`
4. If the UUID is NOT already in `sessions.implementScope`, append it (skip if duplicate)
5. Write the updated frontmatter back to the scope file

### 1. Read Scope

- Read `scopes/*{NNN}*.md` or `scopes/implementing/*{NNN}*.md` (also check `scopes/backlog/`)
- Understand: goal, files affected, phases, success criteria
- Check DASHBOARD for current progress (resuming?)
- Check PROCESS Implementation Log for prior work
- Create todo list for tracking

### 2. Implement

**Before starting Phase 1**: Read the scope's frontmatter `status` field. If the scope is not already in `implementing`, transition it and update the DASHBOARD to `🔄 **Status**: Implementing`:

```bash
# Use the scope's CURRENT status as the source (backlog, planning, review, completed, etc.)
bash .claude/hooks/scope-transition.sh --from <current-status> --to implementing --scope {NNN}
```

If the scope is already `status: implementing` (resuming), skip the transition.

For each phase:

1. **Update DASHBOARD** — Mark phase as `🔄 In Progress`
2. **Execute** the phase changes
3. **Verify** — Run configured verification commands from `.claude/orbital.config.json`:
      - Run `commands.typeCheck` (if configured, skip if null)
      - Run `commands.build` (if configured, skip if null)
4. **Log** — Append to PROCESS Implementation Log:
   ```markdown
   ### Phase N: Completed YYYY-MM-DD HH:MM
   - [What was done]
   - [Issues encountered, if any]
   - Commit: `hash`
   - Time: X minutes
   ```
5. **Update DASHBOARD** — Mark phase as `✅ Done`

If deviating from spec:
- Document in PROCESS > Deviations from Spec section
- Include: what was specified, what was done, why

### 3. Validate

- Run configured verification commands from `.claude/orbital.config.json`:
  - Read `.claude/orbital.config.json` for commands configuration
  - Run `commands.typeCheck` (if configured, skip if null)
  - Run `commands.lint` (if configured, skip if null)
  - Run `commands.build` (if configured, skip if null)
  - Run `commands.test` (if configured, skip if null)
- Fix any issues found

**Self-assess Definition of Done** — before finishing, honestly evaluate each DoD item:

1. Read the `### Definition of Done` section in the scope document
2. For each `- [ ]` item, determine whether it was genuinely completed and verified during this implementation
3. Check `- [x]` items that you can confirm are true (e.g., you ran the build and it passed)
4. **Leave unchecked** `- [ ]` any items you did NOT complete or cannot verify — do not assume
5. If any items remain unchecked, explain why in PROCESS > Implementation Log

This self-assessment is what the reviewer will use to gauge completeness. Be honest — unchecked items are fine and expected when something couldn't be verified (e.g., "Visual verification in browser"). Checking a box you didn't verify is worse than leaving it unchecked.

- Update DASHBOARD to `🏁 **Status**: Implemented | Awaiting Review`
- **Keep the file in `scopes/implementing/`** — do NOT move to review or update frontmatter status

### Implementation Complete

After Step 3, the scope remains in `scopes/implementing/` with `status: implementing`. Output:

```
╔═══════════════════════════════════════════════════════════════╗
║  Implementation complete. Scope ready for review.            ║
║                                                              ║
║  Next: /scope-verify {NNN} (in a NEW session)                ║
║                                                              ║
║  The review gate must be run by a different session           ║
║  than the one that implemented the scope.                    ║
╚═══════════════════════════════════════════════════════════════╝
```

**Do NOT proceed to review in this session.** The review gate enforces session separation to ensure the implementing agent doesn't approve its own work.

### 4. Signal Completion (REQUIRED)

**Always emit when finished** — this is not optional. Emit success or failure so the dispatch resolves immediately:

```bash
# On success:
bash .claude/hooks/orbital-emit.sh AGENT_COMPLETED '{"outcome":"success","action":"implement"}' --scope "{NNN}"

# On failure (build errors, blocked, etc.):
bash .claude/hooks/orbital-emit.sh AGENT_COMPLETED '{"outcome":"failure","action":"implement"}' --scope "{NNN}"
```

## Resuming After Compaction

1. Read scope doc (check `scopes/implementing/`, `scopes/backlog/`, and `scopes/`)
2. Check DASHBOARD for current phase status
3. Check PROCESS Implementation Log for last completed phase
4. Check git status for uncommitted work
5. Resume from next pending phase

## Agent Selection Guide

Select agents based on the project's `.claude/config/agent-triggers.json` configuration. The trigger file maps file patterns to the agents that should review changes in those areas.
