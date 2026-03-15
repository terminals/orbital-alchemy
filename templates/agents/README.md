---
name: agent-system
description: Overview of the Orbital Command agent system. Load when understanding how agents work together.
tokens: ~2K
load-when: Understanding the agent system
last-verified: 2026-01-11
---

# Orbital Command Agent System

## Overview

This project uses an automated multi-agent system to ensure code quality, security, and consistency. Agents are specialized AI reviewers that automatically activate based on what you're working on.

**You don't invoke agents manually.** The system automatically determines which agents are needed based on:
1. Files you're touching (hard triggers)
2. Type of task you're doing (smart triggers)
3. Risk level of changes (security mode)

---

## ⛔ Anti-Bypass Protocol

**All agents MUST follow these rules when blocked by enforcement:**

### When Blocked, You MUST:

1. **READ the error message** - It contains the solution
2. **FIX the underlying issue** - Don't look for shortcuts
3. **ASK the user** - If genuinely stuck after trying the suggested fix

### When Blocked, You MUST NOT:

| ❌ Forbidden Action | Why It's Wrong |
|---------------------|----------------|
| `cat > file.ts << 'EOF'` | Bypasses Write tool - use Write properly |
| `cp /tmp/file.ts src/` | Workaround for blocked Write |
| `sed -i 's/x/y/' file.ts` | Bypasses Edit tool - use Edit properly |
| `git commit --no-verify` | Skips quality checks that exist for a reason |
| Giving up after one block | The error message tells you how to proceed |

### Multi-Layer Enforcement

Bypass attempts are caught at multiple levels:

```
PreToolUse Hook  →  Blocks bash workarounds BEFORE execution
       ↓
Pre-commit Hook  →  Catches workarounds in staged changes
       ↓
CI Pipeline      →  Final gate catches anything that slips through
       ↓
Audit Database   →  All attempts logged for pattern analysis
```

### Why This Matters

Every enforcement rule exists because a past mistake taught us it matters. Bypassing enforcement just delays problems until they cause production incidents.

**If a rule is genuinely wrong:** Discuss with the user - don't work around it.

---

## The Team

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│                      🏛️  ORBITAL COMMAND AGENT TEAM                        │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  🔴 RED TEAM (Adversarial)                                                  │
│  "Find problems before users do"                                           │
│                                                                             │
│     🗡️ Attacker        - Exploits security vulnerabilities                  │
│     💥 Chaos Agent     - Imagines failure modes and edge cases             │
│                                                                             │
│  🔵 BLUE TEAM (Domain Experts)                                              │
│  "Deep knowledge, consulted on demand"                                     │
│                                                                             │
│     🎨 Frontend Designer - Components, UX, style consistency               │
│     🚀 DevOps Expert   - Deployment, Docker, CI/CD, migrations            │
│     (Add domain experts for your project)                                 │
│                                                                             │
│  🟢 GREEN TEAM (Guardians)                                                  │
│  "Protect quality and standards"                                           │
│                                                                             │
│     🏗️ Architect       - Patterns, structure, module boundaries            │
│     📋 Rules Enforcer  - Non-negotiable project rules (automated)          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## How It Works

### 1. Task Triage (Automatic)

When you describe a task, the system automatically:
- Identifies which files will likely be affected
- Determines which agents should review
- Spawns relevant agents in parallel

### 2. Agent Review

Each triggered agent:
- Loads its specific context (domain docs, patterns)
- Reviews the task/implementation from its perspective
- Reports findings with severity levels

### 3. Synthesis

All agent outputs are combined into:
- **Consensus**: What all agents agree on
- **Concerns**: Issues raised (with severity)
- **Conflicts**: Where agents disagree (escalated to you if major)

### 4. Quality Gate

Before any commit:
- 📋 Rules Enforcer runs automatically
- Must pass all checks to proceed

---

## Severity Levels

| Level | Icon | Meaning | Action |
|-------|------|---------|--------|
| BLOCKER | 🚫 | Cannot proceed | Must fix before continuing |
| WARNING | ⚠️ | Should fix | Can proceed with caution |
| SUGGESTION | 💡 | Consider | Nice to have, not required |
| PASSED | ✅ | Verified OK | Explicitly checked and good |

---

## Invocation Modes

### Full Mode (Default)
- All triggered agents run
- Complete synthesis
- Use for: Features, refactors, significant changes

### Quick Mode
- Only 📋 Rules Enforcer runs
- Request with: "quick mode: [task]"
- Use for: Typos, comments, tiny fixes
- **Cannot use for**: Funding files, security files, new endpoints

### Security Mode (Automatic)
- 🗡️ Attacker runs twice (before AND after implementation)
- Auto-triggered for: Auth, encryption, sensitive operations, user input

---

## Conflict Resolution

**Minor conflicts** → Auto-resolved using priority hierarchy:
1. 🗡️ Attacker (security wins)
2. 💥 Chaos Agent (reliability)
3. Domain experts (correctness)
4. 🏗️ Architect (patterns)
5. 🎨 Frontend Designer (aesthetics)

**Major conflicts** → Escalated to you with recommendation

---

## Quick Reference

| I'm doing... | Agents auto-triggered |
|--------------|----------------------|
| New feature | 🏗️ + 💥 + 🎨 + [domain experts] |
| Bug fix | 💥 + [domain expert] |
| New API endpoint | 🗡️ + 🏗️ |
| Frontend work | 🎨 + 🏗️ |
| Deployment/CI changes | 🚀 + 💥 |
| Database migrations | 🚀 + 🏗️ |
| Security-sensitive | 🗡️ + 💥 (ALWAYS) |
| Any commit | 📋 (ALWAYS) |

---

## Related Files

- [AUTO-INVOKE.md](./AUTO-INVOKE.md) - Detailed trigger rules
- [CONFLICT-RESOLUTION.md](./CONFLICT-RESOLUTION.md) - How conflicts are handled
