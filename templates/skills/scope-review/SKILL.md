---
name: scope-review
description: Reviews scope documents with full agent team analysis for comprehensive feedback. Use before implementing scopes, for thorough scope review, or when getting multiple perspectives.
user-invocable: false
---

# /team-review - Full Agent Team Analysis

## What This Does

Invokes the project's agent team to review a scope from all perspectives, applies fixes directly to the SPECIFICATION, then records findings in the AGENT REVIEW section for traceability.

**Key principle**: After review, the SPECIFICATION must be a ready-to-execute contract. The implementer should never need to read AGENT REVIEW to know what to build.

## Steps

### Step 0: Record Session ID

1. Run: `bash .claude/hooks/get-session-id.sh` — capture the UUID output
2. Read the scope file's YAML frontmatter `sessions` field
3. If `sessions:` key doesn't exist in frontmatter, add `sessions: {}` after `tags:`
4. If the UUID is NOT already in `sessions.reviewScope`, append it (skip if duplicate)
5. Write the updated frontmatter back to the scope file

### Step 1: Load Scope Context

Extract from the scope document:
- **SPECIFICATION section** (primary context for agents)
- **PROCESS Decisions & Uncertainties** (helps agents understand reasoning)
- **Files Summary** (determines which agents to invoke)

### Step 2: Determine Which Agents to Invoke

Select agents based on `.claude/config/agent-triggers.json` and `orbital.config.json` agents configuration. The trigger file maps file patterns to the agents that should review changes in those areas.

Read `.claude/config/agent-triggers.json` and match the scope's **Files Summary** against the configured patterns to determine which agents to launch.

### Step 3: Launch Agent Team in Parallel

**Launch all relevant agents in a SINGLE message with parallel Task tool calls.**

Read each agent's spec first from `.claude/agents/`. Then launch with `subagent_type: "general-purpose"`:

```
Task: "Agent Review" — Include full SPECIFICATION section in prompt.
Each agent reviews from their perspective and returns findings with severity.
```

### Step 4: Synthesize Findings with Dispositions

Categorize agent findings into BLOCKERS / WARNINGS / SUGGESTIONS / VERIFIED OK (same as before). Then assign each finding a **disposition** that determines what happens next:

| Disposition | When to Use | Applied to Spec? |
|-------------|-------------|-------------------|
| `APPLY` | Single clear fix, no ambiguity | Yes, automatically |
| `CLARIFY` | Multiple valid resolution paths — user must choose | Yes, after user answers |
| `NOTE` | Advisory guidance for the implementer, no spec change needed | No |

**Classification rules:**

- **BLOCKERS**: Default `APPLY`. Escalate to `CLARIFY` only when the blocker presents two or more valid approaches and the right choice depends on user preference or business context.
- **WARNINGS**: `APPLY` when they identify a concrete spec gap (missing file, wrong type, missing constraint, incorrect architecture). `NOTE` when advisory ("keep additions minimal", "consider extracting if file grows").
- **SUGGESTIONS**: Default `NOTE`. Promote to `APPLY` only when they fill an objective spec deficiency (e.g., missing shared component that multiple phases reference).

**Resolve conflicts during synthesis** using a priority hierarchy appropriate to the project. Typical ordering:
1. Security agents (security wins)
2. Domain-critical agents (safety, financial, data integrity)
3. Reliability agents (chaos, resilience)
4. Domain experts (correctness)
5. Architecture agents (patterns)
6. UI/UX agents (aesthetics)

### Step 5: Ask Clarifying Questions

**After synthesis, before touching the spec** — collect all `CLARIFY` items and present them to the user as a batch. For each item:
- State the problem clearly
- List labeled options (A, B, etc.)
- Provide a recommendation with reasoning

Wait for user answers before proceeding.

**If zero `CLARIFY` items, skip this step entirely.**

Example format:

```
The review found N items that need your input before I update the spec:

**[B-2] Service layer boundary violation**
Module X has zero DB imports. Adding data lookup inside processRequest() breaks layer purity.

  A) Push data resolution to callers — callers pass pre-resolved data into Module X (clean layers, slightly more caller code)
  B) Create a thin middleware — wraps Module X calls, resolves data externally (more abstraction, new file)

  Recommendation: A — matches existing caller-resolves pattern in the codebase

**[W-4] Configuration source for feature Y**
Feature Y uses a flat estimate, has no concept of dynamic configuration.

  A) Use a config constant (e.g., CONFIG.FEATURE_Y.ESTIMATE)
  B) Calculate from historical data

  Recommendation: A — simpler, no query overhead

Which options? (e.g., "B-2: A, W-4: A" or "agree" for all recommendations)
```

### Step 6: Apply Fixes to SPECIFICATION

With all `APPLY` items and resolved `CLARIFY` items, systematically update the SPECIFICATION. The review is an authorized modification — no need to toggle `spec_locked`.

**What to update, by section:**

| Spec Subsection | Types of Changes |
|-----------------|------------------|
| **Requirements (Must Have)** | Add missing requirements identified by blockers. Update text to incorporate fixes. |
| **Requirements (Nice to Have)** | Promote to Must Have if a blocker requires the item. |
| **Requirements (Out of Scope)** | Add items explicitly excluded by review decisions. |
| **Technical Approach** | Fix architectural errors (e.g., tier violations). Update diagrams/data flows. Document resolved design decisions. |
| **Implementation Phases — Files** | Add missing files (test files, schema.sql, etc.). Remove invalid files. Update file descriptions. |
| **Implementation Phases — Changes** | Update change descriptions to incorporate fixes. Add new change items for blocker-identified work. |
| **Files Summary** | Add/remove/update rows to match phase file changes. |
| **Success Criteria** | Add criteria for significant blocker fixes. |
| **Risk Assessment** | Add new risks identified by agents. Update mitigations. |
| **Definition of Done** | Add items for significant new requirements. |

**Do NOT modify**: DASHBOARD (status updates are Step 8), PROCESS (implementation working memory), AGENT REVIEW (written separately in Step 7).

**Add a DEVIATION NOTE** inside the SPECIFICATION HTML comment block:

```html
<!--
DEVIATION NOTE (YYYY-MM-DD): Spec updated by /scope review to address
N blockers and M warnings. Key changes: [2-3 word summary per major change].
See AGENT REVIEW section for full traceability.
-->
```

### Step 7: Write AGENT REVIEW Section

Write findings to the **AGENT REVIEW** section with the same synthesis format, plus a summary header and **Resolution** lines for traceability:

```markdown
### Review Status
- **Requested**: [agent-list]
- **Completed**: [agent-list]
- **Date**: YYYY-MM-DD

### Spec Changes Applied
N blockers and M warnings applied directly to the SPECIFICATION.
K items resolved via user clarification.
J items are implementation notes (no spec change).

### Synthesis

**BLOCKERS** (must fix before implementation):

- [B-1] Description (Source: Agent, Severity)
  **Resolution**: APPLIED — [one-line summary of what changed in the spec]

- [B-2] Description (Source: Agent, Severity)
  **Resolution**: APPLIED (user chose Option A) — [one-line summary]

- [B-3] Description (Source: Agent)
  **Resolution**: NOTE — [why no spec change: advisory guidance, implementation detail, etc.]

**WARNINGS** (should fix):

- [W-1] Description (Source: Agent)
  **Resolution**: APPLIED — [what changed]

- [W-2] Description (Source: Agent)
  **Resolution**: NOTE — implementation guidance for the executor

**SUGGESTIONS** (nice to have):

- [S-1] Description (Source: Agent)
  **Resolution**: NOTE — optional enhancement, not applied to spec

- [S-2] Description (Source: Agent)
  **Resolution**: APPLIED — [what changed]

**VERIFIED OK**:
- [Points agents confirmed are correct]
```

### Step 8: Update Scope Status

After applying spec fixes and writing the AGENT REVIEW:
- Update frontmatter: `status: backlog`, `spec_locked: true`
- Move file: `mv scopes/planning/{file} scopes/backlog/`
- Update DASHBOARD Quick Status: `🟢 **Status**: Backlog | **Spec Locked**: Yes`
- Add to Recent Activity: `Review completed — N blockers, M warnings. X items applied to spec, K clarifications resolved.`

### Step 9: Signal Completion

Emit the agent completion event so the Orbital Command dashboard turns off the progress indicator:

```bash
bash .claude/hooks/orbital-emit.sh AGENT_COMPLETED '{"outcome":"success","action":"team_review"}' --scope "{NNN}"
```

## Modes

| Command | What Runs |
|---------|-----------|
| `/team-review` | All relevant agents based on files |
| `/team-review security` | Red team only (security + resilience agents) |
| `/team-review domain` | Blue team only (domain experts) |
| `/team-review full` | ALL agents regardless of files |
