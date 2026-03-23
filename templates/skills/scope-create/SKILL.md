---
name: scope-create
description: Creates structured scope documents for planned work with clear phases and success criteria. Use when planning features, scoping work, or documenting requirements.
user-invocable: true
---

# /scope-create - Create a Unified Scope Document

Creates a three-part scope document (Dashboard / Specification / Process) in `scopes/planning/`.
All mechanical work (file lookup, ID assignment, template scaffolding, session recording, gate cleanup)
is handled by a single `scope-prepare.sh` call.

## Post-Plan Workflow

When invoked during plan mode:
1. Plan mode handles exploration (write findings to plan file)
2. After plan approval (ExitPlanMode), a hook reminds you to write the scope
3. Run Step 1 below, then fill SPECIFICATION from your plan findings in Step 2
4. **Stop.** Report the scope number. Implementation is `/scope-implement NNN` in a new session.

## Execution

### Step 1: Prepare Scope File

One Bash call handles everything: finds the file, assigns a sequential ID (renumbering
from icebox range if needed), scaffolds the full template, records the session UUID,
and lifts the write gate.

**If a scope number is provided** (e.g., `/scope-create 511`):

```bash
# For icebox ideas (ID >= 500) — promotes, renumbers, and scaffolds:
bash .claude/hooks/scope-prepare.sh --promote 511

# For existing planning scopes (ID < 500) — applies template to existing file:
bash .claude/hooks/scope-prepare.sh --scaffold 106
```

**If no argument** — ask the user for:
1. **Feature name**: Short descriptive name
2. **What does it do?**: 1-2 sentence description
3. **Category**: e.g., Backend, Frontend, Tooling, Infrastructure

Then run:
```bash
bash .claude/hooks/scope-prepare.sh --new --title "Feature Name" --desc "Description" --category "Backend"
```

The script outputs JSON: `{"id", "path", "title", "description", "session_id", "category", "mode"}`.
The scope file is fully scaffolded with template, frontmatter, dashboard, and process log.

### Step 2: Fill Specification

Edit the scope file to replace the placeholder in **SPECIFICATION > Overview** with the
actual problem statement and goal. If coming from a plan, also populate:
- **Requirements** (Must Have / Nice to Have / Out of Scope)
- **Technical Approach** and rationale
- **Implementation Phases** with files, changes, and verification steps

### Step 3: Report

```
Created: scopes/planning/NNN-feature-name.md

Structure:
  PART 1: DASHBOARD  — Status: Planning
  PART 2: SPECIFICATION — Overview filled (complete during planning)
  PART 3: PROCESS — First exploration session started

Next steps:
1. Explore the codebase to understand current state
2. Fill in SPECIFICATION (requirements, phases, files)
3. Run `/scope-pre-review` to get agent team feedback
4. Lock spec and begin implementation with `/scope-implement NNN`
```

## Tips

- **Don't over-plan**: Start exploring, let the spec emerge
- **Capture decisions**: Use the Decisions & Reasoning section
- **Log uncertainties**: They help future sessions understand confidence levels
