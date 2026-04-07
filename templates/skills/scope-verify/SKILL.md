---
name: scope-verify
description: Formal review gate that checks spec compliance, session separation, and test gate results before allowing completion. Use when a scope is in review state and ready for formal verification.
user-invocable: true
---

# /scope-verify NNN — Formal Review Gate

Runs a comprehensive review of a scope before it can be marked as completed. This is the **only** path to completion — the implementing session cannot complete its own work.

## Prerequisites

- Scope must be in `scopes/implementing/` (primary) or `scopes/review/` (re-runs)
- Scope must have `sessions.implementScope` recorded (implementation happened)
- Current session must be **different** from the implementing session

## Workflow

### Step 0: Record Session ID

1. Run: `bash .claude/hooks/get-session-id.sh` — capture the UUID output
2. Read the scope file's YAML frontmatter `sessions` field
3. If `sessions:` key doesn't exist in frontmatter, add `sessions: {}` after `tags:`
4. If the UUID is NOT already in `sessions.reviewGate`, append it (skip if duplicate)
5. Write the updated frontmatter back to the scope file

### Step 1: Validate Preconditions

1. Find the scope file: `scopes/implementing/*{NNN}*.md` (primary) or `scopes/review/*{NNN}*.md` (re-runs)
   - If not found in either directory, error: "Scope NNN not found."
2. Read frontmatter — verify `status: implementing` or `status: review`
3. Read `sessions.implementScope` — must exist and be non-empty
4. **Session separation**: Compare current session UUID with ALL UUIDs in `sessions.implementScope`
   - If current UUID appears in `implementScope` → **BLOCK**:
     ```
     Session separation violation: You implemented this scope.
        A different session must run the review gate.
        Start a new Claude Code session and run: /scope-post-review NNN
     ```

### Step 2: Check Test Gate Results

Before proceeding, verify that `/test-checks` and `/test-code-review` have been run. This skill does NOT embed the full test suite itself — it checks whether test results already exist.

1. Check for recent test gate results (e.g., gate reports from Orbital Command, or recent passing test output in the session)
2. If no test results exist, **BLOCK**:
   ```
   Test gate results not found. Run /test-checks and /test-code-review first,
   then re-run /scope-post-review NNN.
   ```
3. If test results exist but contain failures, **BLOCK** and report the failures.

### Step 3: Scope-Specific Checks

Run 3 checks that the test gates don't cover:

#### 3a. Spec Compliance (Agent Judgment)

1. Read the scope's **SPECIFICATION** section (Part 2):
   - Requirements (Must Have, Nice to Have)
   - Implementation Phases
   - Success Criteria
   - Definition of Done
2. Read `baseCommit` from scope frontmatter (set when scope entered implementing)
   - If `baseCommit` exists: `git diff ${baseCommit}...HEAD -- $(list files from scope's Files Summary table)`
   - If `baseCommit` missing and `WORKFLOW_BRANCHING_MODE=worktree`: `git diff main...HEAD -- $(list files)`
   - If `baseCommit` missing and trunk mode: `git diff HEAD~10...HEAD -- $(list files)` (heuristic fallback)
3. Cross-reference each "Must Have" requirement against the actual changes
4. Verify each Success Criteria item is addressed
5. **Verdict**: PASS if all Must Have requirements and Success Criteria are addressed, FAIL otherwise
6. **Evidence**: List each requirement and whether it was found in the diff

#### 3b. No Follow-on Work (Agent Judgment)

1. Read the scope's **PROCESS** section (Part 3):
   - Check "Deviations from Spec" for any items marked as deferred
   - Check Implementation Log for TODOs or "will do later" language
2. Read the scope's **AGENT REVIEW** section:
   - Check for unresolved BLOCKERs
3. Read the scope's **DASHBOARD** section:
   - Check all phases are marked `✅ Done`
   - Check for incomplete Next Actions
4. **Verdict**: PASS if no deferred work is found, FAIL otherwise
5. **Evidence**: List any deferred items found (or "No deferred items, 0 unresolved blockers")

#### 3c. Project-Specific Validation (Machine-Verifiable)

Run any project-specific validation commands from `orbital.config.json`:
- Run `commands.validateTemplates` (if configured, skip if null)
- Run `commands.validateDocs` (if configured, skip if null)
- Run `commands.checkRules` (if configured, skip if null)

1. If no project-specific commands are configured → **PASS** with evidence "No project-specific validations configured"
2. If commands are configured:
   - Run each non-null command
   - **Verdict**: PASS if all configured commands succeed, FAIL otherwise
3. **Evidence**: List commands run and their results

### Step 4: Write Verdict File

Write the verdict to `.claude/review-verdicts/{NNN}.json`:

```json
{
  "scopeId": NNN,
  "verdict": "PASS|FAIL",
  "reviewSession": "<current-session-uuid>",
  "implementSession": "<first-uuid-from-sessions.implementScope>",
  "reviewedAt": "<ISO-8601-timestamp>",
  "criteria": {
    "test_gates": {
      "verdict": "PASS|FAIL",
      "evidence": "<summary of /test-checks and /test-code-review results>"
    },
    "spec_compliance": {
      "verdict": "PASS|FAIL",
      "evidence": "<list of requirements checked>"
    },
    "no_followon_work": {
      "verdict": "PASS|FAIL",
      "evidence": "<deferred items or 'none found'>"
    },
    "project_validation": {
      "verdict": "PASS|FAIL",
      "evidence": "<validation status>"
    }
  }
}
```

Overall verdict is PASS only if ALL 4 criteria are PASS.

### Step 5: Update Scope

1. Update the scope's **AGENT REVIEW** section with a review gate summary:
   ```markdown
   ### Review Gate — YYYY-MM-DD
   - **Verdict**: PASS/FAIL
   - **Session**: <uuid>
   - **test_gates**: PASS/FAIL — <evidence>
   - **spec_compliance**: PASS/FAIL — <evidence>
   - **no_followon_work**: PASS/FAIL — <evidence>
   - **project_validation**: PASS/FAIL — <evidence>
   ```

### Step 6: Scope Transition (on PASS only)

If all criteria passed:
1. Transition the scope (handles frontmatter + file move atomically):
   ```bash
   bash .claude/hooks/scope-transition.sh --from implementing --to review --scope {NNN}
   ```
2. Update DASHBOARD: `✅ **Status**: Reviewed | Ready to Commit`

### Step 7: Report & Next Steps

**If any FAIL**:
```
╔═══════════════════════════════════════════════════════════════╗
║  ❌ REVIEW GATE FAILED — Scope NNN                          ║
╠═══════════════════════════════════════════════════════════════╣
║  Failed criteria:                                            ║
║  • spec_compliance: [evidence]                               ║
║  • no_followon_work: [evidence]                              ║
║                                                              ║
║  Fix the issues, then re-run: /scope-post-review NNN              ║
╚═══════════════════════════════════════════════════════════════╝
```

Scope stays in `scopes/implementing/` on failure.

Then emit the FAIL event and stop:
```bash
bash .claude/hooks/orbital-emit.sh AGENT_COMPLETED '{"outcome":"failure","verdict":"FAIL"}' --scope "{NNN}"
```

**If all PASS**:
```
╔═══════════════════════════════════════════════════════════════╗
║  ✅ REVIEW GATE PASSED — Scope NNN                          ║
╠═══════════════════════════════════════════════════════════════╣
║  All 4 criteria passed. Verdict written to:                  ║
║  .claude/review-verdicts/NNN.json                            ║
║                                                              ║
║  Scope moved to review. Ready to commit.                     ║
║  Next: /git-commit to commit.                                ║
╚═══════════════════════════════════════════════════════════════╝
```

Then emit the success event:
```bash
bash .claude/hooks/orbital-emit.sh AGENT_COMPLETED '{"outcome":"success","verdict":"PASS"}' --scope "{NNN}"
```

**Do NOT auto-chain** into `/scope complete` or `/git-commit`. The next step is manual.

## Important Notes

- The verdict file is the **only** artifact that unlocks committing via `/git-commit`
- The `review-gate-check.sh` hook enforces this at the Edit tool level
- Re-running the review gate overwrites the previous verdict file
- Session separation is enforced at both skill level (Step 1) and hook level
- On PASS, the scope moves to `scopes/review/` — `/git-commit` handles the next transition
