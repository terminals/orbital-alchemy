---
name: quick-reference
description: One-page overview of the agent system. Quick reference for agent triggers and priorities.
---

# Agent System Quick Reference

*One-page overview. Print this or keep it open.*

---

## Trigger Matrix

| Files Changed | Agents Activated | Mode |
|---------------|------------------|------|
| `encrypt*.ts`, `auth*.ts` | 🗡️ | SECURITY |
| `controllers/*.ts` (new routes) | 🗡️ 🏗️ | SECURITY |
| `frontend/src/**/*` | 🎨 | FULL |
| `migrations/*` | 🏗️ 🚀 | FULL |
| `config/*.ts` | 💥 | FULL |
| `middleware/*.ts` | 🗡️ 🏗️ | SECURITY |

*Additional patterns are configurable via orbital.config.json and agent-triggers.json.*

---

## The 5 Critical Questions

Ask these for EVERY change:

1. **🗡️ What user input reaches this code? Is it validated?**
2. **🗡️ Can user A trigger this with user B's resource ID?**
3. **💥 What state are we in if this line throws?**
4. **💥 Is this idempotent on retry?**
5. **🏗️ Does this fit our existing patterns?**

---

## Priority Order (Conflicts)

When agents disagree, this order wins:

```
🗡️ Security (1st) → 💥 Reliability (2nd) → Domain Correctness (3rd)
→ 🏗️ Patterns (4th) → 🎨 Aesthetics (5th)
```

---

## Workflow Modes

| Mode | When | What Runs |
|------|------|-----------|
| **FULL** | Default for features | All triggered agents |
| **QUICK** | `"quick mode: [task]"` | Only Rules Enforcer |
| **SECURITY** | Auth/encryption/sensitive | Attacker runs twice (before + after) |

---

## Review Completion Checklist

Before implementing:
```
[] All triggered agents applied
[] Attack vectors identified (if security-related)
[] Failure modes listed (always)
```

After implementing:
```
[] Red team stress test passed
[] No unresolved blockers
[] Test gaps identified
[] Rules Enforcer passed
```

Before committing:
```
[] Learned Patterns updated?
[] Known Issues updated?
```

---

## Agent Responsibilities (1-liner each)

| Agent | Core Question |
|-------|---------------|
| Attacker | "How would I exploit this?" |
| Chaos | "What breaks when things go wrong?" |
| Frontend Designer | "What does the user see/experience?" |
| DevOps Expert | "Is deployment safe and reversible?" |
| Architect | "Does this fit our patterns?" |
| Rules Enforcer | "Do all project rules pass?" |

---

## Quick Commands

```bash
# Full verification before commit (configure in orbital.config.json)
# npm run type-check && npm run lint && npm run build && npm test
```

---

## When Stuck

- **Agent not activating?** Check trigger patterns in AUTO-INVOKE.md
- **Agents disagree?** Use priority order above, escalate majors to user
- **Rule violation?** See fix guide in rules-enforcer.md
- **Pattern unclear?** Check domain docs in `.claude/domain/`

---

## Related Files

```
.claude/agents/AUTO-INVOKE.md       - Trigger rules
.claude/agents/CONFLICT-RESOLUTION.md - Priority handling
.claude/agents/workflows/           - Mode-specific workflows
.claude/quick/rules.md              - Project rules
```
