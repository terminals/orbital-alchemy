---
name: all
description: Runs complete validation suite including pre-commit checks, pre-push verification, and code review agents. Use when preparing major commits, before creating PRs, or for comprehensive quality checks.
user-invocable: false
---

# /test - Complete Validation Suite

---
tokens: ~600
trigger: /test
purpose: Run the full validation pipeline: pre-commit checks, pre-push checks, and parallel code review
---

## What This Does

Combines all validation layers into one comprehensive check:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                            /test                                        │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Phase 1: /test pre-commit (8 checks)                                   │
│  ├── TypeScript, ESLint, Build, Templates                               │
│  └── Doc links, Doc freshness, Enforcement, Workarounds                 │
│                                                                         │
│  Phase 2: /test pre-push (3 checks)                                     │
│  ├── Documentation sync                                                 │
│  ├── Auto-generated docs                                                │
│  └── Code review scan                                                   │
│                                                                         │
│  Phase 3: /test code-review (6 agents in parallel)                      │
│  ├── code-reviewer, silent-failure-hunter, code-simplifier              │
│  └── comment-analyzer, pr-test-analyzer, type-design-analyzer           │
│                                                                         │
│  Phase 4: Synthesize Results                                            │
│  └── Collect findings, categorize by severity                           │
│                                                                         │
│  Phase 5: Scope Completion Check (if all pass)                          │
│  └── Check if branch scopes can move to /scopes/completed/              │
│                                                                         │
│  Phase 6: Reflection Prompt (optional)                                  │
│  └── Prompt for /reflect to capture learnings                           │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

## Steps

### Phase 1: Pre-Commit Checks

Run all 8 quality gates. Read commands from `.claude/orbital.config.json` — skip any that are null:

```bash
echo "═══ PHASE 1: PRE-COMMIT ═══"
# Run commands.typeCheck from orbital.config.json (skip if null)
echo "[1/8] TypeScript..."
# Run commands.lint from orbital.config.json (skip if null)
echo "[2/8] Lint..."
# Run commands.build from orbital.config.json (skip if null)
echo "[3/8] Build..."
# Run commands.validateTemplates from orbital.config.json (skip if null)
echo "[4/8] Templates..."
# Run commands.validateDocs from orbital.config.json (skip if null)
echo "[5/8] Doc links..."
# Run commands.docFreshness from orbital.config.json (skip if null)
echo "[6/8] Doc freshness..."
# Run commands.checkRules from orbital.config.json (skip if null)
echo "[7/8] Enforcement..."
echo "[8/8] Workarounds..." && echo "✅ Check staged files manually"
```

**Stop here if any check fails. Fix before proceeding.**

### Phase 2: Pre-Push Checks

```bash
echo "═══ PHASE 2: PRE-PUSH ═══"

# Check documentation sync
CHANGED=$(git diff --name-only HEAD~1..HEAD 2>/dev/null || git diff --name-only)

echo "Changed files:"
echo "$CHANGED"

# Check critical files from orbital.config.json criticalFiles list (if configured)
echo "Critical files needing docs:"
echo "$CHANGED" | grep -E "<criticalFiles pattern from orbital.config.json>" || echo "None"

# Run commands.docFreshness from orbital.config.json (skip if null)
echo "Auto-docs check..."
```

### Phase 3: Parallel Code Review

Launch ALL 6 review agents simultaneously using Task tool:

**You MUST send a single message with 6 parallel Task invocations:**

```
Task: pr-review-toolkit:code-reviewer
Prompt: "Review current changes for bugs, security, conventions"

Task: pr-review-toolkit:silent-failure-hunter
Prompt: "Review for silent failures; swallowed errors, bad fallbacks"

Task: pr-review-toolkit:code-simplifier
Prompt: "Review for unnecessary complexity"

Task: pr-review-toolkit:comment-analyzer
Prompt: "Review comment accuracy and maintainability"

Task: pr-review-toolkit:pr-test-analyzer
Prompt: "Analyze test coverage gaps"

Task: pr-review-toolkit:type-design-analyzer
Prompt: "Review type design quality"
```

### Phase 4: Synthesize Results

Collect all findings and report:

```
╔═══════════════════════════════════════════════════════════════════════╗
║                         /test RESULTS                                 ║
╠═══════════════════════════════════════════════════════════════════════╣
║                                                                       ║
║  PHASE 1: Pre-Commit          [8/8 passed]  ✅                        ║
║  PHASE 2: Pre-Push            [3/3 passed]  ✅                        ║
║  PHASE 3: Code Review         [findings below]                        ║
║                                                                       ║
║  ─────────────────────────────────────────────────────────────────    ║
║  🚫 BLOCKERS (must fix):       0                                      ║
║  ⚠️  WARNINGS (should fix):     2                                      ║
║  💡 SUGGESTIONS (consider):    5                                      ║
║                                                                       ║
╚═══════════════════════════════════════════════════════════════════════╝
```

### Phase 5: Scope Completion Check (Only If All Phases Pass)

**Only run this phase if Phases 1-3 pass with no blockers.**

This phase checks if any scope documents should be moved to the `/scopes/completed/` folder.

#### Step 1: Extract Scope Numbers from Branch Name

```bash
# Get current branch name and extract scope numbers
BRANCH=$(git branch --show-current)
echo "Current branch: $BRANCH"

# Extract all 3-digit scope numbers from branch name
# Handles patterns like: feature/scopes-007-012, fix/scope-018, feature/024-dynamic-convergence
SCOPE_NUMS=$(echo "$BRANCH" | grep -oE '[0-9]{3}' | sort -u)
echo "Scope numbers found in branch: $SCOPE_NUMS"
```

#### Step 2: Check for Matching Scope Files

```bash
# For each scope number, check if a matching file exists in /scopes/ (not completed/)
for num in $SCOPE_NUMS; do
  SCOPE_FILE=$(ls scopes/${num}-*.md 2>/dev/null)
  if [ -n "$SCOPE_FILE" ]; then
    echo "📋 Found scope file: $SCOPE_FILE"
  fi
done
```

#### Step 3: Prompt for Scope Completion

If matching scope files are found and all tests passed:

```
╔═══════════════════════════════════════════════════════════════════════╗
║                    🎯 SCOPE COMPLETION CHECK                          ║
╠═══════════════════════════════════════════════════════════════════════╣
║                                                                       ║
║  All validation phases PASSED! ✅                                     ║
║                                                                       ║
║  The following scope files match your branch and may be complete:     ║
║                                                                       ║
║    📋 scopes/018-feature-name.md                                      ║
║                                                                       ║
║  ─────────────────────────────────────────────────────────────────    ║
║  Would you like to move completed scopes to /scopes/completed/?       ║
║                                                                       ║
║  Before moving, verify:                                               ║
║    ✓ All acceptance criteria in the scope are met                     ║
║    ✓ No remaining TODOs in the scope file                             ║
║    ✓ Related code changes are committed                               ║
║                                                                       ║
╚═══════════════════════════════════════════════════════════════════════╝
```

#### Step 4: Move Completed Scopes (If User Confirms)

```bash
# Only after user confirmation (scopes are gitignored, use plain mv)
mv scopes/XXX-scope-name.md scopes/completed/
echo "✅ Moved scope XXX to completed folder"
```

**Note:** Scopes are gitignored — use plain `mv`, not `git mv`.

## Modes

| Command | What Runs |
|---------|-----------|
| `/test` | All 6 phases (full validation + scope check + reflect prompt) |
| `/test quick` | Phase 1 only (pre-commit checks) |
| `/test review` | Phase 3 only (parallel code review) |

## On Failure

1. Fix issues found in each phase before proceeding
2. Re-run `/test` to verify fixes
3. Only commit/push when all phases pass

## On Success

When all phases pass with no blockers:
1. Phase 5 automatically checks for scope files matching your branch
2. If found, you'll be prompted to move them to `/scopes/completed/`
3. Verify acceptance criteria are met before confirming the move
4. Use plain `mv` when moving scope files (scopes are gitignored)

### Phase 6: Reflection Prompt (Optional)

After successful validation, prompt for reflection:

```
╔═══════════════════════════════════════════════════════════════════════╗
║                    🎯 ALL VALIDATION PASSED                           ║
╠═══════════════════════════════════════════════════════════════════════╣
║                                                                       ║
║  Before you commit, consider running /reflect to:                     ║
║                                                                       ║
║    📚 Record any lessons learned                                      ║
║    🪝 Identify hook improvements                                      ║
║    ⚡ Suggest skill enhancements                                       ║
║    🤖 Note agent feedback                                             ║
║                                                                       ║
║  This helps improve the system for future work!                       ║
║                                                                       ║
║  Run /reflect now? (or skip and commit)                               ║
║                                                                       ║
╚═══════════════════════════════════════════════════════════════════════╝
```

If user chooses to reflect, invoke the `/reflect` skill before proceeding to commit.
