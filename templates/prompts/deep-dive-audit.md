# Deep Dive Codebase Audit

**When to use:** Pre-launch reviews, major refactoring, tech debt assessment, periodic health checks.

**Session setup:** Start in plan mode (`/plan`), set effort to max (`/effort max`).

---

## The Prompt

```
Conduct a deep, thorough audit of our codebase. This is a [pre-launch review / periodic health check / tech debt assessment] and we will implement all confirmed findings — not just analyze them.

SCOPE AND EXPECTATIONS:

- Leave no file untouched. We value thoroughness and 100% coverage over speed.
- Take as long as you need. Slow down. Resist the urge to start editing before you've finished reading.
- Use resources freely — launch parallel exploration agents, analysis agents, and implementation agents. Do not optimize for token cost; optimize for coverage and correctness.
- Every change must be independently verified before we consider it done. Build verification into your plan, not as an afterthought.

DELIVERABLES:

1. Build a complete inventory of every section, service, and function. Track progress in the plan file.
2. Create a brief summary of each — how they work and how they're architected.
3. Conduct deep analysis: identify duplication, structural issues, dead code, and simplification opportunities. Quantify everything — "15 hooks duplicate this pattern" not "some hooks are duplicated."
4. Produce a tiered recommendation plan: Tier 1 (high impact, low risk), Tier 2 (high impact, moderate effort), Tier 3 (discuss first), and explicitly state what you considered but don't recommend.
5. After implementation, produce a before/after metrics table and a verification report with pass/fail counts.

WORKFLOW:

- Do NOT write any code until the plan is reviewed and confirmed together. The plan is a separate deliverable from the implementation.
- During exploration (plan mode): use subagents for parallel coverage. Create lists that track progress.
- During implementation (after plan approval): execute one tier at a time. Typecheck and test after every individual change. Use parallel agents only for independent file sets.
- After implementation: launch independent verification agents to prove each work item is correct. Run the full validation pipeline. Do UI testing if frontend was modified.

[ADDITIONAL CONTEXT: describe any specific concerns, recent feature work, or areas you suspect need attention]
```

---

## Why Each Section Exists

### "Leave no file untouched" + "take as long as you need"
Overrides the default pressure to be fast and concise. Without this, the agent samples a few files and pattern-matches. With it, the agent inventories everything, which is what finds unexpected results like "zero dead code."

### "Do not optimize for token cost"
Explicitly permits launching 3+ parallel agents per phase. Without this, the agent tries to do everything sequentially in one context window, which caps the achievable scope.

### "Every change must be independently verified"
Knowing verification is coming makes the agent more careful during implementation. This instruction must be in the initial prompt, not added after implementation is done.

### "Do NOT write any code until the plan is reviewed"
Forces the audit-then-plan-then-execute structure. Prevents the failure mode where the agent starts editing during exploration and introduces bugs while still forming its understanding.

### "Quantify everything"
Prevents vague findings. "Some duplication" is not actionable. "15 hooks with identical fetch boilerplate across 500 lines" is actionable and lets you evaluate ROI.

### "Explicitly state what you don't recommend"
Shows the agent considered and rejected options rather than missing them. The "Not recommended" section in a plan is often the most valuable — it prevents future sessions from re-investigating the same ideas.

### Deliverable 5 (before/after + verification)
Defines what "done" looks like. Without this, the session ends with "I think everything is good" instead of "23/23 test files, 374/374 tests, 279 verification checks."

---

## Variations

### Analysis Only (No Implementation)
Remove the "we will implement all confirmed findings" line and deliverable 5. Change the workflow section to end at plan delivery.

### Targeted Audit (Specific Area)
Add to additional context:
```
Focus on [server/hooks/frontend components]. The rest of the codebase is out of scope for this session.
```

### Post-Incident Review
Replace the scope section with:
```
We just had [describe incident]. Audit the codebase for similar patterns that could cause the same class of problem. Don't fix unrelated issues — stay focused on this failure mode.
```

---

## Origin

Developed during the v0.3 pre-launch refactoring session (2026-04-10). That session achieved:
- 10 files decomposed (avg 832 → 291 lines, 65% reduction)
- 5 shared abstractions created (useFetch, useSocketListener, workflow-constants, json-fields, catchRoute)
- 40 new tests added
- 279 manual verification checks, all passing
- 23/23 UI checks across 4 views, zero console errors

The prompt structure — explicit permission to slow down, free resource usage, mandatory verification, plan-before-code discipline — was identified as the primary driver of the session's quality.
