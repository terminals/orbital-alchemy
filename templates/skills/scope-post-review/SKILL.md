---
name: scope-post-review
description: Orchestrates post-implementation review — runs quality gates, formal verification, code review, and optional agent-team fix execution. Use when a scope is ready to move from implementing to review.
user-invocable: true
orchestrates: [test-checks, scope-verify, test-code-review, scope-fix-review]
---

# /scope-post-review NNN — Post-Implementation Review

Orchestrates the full post-implementation review pipeline for a scope. Runs up to four phases sequentially — each must pass before the next begins.

## Pipeline

```
┌─────────────────────────────────────────────────────────────────┐
│                     /scope-post-review NNN                      │
├─────────────────────────────────────────────────────────────────┤
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

**Rationale**: Quality gates run first to catch obvious issues cheaply. Spec verification runs second to confirm the implementation is actually complete before spending tokens on AI code review. Code review runs third on verified, passing code. Fix execution runs last, using an agent team to address all findings in parallel across non-overlapping file domains.

## Steps

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
   **STOP** — do not proceed to Phase 2.
3. If all gates PASS → continue to Phase 2.

### Phase 2: Formal Verification (`/scope-verify NNN`)

Run the scope-specific formal review gate.

1. Invoke: `Skill(skill: "scope-verify", args: "NNN")`
2. **Do NOT emit** the `AGENT_COMPLETED` event here — this pipeline owns the emit timing. The emit happens after Phase 3 or Phase 4 (see Completion Event below).
3. If verdict is FAIL:
   ```
   ╔═══════════════════════════════════════════════════════════════╗
   ║  Phase 2 FAILED — Scope verification did not pass            ║
   ║                                                               ║
   ║  Fix the issues and re-run: /scope-post-review NNN           ║
   ╚═══════════════════════════════════════════════════════════════╝
   ```
   **STOP** — do not proceed to Phase 3.
4. If verdict is PASS → continue to Phase 3.

### Phase 3: AI Code Review (`/test-code-review`)

Run the 6 parallel code review agents on the verified code.

1. Invoke: `Skill(skill: "test-code-review")`
2. Collect all findings — count BLOCKERS, WARNINGS, and SUGGESTIONS.
3. If there are **any findings** (blockers, warnings, or suggestions), proceed to Phase 4.
4. If there are **zero findings**, skip Phase 4 and go to Final Report.

### Phase 4: Fix Review Findings (`/scope-fix-review NNN`)

Execute all Phase 3 findings using a coordinated agent team. **This phase requires `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`.**

1. Check if agent teams are enabled:
   ```bash
   echo "${CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS:-not set}"
   ```
2. If **enabled** (`1`) and Phase 3 produced findings:
   - Invoke: `Skill(skill: "scope-fix-review", args: "NNN")`
   - This spawns an agent team that fixes all findings in parallel across non-overlapping file domains
   - Includes a verification step (typecheck + build) at the end
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

### Completion Event

Emit the `AGENT_COMPLETED` event at the **actual** completion point — not during Phase 2:

- **After Phase 3** if code review found **zero blockers and zero warnings** (suggestions only or clean):
  ```bash
  bash .claude/hooks/orbital-emit.sh AGENT_COMPLETED '{"outcome":"success","verdict":"PASS"}' --scope "{NNN}"
  ```
- **After Phase 4** if code review found warnings/blockers and fixes were applied:
  ```bash
  bash .claude/hooks/orbital-emit.sh AGENT_COMPLETED '{"outcome":"success","verdict":"PASS"}' --scope "{NNN}"
  ```
- **Phase 4 skipped** (agent teams not enabled) — emit after reporting the skip, since findings exist but cannot be auto-fixed:
  ```bash
  bash .claude/hooks/orbital-emit.sh AGENT_COMPLETED '{"outcome":"success","verdict":"PASS","pending_fixes":N}' --scope "{NNN}"
  ```

**Important**: Phase 2 (`/scope-verify`) normally emits its own `AGENT_COMPLETED` event when run standalone. When called from this pipeline, **skip that emit** — this pipeline owns the emit timing.

### Final Report

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
