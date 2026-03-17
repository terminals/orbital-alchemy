---
name: session-init
description: Initializes work session context by loading project state and recent history. Use at session start, when beginning work, or when context needs refreshing.
user-invocable: true
---

# /session-init - Re-Initialize Session Context

---
tokens: ~200
trigger: /session-init
purpose: Re-display session initialization and reload critical context
---

## What This Does

Re-shows the session initialization banner and reloads awareness of the enforcement system. Use when:
- You've been working a while and need a reset
- Agent seems to have forgotten the rules
- Starting a new logical task within the same session

## Steps

1. **Display the initialization banner:**

```
══════════════════════════════════════════════════════════════════════════════
SESSION RE-INITIALIZED
══════════════════════════════════════════════════════════════════════════════

Before writing ANY code, you MUST:

1. IDENTIFY TASK TYPE & USE THE MATCHING SKILL:
   Check .claude/skills/ for available workflow skills.
   Common patterns:
   ┌────────────────────┬─────────────────────┐
   │ Task               │ Invoke First        │
   ├────────────────────┼─────────────────────┤
   │ Plan feature       │ /scope-create       │
   │ Implement scope    │ /scope-implement    │
   │ Review scope       │ /scope-verify       │
   │ Commit work        │ /git-commit         │
   └────────────────────┴─────────────────────┘

2. STATE WHAT YOU READ before proceeding:
   "I have read [specific files] and am ready to proceed."

══════════════════════════════════════════════════════════════════════════════
PROJECT RULES:
══════════════════════════════════════════════════════════════════════════════

   Read .claude/orbital.config.json for project-specific rules
   and enforcement configuration.

══════════════════════════════════════════════════════════════════════════════
BEFORE EVERY COMMIT: Run /test-checks
══════════════════════════════════════════════════════════════════════════════
```

2. **Confirm readiness:**

   State: "Session re-initialized. Ready to proceed with proper workflow."
