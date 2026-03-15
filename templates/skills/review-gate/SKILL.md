---
name: review-gate
description: Formal review gate that wraps /test all and adds scope-specific checks before allowing completion. Use when a scope is in review state and ready for formal verification.
user-invocable: false
---

# /scope review-gate NNN — Formal Review Gate

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
     ❌ Session separation violation: You implemented this scope.
        A different session must run the review gate.
        Start a new Claude Code session and run: /scope review-gate NNN
     ```

### Step 2: Run /test all (Phases 1-4)

Invoke the full validation suite:
```
Skill(skill: "all")
```

This covers:
- **Criterion 2** (No shortcuts): Pre-commit checks 8-11 (placeholders, mock data, shortcuts, secrets)
- **Criterion 3** (Pattern adherence): Code-reviewer agent (Phase 3)
- **Criterion 4** (Rule compliance): Rule enforcement check (Pre-commit check 7)
- **Criterion 5** (Code cleanliness): TypeScript, ESLint, Build (Pre-commit checks 1-3)

**If any BLOCKER is found**: Stop immediately. Do NOT write a verdict file. Report the blockers and exit.

### Step 3: Scope-Specific Checks

Run 3 checks that `/test all` doesn't cover:

#### 3a. Spec Compliance (Agent Judgment)

1. Read the scope's **SPECIFICATION** section (Part 2):
   - Requirements (Must Have, Nice to Have)
   - Implementation Phases
   - Success Criteria
   - Definition of Done
2. Run `git diff main...HEAD -- $(list files from scope's Files Summary table)` to see what actually changed
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
    "test_all": {
      "verdict": "PASS|FAIL",
      "evidence": "<summary of test results>"
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
   - **test_all**: PASS/FAIL — <evidence>
   - **spec_compliance**: PASS/FAIL — <evidence>
   - **no_followon_work**: PASS/FAIL — <evidence>
   - **project_validation**: PASS/FAIL — <evidence>
   ```

### Step 6: Scope Transition (on PASS only)

If all criteria passed:
1. Move scope file: `mv scopes/implementing/{file} scopes/review/` (or leave in place if already in `scopes/review/`)
2. Update frontmatter: `status: review`
3. Update DASHBOARD: `✅ **Status**: Reviewed | Ready to Commit`

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
║  Fix the issues, then re-run: /scope review-gate NNN         ║
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
║  Next: /work save to commit.                                 ║
╚═══════════════════════════════════════════════════════════════╝
```

Then emit the success event:
```bash
bash .claude/hooks/orbital-emit.sh AGENT_COMPLETED '{"outcome":"success","verdict":"PASS"}' --scope "{NNN}"
```

**Do NOT auto-chain** into `/scope complete` or `/work save`. The next step is manual.

## Important Notes

- The verdict file is the **only** artifact that unlocks committing via `/work save`
- The `review-gate-check.sh` hook enforces this at the Edit tool level
- Re-running the review gate overwrites the previous verdict file
- Session separation is enforced at both skill level (Step 1) and hook level
- On PASS, the scope moves to `scopes/review/` — `/work save` handles the next transition
