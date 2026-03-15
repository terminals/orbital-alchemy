---
name: conflict-resolution
description: Loaded when agents disagree. Defines priority hierarchy and escalation procedures.
tokens: ~1.5K
load-when: When agents disagree
last-verified: 2026-01-11
---

# Agent Conflict Resolution

## Overview

When multiple agents have conflicting recommendations, conflicts are categorized and resolved appropriately.

---

## Conflict Categories

### Minor Conflicts (Auto-Resolve)

Automatically resolved using priority hierarchy:
- Style preferences
- Implementation approach when both options are valid
- "Nice to have" suggestions that contradict
- Optimization preferences with no security/safety impact

### Major Conflicts (Human Decision Required)

Escalated to you for a decision:
- Security vs. functionality trade-offs
- Architectural decisions with long-term implications
- When two agents both flag 🚫 BLOCKER on opposing advice
- When resolution significantly changes scope or approach
- Performance vs. security trade-offs

---

## Priority Hierarchy

For auto-resolving minor conflicts:

```
┌─────────────────────────────────────────────────────────────┐
│  PRIORITY ORDER (highest to lowest)                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. 🗡️ ATTACKER                                             │
│     Security concerns ALWAYS win                            │
│                                                             │
│  2. 💥 CHAOS AGENT                                          │
│     Reliability/failure modes are second                    │
│                                                             │
│  3. DOMAIN EXPERTS                                          │
│     Domain correctness                                      │
│                                                             │
│  4. 🏗️ ARCHITECT                                            │
│     Patterns and structure                                  │
│                                                             │
│  5. 🎨 FRONTEND DESIGNER                                    │
│     UX and aesthetic preferences                           │
│                                                             │
│  6. 📋 RULES ENFORCER                                       │
│     Code style rules                                        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Core Principle:** Security > Reliability > Correctness > Patterns > Aesthetics

---

## Major Conflict Format

When a major conflict requires your decision:

```
┌─────────────────────────────────────────────────────────────┐
│ ⚠️ AGENT CONFLICT - Decision Required                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ CONFLICT TYPE: [Security vs Functionality / etc.]          │
│                                                             │
│ ─────────────────────────────────────────────────────────── │
│                                                             │
│ 🗡️ ATTACKER says:                                           │
│ "[Their recommendation]"                                   │
│                                                             │
│ Reasoning: [Why they recommend this]                       │
│ Risk if ignored: [What could go wrong]                     │
│                                                             │
│ ─────────────────────────────────────────────────────────── │
│                                                             │
│ 🏗️ ARCHITECT says:                                          │
│ "[Their opposing recommendation]"                          │
│                                                             │
│ Reasoning: [Why they recommend this]                       │
│ Risk if ignored: [What could go wrong]                     │
│                                                             │
│ ─────────────────────────────────────────────────────────── │
│                                                             │
│ MY RECOMMENDATION: [Agent X - brief reason]                │
│                                                             │
│ But this is your call. Which approach?                     │
│ A) Follow [Agent X]                                        │
│ B) Follow [Agent Y]                                        │
│ C) Hybrid approach                                         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Recording Decisions

When you decide on a major conflict, document it:

```typescript
// DECISION 2026-01-11: Using in-memory rate limiting over Redis-based
// Reason: Reduces complexity for initial launch
// Revisit: When scaling beyond single server
```

---

## Related

- [README.md](./README.md) - System overview
- [AUTO-INVOKE.md](./AUTO-INVOKE.md) - When agents are triggered
