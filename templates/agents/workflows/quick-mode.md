---
name: quick-mode
description: Explicitly requested for tiny changes like typos and comments. Only runs Rules Enforcer.
tokens: ~0.5K
load-when: Explicitly requested for tiny changes
last-verified: 2026-01-11
---

# Quick Mode Workflow

## When to Use

Request with: `"quick mode: [task]"`

**Valid for:**
- Typo fixes
- Comment updates
- Small documentation changes
- Trivial bug fixes (< 10 lines)
- Configuration value tweaks

**CANNOT use for:**
- Files matching hard triggers (auth, encryption, security-sensitive)
- New API endpoints
- Database migrations
- Any security-related changes
- Changes affecting security-sensitive operations

---

## Workflow Steps

### Step 1: Eligibility Check

```
┌─────────────────────────────────────────────────────────────┐
│ 🎯 QUICK MODE REQUEST                                       │
│                                                             │
│ Task: [description]                                        │
│                                                             │
│ Eligibility check:                                         │
│ ✅ Not touching security files                              │
│ ✅ Not touching auth files                                  │
│ ✅ Not a new endpoint                                       │
│ ✅ Not a migration                                          │
│                                                             │
│ APPROVED for quick mode                                    │
└─────────────────────────────────────────────────────────────┘
```

If NOT eligible:
```
┌─────────────────────────────────────────────────────────────┐
│ 🎯 QUICK MODE REQUEST - DENIED                              │
│                                                             │
│ Task: [description]                                        │
│                                                             │
│ ❌ Cannot use quick mode: touches auth*.ts                  │
│                                                             │
│ Escalating to FULL MODE...                                 │
└─────────────────────────────────────────────────────────────┘
```

### Step 2: Implementation

Make the change directly.

### Step 3: Quality Gate

```
┌─────────────────────────────────────────────────────────────┐
│ 📋 RULES ENFORCER - Pre-Commit Check                        │
│                                                             │
│ ✅ All rules passed                                         │
│                                                             │
│ Ready to commit.                                           │
└─────────────────────────────────────────────────────────────┘
```

---

## Auto-Escalation

If during implementation you discover the change is more significant:

1. Stop immediately
2. Re-triage as FULL MODE
3. Invoke appropriate agents
4. Continue with full workflow

---

## Example

```
USER: "quick mode: fix typo in README"

SYSTEM:
┌─────────────────────────────────────────────────────────────┐
│ 🎯 QUICK MODE - APPROVED                                    │
│                                                             │
│ Task: Fix typo in README                                   │
│ Only 📋 Rules Enforcer will run                             │
└─────────────────────────────────────────────────────────────┘

[Make change]

┌─────────────────────────────────────────────────────────────┐
│ 📋 Rules passed. Ready to commit.                           │
└─────────────────────────────────────────────────────────────┘
```

---

## Related

- [full-mode.md](./full-mode.md) - Default workflow
- [security-mode.md](./security-mode.md) - Security workflow
