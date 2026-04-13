---
name: scope-post-review
description: Orchestrates post-implementation review — runs quality gates, formal verification, code review, and optional agent-team fix execution. Use when a scope is ready to move from implementing to review.
user-invocable: true
orchestrates: [test-scaffold, test-checks, scope-verify, test-code-review, scope-fix-review]
---

# /scope-post-review NNN — Post-Implementation Review

Orchestrates the full post-implementation review pipeline for a scope. Runs up to four phases sequentially — each must pass before the next begins.

## Pipeline

```
┌─────────────────────────────────────────────────────────────────┐
│                     /scope-post-review NNN                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Phase 0: Test infrastructure check                            │
│  └── If commands.test is null → /test-scaffold                 │
│      Analyzes project, installs framework, writes tests.       │
│      SKIPPED if tests already configured.                      │
│                                                                 │
│  Phase 1: /test-checks                                         │
│  └── 13 machine-verifiable quality gates                       │
│      Types, lint, build, templates, docs, enforcement, etc.    │
│      MUST PASS before proceeding.                              │
│                                                                 │
│  Phase 2: /scope-verify NNN                                    │
│  └── Formal review gate                                        │
│      Session separation, spec compliance, no follow-on work    │
│      Writes verdict file. MUST PASS before proceeding.         │
│                                                                 │
│  Phase 3: /test-code-review                                    │
│  └── 6 parallel AI code review agents                          │
│      code-reviewer, silent-failure-hunter, code-simplifier,    │
│      comment-analyzer, pr-test-analyzer, type-design-analyzer  │
│      Reports findings. Proceeds to Phase 4 if findings exist.  │
│                                                                 │
│  Phase 4: /scope-fix-review NNN (if agent teams enabled)       │
│  └── Coordinated agent team fixes all Phase 3 findings         │
│      Groups by file ownership, spawns teammates, verifies.     │
│      Requires CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1.          │
│      Skipped if no findings or agent teams not enabled.        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Rationale**: Test infrastructure is checked first so that gate #13 (tests) has something to run. Quality gates run next to catch obvious issues cheaply. Spec verification runs third to confirm the implementation is actually complete before spending tokens on AI code review. Code review runs fourth on verified, passing code. Fix execution runs last, using an agent team to address all findings in parallel across non-overlapping file domains.

## Steps

### Phase 0: Test Infrastructure Check

Ensure the project has a test suite before running quality gates. This runs in a subagent to keep the main post-review context clean — the scaffolding work (codebase analysis, package installs, writing test files) can be extensive and is not relevant to the review phases that follow.

1. Read `.claude/orbital.config.json`
2. Check `commands.test`:
   - **If non-null** → tests are configured. Print:
     ```
     Phase 0: Tests configured (commands.test = "<value>") — skipping.
     ```
     **Skip** to Phase 1.
   - **If null** → no test suite configured. Print:
     ```
     Phase 0: No test suite configured — scaffolding tests via subagent...
     ```
     Launch a subagent to scaffold the test suite:
     ```
     Agent(
       description: "Scaffold test infrastructure",
       prompt: "Run the /test-scaffold skill for this project. The project has no test suite configured (commands.test is null in .claude/orbital.config.json). Follow the skill instructions to: detect the project stack, choose a test framework, install it, write real tests, verify they pass, and update commands.test in .claude/orbital.config.json. Report what you did when finished.",
       mode: "auto"
     )
     ```
3. After the subagent completes:
   - Re-read `.claude/orbital.config.json` and confirm `commands.test` is now non-null
   - Run the configured test command to verify tests actually pass:
     ```bash
     <commands.test value>   # e.g., npm run test
     ```
   - **If `commands.test` is still null or tests fail:**
     ```
     ╔═══════════════════════════════════════════════════════════════╗
     ║  Phase 0 FAILED — Test scaffolding did not produce passing   ║
     ║  tests. Fix manually and re-run: /scope-post-review NNN     ║
     ╚═══════════════════════════════════════════════════════════════╝
     ```
     Emit failure and **STOP** — do not proceed to Phase 1 with broken tests:
     ```bash
     bash .claude/hooks/orbital-emit.sh AGENT_COMPLETED '{"outcome":"failure","action":"post_review","phase":0}' --scope "{NNN}"
     ```
   - **If tests pass** → continue to Phase 1.

### Phase 1: Quality Gates (`/test-checks`)

Run the 13 quality gates. This is the cheapest and fastest check.

1. Invoke: `Skill(skill: "test-checks")`
2. If any gates FAIL:
   ```
   ╔═══════════════════════════════════════════════════════════════╗
   ║  Phase 1 FAILED — Quality gates did not pass                 ║
   ║                                                               ║
   ║  Fix the failing gates and re-run: /scope-post-review NNN    ║
   ╚═══════════════════════════════════════════════════════════════╝
   ```
   Emit failure and **STOP** — do not proceed to Phase 2:
   ```bash
   bash .claude/hooks/orbital-emit.sh AGENT_COMPLETED '{"outcome":"failure","action":"post_review","phase":1}' --scope "{NNN}"
   ```
3. If all gates PASS → continue to Phase 2.

### Phase 2: Formal Verification (`/scope-verify NNN`)

Run the scope-specific formal review gate.

1. Invoke: `Skill(skill: "scope-verify", args: "NNN")`
2. If verdict is FAIL:
   ```
   ╔═══════════════════════════════════════════════════════════════╗
   ║  Phase 2 FAILED — Scope verification did not pass            ║
   ║                                                               ║
   ║  Fix the issues and re-run: /scope-post-review NNN           ║
   ╚═══════════════════════════════════════════════════════════════╝
   ```
   Emit failure and **STOP** — do not proceed to Phase 3:
   ```bash
   bash .claude/hooks/orbital-emit.sh AGENT_COMPLETED '{"outcome":"failure","action":"post_review","phase":2}' --scope "{NNN}"
   ```
3. If verdict is PASS → continue to Phase 3.

### Phase 3: AI Code Review (`/test-code-review`)

Run the 6 parallel code review agents on the verified code.

1. Invoke: `Skill(skill: "test-code-review")`
2. Collect all findings — count BLOCKERS, WARNINGS, and SUGGESTIONS.
3. **Persist findings** — write all findings to `.claude/review-findings/NNN.json` so Phase 4 can read them even if run standalone in a separate session:
   ```json
   { "scopeId": NNN, "timestamp": "<ISO>", "blockers": [...], "warnings": [...], "suggestions": [...] }
   ```
4. If there are **any findings** (blockers, warnings, or suggestions), proceed to Phase 4.
5. If there are **zero findings**, skip Phase 4 and go to Final Report.

### Phase 4: Fix Review Findings (`/scope-fix-review NNN`)

Execute all Phase 3 findings using a coordinated agent team. **This phase requires `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`.**

1. Check if agent teams are enabled:
   ```bash
   echo "${CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS:-not set}"
   ```
2. If **enabled** (`1`) and Phase 3 produced findings:
   - If `.claude/review-findings/NNN.json` exists, load findings from there (enables standalone `/scope-fix-review` without re-running Phase 3)
   - Invoke: `Skill(skill: "scope-fix-review", args: "NNN")`
   - This spawns an agent team that fixes all findings in parallel across non-overlapping file domains
   - After fixes complete, **re-run quality gates** to catch regressions:
     ```
     Skill(skill: "test-checks")
     ```
     If any gate fails, report which gates regressed, emit failure and **STOP**:
     ```bash
     bash .claude/hooks/orbital-emit.sh AGENT_COMPLETED '{"outcome":"failure","action":"post_review","phase":4}' --scope "{NNN}"
     ```
3. If **not enabled**:
   - Read `~/.claude/settings.json`
   - Merge `"env": { "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1" }` into the existing JSON (preserve all other settings)
   - Write the updated file back
   - Inform the user:
   ```
   ╔═══════════════════════════════════════════════════════════════╗
   ║  Phase 4 SKIPPED — Agent teams were not enabled              ║
   ║                                                               ║
   ║  Phase 3 found [N] issues that could be auto-fixed.          ║
   ║  Agent teams have now been enabled in ~/.claude/settings.json ║
   ║                                                               ║
   ║  Restart your session, then re-run:                           ║
   ║    /scope-fix-review NNN                                      ║
   ║                                                               ║
   ║  Or fix findings manually and re-run: /scope-post-review NNN ║
   ╚═══════════════════════════════════════════════════════════════╝
   ```
   Phase 4 is skipped but does **not** block the pipeline. The setting is enabled for next time.

### Final Report

Emit the completion event so the dispatch resolves and the dashboard card stops showing the active animation:
```bash
bash .claude/hooks/orbital-emit.sh AGENT_COMPLETED '{"outcome":"success","action":"post_review"}' --scope "{NNN}"
```

```
╔═══════════════════════════════════════════════════════════════╗
║  /scope-post-review COMPLETE — Scope NNN                     ║
╠═══════════════════════════════════════════════════════════════╣
║                                                               ║
║  Phase 1: Quality Gates      ✅ PASSED                       ║
║  Phase 2: Scope Verification ✅ PASSED                       ║
║  Phase 3: Code Review        [N blockers, M warnings]        ║
║  Phase 4: Fix Execution      ✅ DONE / ⏭ SKIPPED            ║
║                                                               ║
║  Scope is in review. Next: /git-commit                       ║
╚═══════════════════════════════════════════════════════════════╝
```

## Notes

- Each phase can be run independently: `/test-checks`, `/scope-verify NNN`, `/test-code-review`, `/scope-fix-review NNN`
- Phase 2 (`/scope-verify`) enforces session separation — this skill must be run in a different session than the implementing session
- Phase 2 writes the verdict file that unlocks `/git-commit`
- Phase 3 findings flow into Phase 4 — the agent team addresses all issues found
- Phase 4 requires `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` — skipped gracefully if not enabled
- Phase 4 can also be run standalone: `/scope-fix-review NNN` (after running `/test-code-review`)
