---
name: skill-triggers
description: Defines when to suggest or auto-invoke skills based on user phrases and context.
tokens: ~2K
load-when: Loaded alongside AUTO-INVOKE.md during task triage
last-verified: 2026-01-14
---

# Skill Auto-Triggers

Skills should be suggested proactively based on user language patterns and session context. This supplements agent auto-invocation with skill suggestions.

---

## Phrase-Based Triggers

### Understanding & Investigation

| User Says | Suggest Skill | Why |
|-----------|---------------|-----|
| "How does X work?" | `/explain code` | Deep-dive explanation |
| "What happens when X?" | `/explain trace` | Follow data flow |
| "Explain X to me" | `/explain code` | Deep-dive explanation |
| "Show me the architecture of X" | `/explain architecture` | System structure |
| "What's the flow for X?" | `/explain trace` | Data flow tracing |
| "Something is wrong with X" | `/dev investigate` | Root cause analysis |
| "X is failing but I don't know why" | `/dev investigate` | Root cause analysis |
| "X isn't working" | `/dev investigate` | Root cause analysis |
| "Can you figure out why X?" | `/dev investigate` | Root cause analysis |

### Testing & Quality

| User Says | Suggest Skill | Why |
|-----------|---------------|-----|
| "Add tests for X" | `/test add` | Add test coverage |
| "Write tests for X" | `/test add` | Add test coverage |
| "X needs tests" | `/test add` | Add test coverage |
| "What's not tested?" | `/test coverage` | Coverage analysis |
| "What's our test coverage?" | `/test coverage` | Coverage analysis |
| "Show coverage gaps" | `/test coverage` | Coverage analysis |

### Database & Migrations

| User Says | Suggest Skill | Why |
|-----------|---------------|-----|
| "Add a column to X" | `/dev migrate-db` | Schema migration |
| "Create a new table" | `/dev migrate-db` | Schema migration |
| "Schema change" | `/dev migrate-db` | Schema migration |
| "I need to add a field" | `/dev migrate-db` | Schema migration |

### Documentation

| User Says | Suggest Skill | Why |
|-----------|---------------|-----|
| "Document X" | `/info document` | Generate documentation |
| "Add documentation to X" | `/info document` | Generate documentation |
| "X needs docs" | `/info document` | Generate documentation |
| "What changed since X?" | `/info changelog` | Generate changelog |
| "Generate changelog" | `/info changelog` | Generate changelog |
| "Release notes" | `/info changelog` | Generate changelog |

### Session Management

| User Says | Suggest Skill | Why |
|-----------|---------------|-----|
| "Where were we?" | `/work resume` | Resume from interruption |
| "What was I working on?" | `/work resume` | Resume from interruption |
| "Continue where we left off" | `/work resume` | Resume from interruption |
| "Save our progress" | `/work checkpoint` | Mid-task checkpoint |
| "Let's save where we are" | `/work checkpoint` | Mid-task checkpoint |
| "Before we try this..." | `/work checkpoint` | Pre-risk checkpoint |
| "I'm done for now" | `/work handoff` | Session wrap-up |
| "That's all for today" | `/work handoff` | Session wrap-up |
| "Wrap up" | `/work handoff` | Session wrap-up |
| "bye", "done", "that's all" | `/work handoff` | Session wrap-up |

---

## Context-Based Auto-Triggers

These are **automatic** suggestions based on session state, not user phrases.

| Context | Auto-Suggest | Rationale |
|---------|--------------|-----------|
| Session starts with uncommitted changes | `/work resume` | User likely continuing previous work |
| After context compaction | `/work resume` | Rebuild context efficiently |
| Before risky/destructive operation | `/work checkpoint` | Create recovery point |
| User exploring unfamiliar code area | `/explain code` | Build understanding first |
| User says "bye/done/that's all" | `/work handoff` | Clean session closure |

---

## Smart Triggers by Task Pattern

These combine with agent triggers for comprehensive coverage.

| Task Pattern | Skills to Consider |
|--------------|-------------------|
| Bug with unknown cause | `/dev investigate` → then `/dev fix-bug` |
| Adding test coverage | `/test coverage` (find gaps) → `/test add` (fill gaps) |
| Schema changes | `/dev migrate-db` |
| Documentation request | `/info document` |
| Release prep | `/info changelog` |
| Understanding before modifying | `/explain code` or `/explain trace` |
| New feature in unfamiliar area | `/explain architecture` → then `/dev add-feature` |

---

## Integration with Task Triage

When triaging tasks, include skill suggestions alongside agent triggers:

```
┌─────────────────────────────────────────────────────────────────┐
│ 🎯 TASK TRIAGE                                                  │
├─────────────────────────────────────────────────────────────────┤
│ Task: [description]                                             │
│                                                                 │
│ Suggested Skills:                                               │
│ 💡 /explain code → Unfamiliar code area detected          │
│ 💡 /dev investigate → Symptoms described, cause unclear         │
│                                                                 │
│ Agents triggered:                                               │
│ ✅ 🗡️ Attacker (hard trigger: auth*.ts)                         │
│ ✅ 💥 Chaos (feature development)                               │
└─────────────────────────────────────────────────────────────────┘
```

---

## Priority Order

When multiple skills could apply, prioritize:

1. **Understanding first**: `/explain code` or `/explain trace` before modifying unfamiliar code
2. **Investigation before fixing**: `/dev investigate` before `/dev fix-bug` when cause unclear
3. **Coverage before adding**: `/test coverage` before `/test add` for systematic approach
4. **Checkpoint before risk**: `/work checkpoint` before destructive or complex operations
5. **Handoff at session end**: `/work handoff` when user indicates they're done

---

## Related

- [AUTO-INVOKE.md](./AUTO-INVOKE.md) - Agent auto-invocation rules
- [skills/README.md](../skills/README.md) - Full skills reference
