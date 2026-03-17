---
name: skill-triggers
description: Defines when to suggest or auto-invoke skills based on user phrases and context.
tokens: ~1.5K
load-when: Loaded alongside AUTO-INVOKE.md during task triage
last-verified: 2026-03-17
---

# Skill Auto-Triggers

Skills should be suggested proactively based on user language patterns and session context.

---

## Phrase-Based Triggers

### Scope Lifecycle

| User Says | Suggest Skill | Why |
|-----------|---------------|-----|
| "Create a scope for X" | `/scope-create` | New scope document |
| "Let's plan X" | `/scope-create` | Planning phase |
| "Implement scope NNN" | `/scope-implement` | Execute scope end-to-end |
| "Work on scope NNN" | `/scope-implement` | Execute scope |
| "Review scope NNN" | `/scope-pre-review` | Agent team review |
| "Is scope NNN ready?" | `/scope-verify` | Formal review gate |
| "Run post-review on NNN" | `/scope-post-review` | Post-implementation review |

### Git & Deployment

| User Says | Suggest Skill | Why |
|-----------|---------------|-----|
| "Commit this" | `/git-commit` | Commit to feature branch |
| "Save our progress" | `/git-commit` | Mid-task checkpoint |
| "Push to main" | `/git-main` | Push/PR to main |
| "Merge to dev" | `/git-dev` | Merge into dev branch |
| "PR to staging" | `/git-staging` | Create staging PR |
| "Deploy to production" | `/git-production` | Create release PR |
| "Emergency fix" | `/git-hotfix` | Hotfix workflow |

### Testing & Quality

| User Says | Suggest Skill | Why |
|-----------|---------------|-----|
| "Run checks" | `/test-checks` | Quality gates |
| "Run quality gates" | `/test-checks` | Quality gates |
| "Code review" | `/test-code-review` | Full code review |
| "Review the code" | `/test-code-review` | Full code review |

### Session Management

| User Says | Suggest Skill | Why |
|-----------|---------------|-----|
| "Where were we?" | `/session-resume` | Resume from interruption |
| "What was I working on?" | `/session-resume` | Resume from interruption |
| "Continue where we left off" | `/session-resume` | Resume from interruption |
| "I'm done for now" | `/git-commit` | Session wrap-up |
| "That's all for today" | `/git-commit` | Session wrap-up |
| "Wrap up" | `/git-commit` | Session wrap-up |

---

## Context-Based Auto-Triggers

These are **automatic** suggestions based on session state, not user phrases.

| Context | Auto-Suggest | Rationale |
|---------|--------------|-----------|
| Session starts with uncommitted changes | `/session-resume` | User likely continuing previous work |
| After context compaction | `/session-resume` | Rebuild context efficiently |
| Before risky/destructive operation | `/git-commit` | Create recovery point |
| User says "bye/done/that's all" | `/git-commit` | Clean session closure |

---

## Smart Triggers by Task Pattern

| Task Pattern | Skills to Consider |
|--------------|-------------------|
| Scope implementation | `/scope-implement` → `/test-checks` → `/git-commit` |
| Post-implementation review | `/scope-post-review` (chains: `/test-checks` → `/scope-verify` → `/test-code-review`) |
| Release to staging | `/git-staging` |
| Release to production | `/git-production` |
| Emergency fix | `/git-hotfix` |

---

## Priority Order

When multiple skills could apply, prioritize:

1. **Checkpoint before risk**: `/git-commit` before destructive or complex operations
2. **Quality before merge**: `/test-checks` before `/git-main` or `/git-staging`
3. **Handoff at session end**: `/git-commit` when user indicates they're done

---

## Related

- [AUTO-INVOKE.md](./AUTO-INVOKE.md) - Agent auto-invocation rules
