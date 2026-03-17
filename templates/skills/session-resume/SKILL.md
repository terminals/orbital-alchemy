---
name: session-resume
description: Resumes previous work session by loading saved context and progress. Use when continuing previous work, picking up where left off, or restoring session state.
user-invocable: true
---

# /session-resume - Session Resumption

Reconstruct context and pick up where you left off.

---

## What This Skill Does

Quickly rebuilds context after interruption:

1. **Check git status** - Uncommitted work
2. **Check recent commits** - What was done
3. **Check scope docs** - In-progress scopes
4. **Check TODOs** - Pending markers in code
5. **Reconstruct state** - "Where were we?"
6. **Identify next steps** - What to do next

---

## When to Use

- After context compaction
- Starting new session with in-progress work
- Returning after a break
- "Where were we?"

---

## Trigger Phrases

This skill should be suggested when user says:
- "Where were we?"
- "What was I working on?"
- "Resume"
- "Continue where we left off"
- "Pick up from before"

---

## Auto-Trigger Contexts

This skill should be **automatically suggested** when:
- Session starts with uncommitted changes in git
- After context compaction (detected by system)
- Conversation starts with implicit continuation

---

## Execution

### Step 1: Check Git Status

```bash
# Uncommitted changes
git status --short

# Recent commits (last 5)
git log --oneline -5

# Current branch
git branch --show-current
```

**Parse results:**
```markdown
### Git Context

**Branch**: `feature/scope-012-refactor`
**Uncommitted changes**: 8 files modified
**Recent commits**:
- `abc1234` feat: Add auth middleware (2 hours ago)
- `def5678` refactor: Extract helper functions (3 hours ago)
```

### Step 2: Check Scope Documents

```bash
# Find in-progress scopes
grep -l "Status:.*In Progress\|Status:.*in_progress" scopes/*.md

# Check most recent scope
ls -t scopes/*.md | head -1
```

**Parse scope status:**
```markdown
### Active Scope

**Scope**: 012-service-refactor
**Status**: In Progress
**Current Phase**: Phase 2 - Extract Helpers
**Completed**: Phase 1
**Remaining**: Phase 2 (in progress), Phase 3, Phase 4
```

### Step 3: Check for TODOs

```bash
# TODO markers in recently modified files
git diff --name-only HEAD~5 | xargs grep -n "TODO\|FIXME\|XXX" 2>/dev/null

# Or in uncommitted changes
git diff --name-only | xargs grep -n "TODO\|FIXME" 2>/dev/null
```

### Step 4: Generate Resume Report

```markdown
## Session Resume Report

### Quick Summary
You were working on **Scope 012: Service Refactor**.
Last activity was **2 hours ago**.

### Current State

**Branch**: `feature/scope-012-refactor`

**Uncommitted Work**:
- `src/utils/helpers.ts` - New file (extracted helpers)
- `src/services/manager.ts` - Modified (imports updated)

**Scope Progress**:
| Phase | Status |
|-------|--------|
| Phase 1: Extract types | Complete |
| Phase 2: Extract helpers | In Progress |
| Phase 3: Integrate changes | Pending |

**TODOs Found**:
- `helpers.ts:45`: `// TODO: Add error handling`

### Recommended Next Steps

1. **Complete Phase 2**: Finish extracting queue helpers
2. **Fix TODO**: Add error handling in helpers.ts:45
3. **Run tests**: Verify nothing is broken
4. **Commit checkpoint**: Save progress before Phase 3
```

### Step 5: Offer Actions

After presenting the resume report, offer:
- "Continue with [next phase]?"
- "Should I run `/test-checks` first to verify state?"
- "Would you like me to explain what was being worked on?"

---

## Output Format

```markdown
## 🔄 Session Resume

### Context Restored
[1-2 sentence summary of where we are]

### Work in Progress
| Item | Status | Files |
|------|--------|-------|
| [task] | [status] | [files] |

### Last Actions
- [Recent commit 1]
- [Recent commit 2]

### Pending Items
- [ ] [Item 1]
- [ ] [Item 2]

### Suggested Next Step
[Recommended action]
```

---

## Integration with Scope Documents

If a scope is in progress, extract:
- Current phase name and status
- Checklist items completed/remaining
- Team review findings (if present)
- Blockers identified

This makes the scope document the **single source of truth** for resumption.

---

## Tips

- **Check uncommitted first** - Most important context
- **Recent > old** - Focus on last few hours of work
- **Be specific** - Name files, line numbers, phases
- **Suggest action** - Don't just report, recommend next step
- **Link to scope** - If scope exists, reference it
