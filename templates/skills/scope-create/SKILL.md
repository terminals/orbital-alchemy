---
name: scope-create
description: Creates structured scope documents for planned work with clear phases and success criteria. Use when planning features, scoping work, or documenting requirements.
user-invocable: true
---

# /scope-create - Create a Unified Scope Document

## What This Does

Creates a three-part scope document (Dashboard / Specification / Process) in `scopes/planning/`.

## Post-Plan Workflow

When this skill is invoked during plan mode:
1. Plan mode handles exploration (write findings to plan file)
2. After plan approval (ExitPlanMode), a hook reminds you to write the scope
3. **Create the scope document** using Steps 2-6 below, populating SPECIFICATION from your plan
4. Set `status: planning`, `spec_locked: true`
5. **Stop.** Report the scope number. Implementation is `/scope-implement NNN` in a new session.

## Execution

### Step 0: Record Session ID

1. Run: `bash .claude/hooks/get-session-id.sh` — capture the UUID output
2. Read the scope file's YAML frontmatter `sessions` field (if updating an existing file)
3. If `sessions:` key doesn't exist in frontmatter, add `sessions: {}` after `tags:`
4. If the UUID is NOT already in `sessions.createScope`, append it (skip if duplicate)
5. Write the updated frontmatter back to the scope file

> For new scopes (no file yet), record the session after the file is written in Step 4.

### Step 1: Gather Information

**If a scope number is provided** (e.g., `/scope-create 083`):
1. Read the existing file at `scopes/planning/NNN-*.md` (use glob to find by prefix)
2. Extract the title from frontmatter and the description from the body (text below the closing `---`)
3. The file was promoted from icebox — it already has a sequential ID and `status: planning`
4. **Skip to Step 3** using the extracted title and description. The scope number is already assigned.

**Otherwise** (no argument):
Ask the user:
1. **Feature name**: Short descriptive name
2. **What does it do?**: 1-2 sentence description
3. **Category**: e.g., Backend, Frontend, Tooling, Blockchain, Infrastructure

### Step 2: Find Next Scope Number

**If updating an existing file** (e.g., promoted from icebox): Check the file's
current `id` in frontmatter. Scope IDs use 3-digit sequential numbering (e.g.,
084, 085). If the existing ID is outside this range (icebox-style 500+, 9000+,
or any non-sequential value), it **must** be renumbered. Find the next sequential
ID using the steps below, then rename the file and update the frontmatter `id`
field to match.

```bash
# Recursively scan ALL subdirectories under scopes/ for the highest base ID
find scopes/ -name '*.md' 2>/dev/null | grep -oE '/[0-9]{3}[a-dA-DxX]?-' | grep -oE '[0-9]{3}' | sort -n | uniq | tail -1
# Add 1 and pad to 3 digits
```

Then cross-check against the Orbital Command database (catches ideas and status-locked scopes):
```bash
sqlite3 .claude/orbital/orbital.db "SELECT MAX(id) FROM scopes WHERE id < 1000 AND is_idea = 0" 2>/dev/null
```

**Use whichever number is higher + 1.** This prevents collisions from scopes in any subfolder (backlog, dev, staging, production, pre-launch, completed, etc.) and from DB-only entries.

### Step 3: Copy and Fill Template

1. Read `scopes/_template.md`
2. Create `scopes/planning/NNN-feature-name.md`
3. Fill in:
   - **Frontmatter**: id, title, category, created/updated dates, tags, **`status: planning`**
   - **DASHBOARD**: Set status to `planning`, add creation activity entry
   - **SPECIFICATION Overview**: Problem statement from user description
   - **PROCESS Exploration Log**: First session entry with trigger

### Step 4: Initialize DASHBOARD

```markdown
### Quick Status
> ⏳ **Status**: Planning | **Phase**: 0 of N | **Spec Locked**: No

### Recent Activity
- **YYYY-MM-DD HH:MM** - Scope created via `/scope-create`

### Next Actions
- [ ] Complete exploration (search codebase, understand current state)
- [ ] Draft specification (requirements, phases, files)
- [ ] Get spec approval via `/scope-pre-review`
```

### Step 5: Start PROCESS Exploration

Open the Exploration Log `<details>` and add:

```markdown
### Session: YYYY-MM-DD HH:MM

**Trigger**: [User's description of what they want]

**Initial Understanding**: [What we know so far]

**Next Steps**: [What to explore in the codebase]
```

### Step 6: Record Session ID

1. Run: `bash .claude/hooks/get-session-id.sh` — capture the UUID output
2. Read the newly created scope file's YAML frontmatter `sessions` field
3. If `sessions:` key doesn't exist in frontmatter, add `sessions: {}` after `tags:`
4. If the UUID is NOT already in `sessions.createScope`, append it (skip if duplicate)
5. Write the updated frontmatter back to the scope file

### Step 7: Report

```
Created: scopes/planning/NNN-feature-name.md

Structure:
  PART 1: DASHBOARD  — Status: Planning
  PART 2: SPECIFICATION — Empty (fill during planning)
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
- **Keep Dashboard current**: Quick Status should always reflect reality
