---
name: scope
description: Routes to scope document workflows including creation, review, and implementation. Use when planning features or managing scope documents.
user-invocable: true
---

# /scope - Planning & Scoping

When invoked as `/scope` alone, use `AskUserQuestion` to let the user select.

## All Sub-commands

| Sub-command | Purpose |
|-------------|---------|
| `create` | Create a new scope document |
| `implement` | Execute scope end-to-end [--review for review only] |
| `review` | Full agent team review (Red + Blue + Green teams) |
| `review-gate` | Formal review gate (run in a different session than implementation) |

## Router Behavior

When `/scope` is invoked without a sub-command:

1. **Use AskUserQuestion** with this pattern:
```
Question: "Which planning action?"
Header: "/scope"
Selectable options (all 4):
  - implement: "Execute scope end-to-end"
  - create: "Create a new scope document"
  - review: "Full agent team review"
  - review-gate: "Run formal review gate"
```

2. **After selection**, invoke the skill using the Skill tool:
   - User selects "create" → `Skill(skill: "create")`
   - User selects "implement" → `Skill(skill: "implement")`
   - User selects "review" → `Skill(skill: "scope-review")`
   - User selects "review-gate" → `Skill(skill: "review-gate")`

## Direct Invocation

When invoked with a sub-command (e.g., `/scope implement`):
- Skip the question
- Use `Skill(skill: "implement")` directly

## Note on --review flag

`/scope implement --review` runs review-only mode (stops after team review).

## Plan Mode Integration

When `/scope create` is invoked, it enters plan mode for exploration.

### During Plan Mode
- Explore codebase, write findings to plan file as normal

### After Plan Approval
A hook fires reminding the agent to create the scope document:
1. Follow the create skill steps (find scope number, copy template, fill spec)
2. Populate SPECIFICATION from plan (requirements, phases, files)
3. Set `status: planning`, `spec_locked: true`
4. **Stop.** Implementation is `/scope implement NNN` in a new session.

### When NOT to Create a Scope
- Research/exploration tasks ("understand how X works")
- Simple fixes (typos, one-line changes)
- Tasks the user explicitly says are one-off
