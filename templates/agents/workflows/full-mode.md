---
name: full-mode
description: Default workflow for features and significant changes. Runs all triggered agents with complete synthesis.
tokens: ~2K
load-when: Default for features and significant changes
last-verified: 2026-01-11
---

# Full Mode Workflow

## When to Use

- New features
- Significant changes
- Refactoring
- Any security-sensitive changes
- **Default mode** - use unless explicitly requesting quick mode

---

## Workflow Steps

### Phase 1: Triage

```
┌─────────────────────────────────────────────────────────────┐
│ 🎯 TASK TRIAGE                                              │
│                                                             │
│ 1. Analyze task description                                │
│ 2. Identify files likely to be affected                    │
│ 3. Determine which agents are triggered                    │
│ 4. Check for high-signal patterns                          │
│ 5. Display triage summary                                  │
└─────────────────────────────────────────────────────────────┘
```

### Phase 2: Council Review

Run triggered agents **in parallel**:

```
┌─────────────────────────────────────────────────────────────┐
│ PARALLEL AGENT EXECUTION                                    │
│                                                             │
│ 🏗️ Architect        →  [reviewing architecture impact]      │
│ [Domain Expert]     →  [analyzing domain impact]            │
│ 💥 Chaos Agent      →  [imagining failure modes]           │
│ 🎨 Frontend Designer →  [considering UI implications]       │
│                                                             │
│ Waiting for all agents...                                  │
└─────────────────────────────────────────────────────────────┘
```

### Phase 3: Synthesis

```
┌─────────────────────────────────────────────────────────────┐
│ 📋 AGENT SYNTHESIS                                          │
│                                                             │
│ CONSENSUS:                                                  │
│ - [Points all agents agree on]                             │
│                                                             │
│ CONCERNS (by severity):                                    │
│ 🚫 BLOCKERS:                                                │
│ - [Must fix before proceeding]                             │
│                                                             │
│ ⚠️ WARNINGS:                                                │
│ - [Should address]                                         │
│                                                             │
│ 💡 SUGGESTIONS:                                             │
│ - [Nice to have]                                           │
│                                                             │
│ CONFLICTS:                                                  │
│ - [If any, present for human decision]                     │
└─────────────────────────────────────────────────────────────┘
```

### Phase 4: Review Completion Gate ✓

**Before proceeding to implementation, verify:**

```
┌─────────────────────────────────────────────────────────────┐
│ ✓ REVIEW COMPLETION GATE                                    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ All triggered agents applied:                              │
│ □ [Agent 1] - perspective applied                          │
│ □ [Agent 2] - perspective applied                          │
│ □ ...                                                      │
│                                                             │
│ Critical questions answered:                               │
│ □ "What happens to resources if this fails?"              │
│ □ "What user input reaches this code?"                    │
│ □ "What state are we in if this throws?"                  │
│ □ "Can user A access user B's resources?"                 │
│                                                             │
│ Blockers resolved:                                         │
│ □ No unresolved 🚫 BLOCKER items                           │
│                                                             │
│ ─────────────────────────────────────────────────────────── │
│ All boxes checked? → Proceed to implementation            │
│ Missing boxes? → Address before implementing              │
└─────────────────────────────────────────────────────────────┘
```

### Phase 5: Implementation

Implement with agent guidance. Domain experts available on-demand for questions.

### Phase 6: Stress Test

After implementation, run red team **in parallel**:

```
┌─────────────────────────────────────────────────────────────┐
│ 🔴 RED TEAM STRESS TEST                                     │
│                                                             │
│ 🗡️ Attacker  →  [looking for exploits]                      │
│ 💥 Chaos     →  [finding failure modes + verifying tests]  │
│                                                             │
│ Cross-reference prompts:                                   │
│ - "Given the data flow, can any step be exploited?"      │
│ - "Given the state transitions, what if crash mid-way?"   │
│                                                             │
│ Waiting for red team...                                    │
└─────────────────────────────────────────────────────────────┘
```

### Phase 7: Quality Gate

```
┌─────────────────────────────────────────────────────────────┐
│ 📋 RULES ENFORCER - Pre-Commit Check                        │
│                                                             │
│ ✅ All 20 rules passed                                      │
│                                                             │
│ Ready to commit.                                           │
└─────────────────────────────────────────────────────────────┘
```

### Phase 8: Post-Review Ritual ✓

**Before committing, always ask:**

```
┌─────────────────────────────────────────────────────────────┐
│ 🔄 POST-REVIEW RITUAL                                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ Learning Capture:                                          │
│                                                             │
│ 1. Did any agent find a pattern that should become a      │
│    permanent check?                                        │
│    → Add to that agent's "Learned Patterns" table         │
│                                                             │
│ 2. Did we miss something that was caught later?           │
│    → Add to relevant agent's "Known [X]" table            │
│                                                             │
│ 3. Did any agent flag a false positive repeatedly?        │
│    → Consider refining that agent's checklist             │
│                                                             │
│ Test Gaps:                                                 │
│                                                             │
│ 4. Did 💥 Chaos identify failure modes without tests?      │
│    → Note as test debt or write tests now                 │
│                                                             │
│ ─────────────────────────────────────────────────────────── │
│ Ritual complete? → Commit                                  │
└─────────────────────────────────────────────────────────────┘
```

---

## Example Full Flow

```
USER: "Add ability to set custom retry policy per resource"

SYSTEM:
┌─────────────────────────────────────────────────────────────┐
│ TASK TRIAGE                                                 │
│                                                             │
│ Task: Add custom retry policy per resource                 │
│ Mode: FULL                                                 │
│                                                             │
│ Files likely affected:                                      │
│ - src/services/resourceService.ts                          │
│ - src/types/resource.ts                                    │
│ - database migration                                        │
│ - frontend/src/pages/ResourceSetup.tsx                     │
│                                                             │
│ Agents triggered:                                          │
│ - Architect                                                │
│ - Chaos Agent                                              │
│ - Frontend Designer                                        │
│ - Attacker (user input)                                    │
│                                                             │
│ Invoking 4 agents...                                       │
└─────────────────────────────────────────────────────────────┘

[Phase 2: Agents run in parallel]
[Phase 3: Synthesis shown]
[Phase 4: Review Completion Gate - all checked]
[Phase 5: Implementation proceeds]
[Phase 6: Red team stress test]
[Phase 7: Rules enforcer runs]
[Phase 8: Post-review ritual - update Learned Patterns if needed]
[Commit]
```

---

## Related

- [quick-mode.md](./quick-mode.md) - For tiny changes
- [security-mode.md](./security-mode.md) - For security-sensitive changes
- [../QUICK-REFERENCE.md](../QUICK-REFERENCE.md) - One-page overview
