---
name: auto-invoke
description: Always loaded during task triage. Defines which agents trigger for which file patterns.
tokens: ~3K
load-when: Always (embedded in task triage)
last-verified: 2026-01-11
---

# Agent Auto-Invocation Rules

## Overview

Agents are automatically invoked based on three layers of triggers. You never need to manually request an agent.

---

## Layer 1: Hard Triggers (Non-Negotiable)

These file patterns **ALWAYS** trigger specific agents, no exceptions.

*File patterns are configurable via `orbital.config.json` and `.claude/config/agent-triggers.json`.*

### High-Risk Files -> Full Security Review

| File Pattern | Agents Triggered | Reason |
|--------------|------------------|--------|
| `encrypt*.ts` | Attacker | Secret handling |
| `auth*.ts` | Attacker | Authentication |
| `controllers/*.ts` (new routes) | Attacker + Architect | API surface |
| `middleware/*.ts` | Attacker + Architect | Auth/security middleware |

### Domain Files -> Expert Review

| File Pattern | Agents Triggered | Reason |
|--------------|------------------|--------|
| `frontend/src/**/*` | Frontend Designer | UI components |
| `migrations/*` | Architect + DevOps Expert | Schema changes |
| `config/*.ts` | Chaos | Configuration changes |
| `*.test.ts` | Rules Enforcer | Test quality |

### Infrastructure Files -> DevOps Review

| File Pattern | Agents Triggered | Reason |
|--------------|------------------|--------|
| `Dockerfile` | DevOps Expert + Chaos | Container config |
| Platform config files | DevOps Expert | Deployment config |
| `docker-compose.yml` | DevOps Expert | Local dev setup |
| `.github/workflows/*.yml` | DevOps Expert + Architect | CI/CD pipeline |
| `.env.example` | DevOps Expert | Environment template |

---

## Layer 2: Smart Triggers (Task-Based)

### Feature Development
```
Task contains: "add", "create", "implement", "new feature"
Trigger: Architect + Chaos + Frontend Designer + [domain experts]
```

### Bug Fixes
```
Task contains: "fix", "bug", "broken", "not working"
Trigger: Chaos + [domain expert for affected area]
```

### Refactoring
```
Task contains: "refactor", "restructure", "split", "extract"
Trigger: Architect + [domain expert] + Chaos
```

### Security Work
```
Task contains: "auth", "permission", "encrypt", "secret", "token", "password"
Trigger: Attacker (SECURITY MODE - runs twice)
```

---

## Layer 3: Always-On

| Agent | When | Mode |
|-------|------|------|
| Rules Enforcer | Before EVERY commit | Blocking |
| Frontend Designer | Any user-facing feature | Advisory |

---

## Invocation Modes

### Full Mode (Default)
All triggered agents run. For features, refactors, significant changes.

### Quick Mode
Only Rules Enforcer. Request with: `"quick mode: [task]"`
**Cannot use for**: Security files, new endpoints.

### Security Mode (Automatic)
Attacker runs before AND after implementation.
Auto-triggered for: Auth, encryption, user input handling.

---

## High-Signal Diff Patterns

When reviewing diffs, **escalate attention** if you see these patterns. They indicate higher-risk changes even within already-triggered files.

### Critical Patterns (Double Review)

| Pattern in Diff | Why It Matters | Action |
|-----------------|----------------|--------|
| `privateKey`, `secretKey`, `apiKey` | Secret handling | Attacker: verify no logging/exposure |
| New `catch` block without error classification | Error handling gap | Verify classification added |
| Removed `finally` block | Resource leak risk | Chaos: verify cleanup still happens |

### Incomplete Implementation Patterns (BLOCKING)

| Pattern in Diff | Why It Matters | Action |
|-----------------|----------------|--------|
| `PLACEHOLDER`, `STUB_`, `DUMMY_` strings | Incomplete implementation | BLOCK - must implement or throw |
| `mockData`, `fakeUser`, `dummyData` | Mock data in prod | Move to test fixtures |
| `// for now`, `// TODO:`, `// FIXME:` | Untracked shortcut | Complete or link to ticket |
| `\|\| 'default-secret'` with secret/key/token | Hardcoded secret fallback | BLOCK - require env var |

### Elevated Patterns (Extra Scrutiny)

| Pattern in Diff | Why It Matters | Action |
|-----------------|----------------|--------|
| New `setTimeout`/`setInterval` | Potential memory leak | Chaos: verify cleanup on unmount |
| `status` or `state` transitions | State machine change | Verify valid transition |
| New `res.json` in controller | Response format | Architect: verify consistent format |

### Attention Patterns (Cross-Reference)

| Pattern in Diff | Cross-Reference With |
|-----------------|---------------------|
| New endpoint parameter | Attacker: check validation exists |
| Database column change | Architect: check migration exists |
| New WebSocket emit | Frontend Designer: check frontend handles it |
| Error message text change | Frontend Designer: check user-facing clarity |

---

## Scope-Aware Context

When agents are invoked for **scope reviews**, they receive focused context from the scope document rather than raw code.

### Context Extraction

Provide agents with:
1. **SPECIFICATION section** (primary)
2. **PROCESS > Decisions & Reasoning** (secondary)
3. **PROCESS > Uncertainties** (if relevant)
4. **Files Summary table** -- determines which agents to invoke

### Structured Output for Agent Review

Each agent should return findings in this format:

```
[AGENT_NAME] Review:

CRITICAL:
- [Issue]: [Description] -> [Recommendation]

HIGH:
- [Issue]: [Description] -> [Recommendation]

MEDIUM:
- [Issue]: [Description]

VERIFIED OK:
- [What was checked and found correct]
```

---

## Related

- [README.md](./README.md) - System overview
- [CONFLICT-RESOLUTION.md](./CONFLICT-RESOLUTION.md) - When agents disagree
- [SKILL-TRIGGERS.md](./SKILL-TRIGGERS.md) - Skill auto-suggestion rules
