---
name: git
description: Routes to git workflows including PR creation, hotfixes, and branch management. Use when working with git operations or creating pull requests.
user-invocable: true
---

# /git - Git Operations

When invoked as `/git` alone, use `AskUserQuestion` to let the user select.

## All Sub-commands

| Sub-command | Purpose |
|-------------|---------|
| `pr-dev` | Merge feature branch into dev (direct merge) |
| `pr-staging` | Create GitHub PR from dev to staging |
| `pr-production` | Create release PR from staging to main |
| `hotfix` | Emergency fix workflow (branch from main) |

## Router Behavior

When `/git` is invoked without a sub-command:

1. **Use AskUserQuestion** with this pattern:
```
Question: "Which git operation?"
Header: "/git"
Selectable options (all 4):
  - pr-dev: "Merge feature branch into dev"
  - pr-staging: "Create GitHub PR from dev to staging"
  - pr-production: "Create release PR from staging to main"
  - hotfix: "Emergency fix workflow (branch from main)"
```

2. **After selection**, invoke the skill using the Skill tool:
   - User selects "pr-dev" → `Skill(skill: "pr-dev")`
   - User selects "pr-staging" → `Skill(skill: "pr-staging")`
   - User selects "pr-production" → `Skill(skill: "pr-production")`
   - User selects "hotfix" → `Skill(skill: "hotfix")`

## Direct Invocation

When invoked with a sub-command (e.g., `/git pr-dev`):
- Skip the question
- Use `Skill(skill: "pr-dev")` directly
