---
name: scope-fix-review
description: Executes all code review findings from Phase 3 using a coordinated agent team. Requires CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1.
user-invocable: true
agent-mode: team
requires: CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS
---

# /scope-fix-review NNN — Fix All Code Review Findings With Agent Team

Takes ALL findings from the Phase 3 code review (`/test-code-review`) and executes fixes using a coordinated agent team. Each teammate owns a non-overlapping slice of the codebase to avoid conflicts.

## Prerequisites

- Phase 3 (`/test-code-review`) must have been run in the current post-review pipeline
- Code review findings must exist in the conversation context
- `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` must be enabled (a hook will block this skill otherwise)

## Steps

### Step 0: Record Session ID

1. Run: `bash .claude/hooks/get-session-id.sh` — capture the UUID output
2. Find the scope file: `scopes/review/*{NNN}*.md` (primary) or `scopes/implementing/*{NNN}*.md`
3. Read the scope file's YAML frontmatter `sessions` field
4. If `sessions:` key doesn't exist in frontmatter, add `sessions: {}` after `tags:`
5. If the UUID is NOT already in `sessions.fixReview`, append it (skip if duplicate)
6. Write the updated frontmatter back to the scope file

### Step 1: Validate Environment

1. Confirm agent teams are enabled — if the hook didn't catch it, verify:
   ```bash
   echo "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=${CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS:-not set}"
   ```
   If not set to `1`:
   - Read `~/.claude/settings.json`
   - Merge `"env": { "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1" }` into the existing JSON (preserve all other settings)
   - Write the updated file back to `~/.claude/settings.json`
   - Inform the user the setting was enabled and they need to restart the session for it to take effect
   - **STOP** — the env var won't be available until the next session

### Step 2: Collect and Organize Findings

1. Gather ALL findings from the Phase 3 code review (from conversation context)
2. Deduplicate findings across the 6 review agents
3. Group findings by **file ownership domain**:

| Domain | File Patterns | Typical Agent Name |
|--------|--------------|-------------------|
| Server | `server/**/*.ts` | `server-agent` |
| Frontend | `src/**/*.{ts,tsx}` (excluding `src/types/`) | `frontend-agent` |
| Shared/Types | `shared/**/*.ts`, `src/types/**/*.ts` | `types-agent` |
| CLI/Templates | `bin/**/*.js`, `templates/**/*` | `templates-agent` |

4. Within each domain, order findings by severity: CRITICAL > HIGH > MEDIUM > LOW
5. Identify cross-domain dependencies (e.g., type changes that require import updates)

### Step 3: Create the Agent Team

```
TeamCreate(team_name: "review-fixes", description: "Fix all Phase 3 code review findings")
```

### Step 4: Create Tasks With Dependencies

Create one task per domain group. Each task description MUST include:
- Every finding in that domain with file path, line number, and exact fix
- Severity level for prioritization
- The agent's file ownership boundary (what it can and cannot modify)

**Dependency rules:**
- Server, Frontend, and CLI/Templates tasks can run in parallel (no file overlap)
- Types/Shared task should be blocked by Server task (if both modify `server/services/` files)
- A final Verification task should be blocked by ALL other tasks

**Verification task** (always last):
```
TaskCreate(
  subject: "Run typecheck and build verification",
  description: "Run tsc --noEmit, tsc --noEmit -p tsconfig.server.json, vite build, and bash -n on all shell scripts. Fix any compilation errors."
)
```

### Step 5: Spawn Teammates

Spawn one teammate per domain that has findings. Each teammate prompt MUST include:

1. **File ownership boundary** — explicit list of directories/files they own
2. **Instruction to NOT modify** files outside their ownership
3. **Instruction to read files BEFORE editing** (other agents may be modifying nearby files)
4. **The task number(s) to claim**
5. **Mode**: `bypassPermissions`

**Example spawn:**
```
Agent(
  name: "server-agent",
  team_name: "review-fixes",
  mode: "bypassPermissions",
  prompt: "You are on the review-fixes team. You own server/ files ONLY.
           Claim task #1. Read each file before editing. Do not modify shared/, src/, bin/, or templates/."
)
```

**Guidelines for team size:**
- Only spawn agents for domains that have findings
- 2-4 agents is typical (one per domain with findings)
- Do NOT spawn agents for domains with no findings

### Step 6: Monitor and Coordinate

1. As teammates complete tasks, check if blocked tasks are now unblocked
2. When the Types/Shared task unblocks, spawn the types agent (or assign if already spawned)
3. Shut down teammates as they finish (`shutdown_request`)
4. When all implementation tasks complete, handle the Verification task yourself:
   - Run `tsc --noEmit` (client + shared)
   - Run `tsc --noEmit -p tsconfig.server.json` (server + shared)
   - Run `vite build` (production build)
   - Run `bash -n` on any modified shell scripts
   - Fix any type errors introduced by teammates

### Step 7: Report Results

```
╔═══════════════════════════════════════════════════════════════╗
║  /scope-fix-review COMPLETE — Scope NNN                      ║
╠═══════════════════════════════════════════════════════════════╣
║                                                               ║
║  Findings addressed: XX / YY                                  ║
║  Tasks completed:    N / N                                    ║
║  Typecheck:          ✅ PASSED                                ║
║  Build:              ✅ PASSED                                ║
║                                                               ║
║  Agents used:                                                 ║
║    server-agent:     [N findings fixed]                       ║
║    frontend-agent:   [N findings fixed]                       ║
║    types-agent:      [N findings fixed]                       ║
║    templates-agent:  [N findings fixed]                       ║
║                                                               ║
║  Next: /git-commit                                            ║
╚═══════════════════════════════════════════════════════════════╝
```

### Step 8: Emit Completion Event

```bash
bash .claude/hooks/orbital-emit.sh REVIEW_FIXES_COMPLETED \
  '{"scope_id":"NNN","findings_total":YY,"findings_fixed":XX,"agents_used":N}' \
  --scope "NNN"
```

## Important Rules

1. **Never use parallel subagents** (`Agent` with `run_in_background`) — always use `TeamCreate` + `Agent` with `team_name`
2. **File ownership is sacred** — each agent MUST stay within its domain boundary
3. **Read before edit** — agents MUST read files before modifying them
4. **Verify at the end** — always run typecheck + build after all agents finish
5. **Shut down agents cleanly** — send `shutdown_request` when each agent finishes
6. **Dependencies matter** — types/shared changes should happen AFTER server changes if they touch the same files

## On Failure

If teammates encounter errors they cannot resolve:
1. The teammate should message the team lead with the specific error
2. The team lead can provide guidance or reassign the task
3. If a fix is infeasible, log it as a remaining finding in the final report
4. The skill still completes — unresolvable findings are reported, not blocking
