---
id: NNN
title: "Scope Title"
status: planning  # planning | backlog | implementing | review | completed | dev | staging | production
priority: medium   # critical | high | medium | low
effort_estimate: "TBD"
category: "TBD"  # Configure categories in orbital.config.json
created: YYYY-MM-DD
updated: YYYY-MM-DD
spec_locked: false  # true after status = backlog
blocked_by: []      # scope IDs this depends on
blocks: []          # scope IDs waiting on this
tags: []
sessions: {}  # Auto-populated by skills: {implementScope: [], reviewGate: [], pushToDev: [], ...}
---

# Scope NNN: Title

═══════════════════════════════════════════════════════════════════
## PART 1: DASHBOARD
═══════════════════════════════════════════════════════════════════
<!--
PURPOSE: Quick status for user scanning
UPDATES: Continuously as work progresses
-->

### Quick Status
> ⏳ **Status**: Planning | **Phase**: 0 of N | **Spec Locked**: No

### Progress
| Phase | Description | Status |
|-------|-------------|--------|
| 1 | TBD | ⏳ Pending |

### Recent Activity
- **YYYY-MM-DD HH:MM** - Scope created

### Next Actions
- [ ] Complete exploration
- [ ] Draft specification
- [ ] Get spec approval

═══════════════════════════════════════════════════════════════════
## PART 2: SPECIFICATION
═══════════════════════════════════════════════════════════════════
<!--
⚠️ FEATURE LOCK: After status = "ready", this section is LOCKED.
Any agent should be able to implement from ONLY this section.
Changes after lock require explicit approval + deviation note.

PURPOSE: The authoritative contract for what we're building
UPDATES: During planning. Frozen after approval.
-->

### Overview

[Problem statement - what's broken or needed]

**Goal**: [One sentence describing the intended outcome]

### Requirements

#### Must Have
- [ ] Requirement 1
- [ ] Requirement 2

#### Nice to Have
- [ ] Optional enhancement

#### Out of Scope
- Excluded item 1
- Excluded item 2

### Technical Approach

[How we're solving it and why this approach was chosen]

**Why this approach**:
- Reason 1
- Reason 2

**Architecture** (if applicable):
```
[Diagram or structure description]
```

### Implementation Phases

#### Phase 1: [Name] (estimated time)
**Objective**: [What this phase accomplishes]
**Files**: [Files to modify]
**Changes**: [What changes]
**Commit**: `type(scope): message`
**Verification**: [How to verify this phase succeeded]

#### Phase 2: [Name] (estimated time)
**Objective**: [What this phase accomplishes]
**Files**: [Files to modify]
**Changes**: [What changes]
**Commit**: `type(scope): message`
**Verification**: [How to verify this phase succeeded]

### Files Summary

| File | Change | Phase |
|------|--------|-------|
| `path/to/file.ts` | Description of change | 1 |

### Success Criteria

- [ ] Verifiable condition 1
- [ ] Verifiable condition 2
- [ ] Type-check passes
- [ ] Tests pass

### Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Risk description | Low/Med/High | Low/Med/High | How to prevent/handle |

### Definition of Done

- [ ] All phases completed
- [ ] All success criteria met
- [ ] All tests passing
- [ ] Code reviewed
- [ ] Documentation updated (if applicable)

═══════════════════════════════════════════════════════════════════
## PART 3: PROCESS
═══════════════════════════════════════════════════════════════════
<!--
PURPOSE: Claude's working memory - exploration, decisions, implementation
UPDATES: Continuously during work
DISPLAY: Collapsed by default (user can expand if curious)
-->

<details>
<summary>📝 Exploration Log</summary>

<!--
Record your discovery process here. Each session should include:
- Trigger: What prompted this exploration
- Searches: What you looked for and how
- Findings: What you discovered
- Insights: What the findings mean
-->

### Session: YYYY-MM-DD HH:MM

**Trigger**: [What prompted this exploration]

**Search**: [Command or action taken]
```bash
# Example search command
```

**Findings**: [What was found]

**Insight**: [What this means for the solution]

</details>

<details>
<summary>🤔 Decisions & Reasoning</summary>

<!--
Capture decisions with alternatives and rationale.
This helps future sessions understand WHY choices were made.
-->

### Decisions Made

| # | Decision | Chosen | Rejected Alternatives | Confidence |
|---|----------|--------|----------------------|------------|
| 1 | [Decision description] | [What was chosen] | [Alt 1 (why rejected), Alt 2 (why rejected)] | NN% |

### Uncertainties

| Area | Confidence | Mitigation |
|------|------------|------------|
| [Area of uncertainty] | NN% | [How to address if wrong] |

### Resolved Questions

| Question | Resolution | Date |
|----------|------------|------|
| [Question asked] | [Answer/decision] | YYYY-MM-DD |

</details>

<details>
<summary>📜 Implementation Log</summary>

<!--
Updated during implementation. For each phase, record:
- What was actually done
- Any issues encountered
- Actual commit hash
- Time taken
- Deviations from spec (if any)
-->

### Phase 1: [Pending]
<!-- Example when complete:
### Phase 1: Completed YYYY-MM-DD HH:MM
- Added X to file Y
- Encountered issue with Z, resolved by...
- Commit: `abc1234`
- Time: 25 minutes (estimated 30 min)
-->

</details>

<details>
<summary>⚠️ Deviations from Spec</summary>

<!--
If implementation differs from SPECIFICATION, document here:
- What was specified
- What was actually done
- Why the deviation was necessary
-->

None.

</details>

═══════════════════════════════════════════════════════════════════
## AGENT REVIEW
═══════════════════════════════════════════════════════════════════
<!--
Populated by /scope-pre-review before implementation begins.
Contains synthesis of all agent findings.
-->

### Review Status
- **Requested**: [agent-list]
- **Completed**: [agent-list]
- **Date**: YYYY-MM-DD

### Synthesis

**BLOCKERS** (must fix before implementation):
- None

**WARNINGS** (should fix):
- None

**SUGGESTIONS** (nice to have):
- None

**VERIFIED OK**:
- None yet
