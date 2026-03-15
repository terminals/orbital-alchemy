---
name: work
description: Routes to work session workflows including initialization, resumption, and saving. Use when managing work sessions or context continuity.
user-invocable: true
---

# /work - Work Session Management

When invoked as `/work` alone, use `AskUserQuestion` to let the user select.

## Sub-commands

| Sub-command | Purpose |
|-------------|---------|
| `init` | Re-initialize session context |
| `save` | Git save entry point (routes to proper workflow) |
| `resume` | Pick up where you left off after interruption |

## Router Behavior

When `/work` is invoked without a sub-command:

1. **Use AskUserQuestion** with options: init, save, resume
2. **After selection**, invoke the skill:
   - "save" -> `Skill(skill: "save")`
   - "resume" -> `Skill(skill: "session-resume")`
   - "init" -> `Skill(skill: "session-init")`

## Direct Invocation

When invoked with a sub-command (e.g., `/work save`):
- Skip the question
- Invoke the corresponding skill directly

## Trigger Phrases

Suggest `/work resume` when user says:
- "Where were we?"
- "What was I working on?"
- "Continue where we left off"
