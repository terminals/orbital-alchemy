---
name: test-checks
description: Runs 13 quality gates including linting, type checking, rule verification, and stale scope detection. Use before commits, after making changes, or when checking code quality quickly.
user-invocable: true
---

# /test-checks - Run All Quality Gates

---
tokens: ~600
trigger: /test-checks
purpose: Run the complete 13-step quality gate pipeline before committing
---

## What This Does

Executes the full pre-commit quality pipeline - same checks the git hook runs.

## The 13 Checks

| # | Check | Command (from orbital.config.json) | What It Catches |
|---|-------|--------------------------------------|-----------------|
| 1 | TypeScript | `commands.typeCheck` | Type errors |
| 2 | Lint | `commands.lint` | Code style violations |
| 3 | Build | `commands.build` | Compilation, imports |
| 4 | Templates | `commands.validateTemplates` | Template syntax |
| 5 | Doc Links | `commands.validateDocs` | Broken links |
| 6 | Doc Freshness | `commands.docFreshness` | Stale auto-docs |
| 7 | Enforcement | `commands.checkRules` | Rule violations |
| 8 | Workarounds | grep patterns | Bypass attempts |
| 9 | **Placeholders** | grep PLACEHOLDER/STUB | Incomplete implementations |
| 10 | **Mock Data** | grep mock/fake in prod | Test data in production |
| 11 | **Shortcuts** | grep "for now"/TODO | Unfinished work |
| 12 | **Default Secrets** | grep fallback secrets | Security vulnerabilities |
| 13 | **Stale Scopes** | grep completed scopes | Scopes needing move to completed/ |

## Steps

### Step 1: Run All Checks (with Orbital Gate Reporting)

Read `.claude/orbital.config.json` for project-specific commands. Run each check, capture timing, and report results to Orbital Command. If the Orbital server isn't running, reporting is silently skipped.

```bash
HOOK_DIR="$(git rev-parse --show-toplevel)/.claude/hooks"
export ORBITAL_GATE_COMMIT_SHA=$(git rev-parse --short HEAD 2>/dev/null)

# Helper: run a gate check and report result
# Usage: run_gate <gate_name> <check_number> <total> <command...>
run_gate() {
  local gate="$1" num="$2" total="$3"; shift 3
  echo "[$num/$total] $gate..."
  local start_ms=$(($(date +%s) * 1000))
  if eval "$@" 2>&1; then
    local end_ms=$(($(date +%s) * 1000))
    "$HOOK_DIR/orbital-report-gates.sh" "$gate" "pass" "$(( end_ms - start_ms ))"
    return 0
  else
    local end_ms=$(($(date +%s) * 1000))
    "$HOOK_DIR/orbital-report-gates.sh" "$gate" "fail" "$(( end_ms - start_ms ))"
    return 1
  fi
}

# Checks 1-7: Read commands from orbital.config.json — skip any that are null
# Run commands.typeCheck (if configured, skip if null)
run_gate "type-check" 1 13 "<commands.typeCheck from orbital.config.json>"
# Run commands.lint (if configured, skip if null)
run_gate "lint" 2 13 "<commands.lint from orbital.config.json>"
# Run commands.build (if configured, skip if null)
run_gate "build" 3 13 "<commands.build from orbital.config.json>"
# Run commands.validateTemplates (if configured, skip if null)
run_gate "template-validation" 4 13 "<commands.validateTemplates from orbital.config.json>"
# Run commands.validateDocs (if configured, skip if null)
run_gate "doc-links" 5 13 "<commands.validateDocs from orbital.config.json>"
# Run commands.docFreshness (if configured, skip if null)
run_gate "doc-freshness" 6 13 "<commands.docFreshness from orbital.config.json>"

# Enforcement: capture output for violation reporting
# Run commands.checkRules (if configured, skip if null)
echo "[7/13] rule-enforcement..."
RULES_START=$(($(date +%s) * 1000))
RULES_OUTPUT=$(<commands.checkRules from orbital.config.json> 2>&1)
RULES_EXIT=$?
RULES_END=$(($(date +%s) * 1000))
if [ $RULES_EXIT -eq 0 ]; then
  "$HOOK_DIR/orbital-report-gates.sh" "rule-enforcement" "pass" "$(( RULES_END - RULES_START ))"
else
  "$HOOK_DIR/orbital-report-gates.sh" "rule-enforcement" "fail" "$(( RULES_END - RULES_START ))"
  echo "$RULES_OUTPUT"
fi

# Checks 8-13: Generic code quality checks (not project-specific)
run_gate "no-placeholders" 8 13 '! grep -rEi "PLACEHOLDER|STUB_|DUMMY_" . --include="*.ts" --include="*.py" --include="*.js" | grep -v __tests__ | grep -v node_modules'
run_gate "no-mock-data" 9 13 '! grep -rEi "mockSignature|fakeUser|MOCK_DATA" . --include="*.ts" --include="*.py" --include="*.js" | grep -v __tests__ | grep -v node_modules'
run_gate "no-shortcuts" 10 13 'FOUND=$(grep -rc "for now\|// TODO:\|// FIXME:" . --include="*.ts" --include="*.py" --include="*.js" 2>/dev/null | grep -v node_modules | grep -v ":0$" | wc -l | tr -d " "); [ "$FOUND" -eq 0 ]'
run_gate "no-default-secrets" 11 13 '! grep -rE "\|\| ['\''\"]\.\*(secret|key|token)" . --include="*.ts" --include="*.py" --include="*.js" | grep -v __tests__ | grep -v node_modules'
run_gate "no-stale-scopes" 12 13 'STALE=$(grep -rl "^status: implementing" scopes/completed/ scopes/review/ 2>/dev/null | wc -l | tr -d " "); [ "$STALE" -eq 0 ]'
# Run commands.test (if configured, skip if null)
run_gate "tests" 13 13 "<commands.test from orbital.config.json>"
```

### Step 2: Report Results

Display the summary table (same format as before — the Orbital Command dashboard gets data automatically via the gate reports above).

```
╔═══════════════════════════════════════════════════════════════╗
║  PRE-COMMIT QUALITY GATES                                     ║
╠═══════════════════════════════════════════════════════════════╣
║                                                               ║
║  [1/13]  TypeScript type-check   ✅/❌                        ║
║  [2/13]  ESLint                  ✅/❌                        ║
║  [3/13]  Build                   ✅/❌                        ║
║  [4/13]  Template validation     ✅/❌                        ║
║  [5/13]  Documentation links     ✅/❌                        ║
║  [6/13]  Doc freshness           ✅/❌                        ║
║  [7/13]  Enforcement rules       ✅/❌                        ║
║  [8/13]  No placeholders         ✅/❌                        ║
║  [9/13]  No mock data in prod    ✅/❌                        ║
║  [10/13] No untracked shortcuts  ✅/❌                        ║
║  [11/13] No default secrets      ✅/❌                        ║
║  [12/13] No stale scopes         ✅/❌                        ║
║  [13/13] Tests                   ✅/❌                        ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
```

### Step 3: On Failure

When a check fails:
1. **Read the error** - It tells you what's wrong
2. **Fix the issue** - Use Edit tool
3. **Re-run that check** - Verify the fix
4. **Continue** - Move to next check

## Quick Fixes

| Check | Common Fix |
|-------|-----------|
| TypeScript | Add missing types, fix type mismatches |
| Lint | Run the lint fix command, remove any types |
| Build | Same as TypeScript, check imports |
| Templates | Fix placeholder syntax in template files |
| Doc Links | Update/remove broken links |
| Doc Freshness | Regenerate auto-docs |
| Enforcement | See enforcement rules for specific fixes |
| Workarounds | Use Write/Edit tools properly, not bash |
| **Placeholders** | Replace with real implementation or throw error |
| **Mock Data** | Move to `__tests__/fixtures/` or implement real logic |
| **Shortcuts** | Complete the TODO or link to tracking ticket |
| **Default Secrets** | Remove fallback, require env var with validation |
| **Stale Scopes** | Run `/git-commit` to commit and transition reviewed scopes |

## File Size Check

Also verify no new files exceed the configured line limit (default: 400 lines). Check `orbital.config.json` for `maxFileLines` and `maxFileLinesExemptions`:

```bash
# Adjust the path and extension to match your project structure
find src -name "*.ts" -o -name "*.py" -o -name "*.js" | xargs wc -l | awk '$1 > 400'
```

Check `orbital.config.json` for any exempt files listed under `maxFileLinesExemptions`.

## After All Pass

```bash
git add -A && git commit -m "your message"
```

The git hook will run these same checks automatically.
