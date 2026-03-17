---
name: git-hotfix
description: Applies emergency fixes by branching from main with expedited workflow. Use only for critical production issues, genuine emergencies, or urgent security fixes.
user-invocable: true
---

# /git-hotfix

Emergency workflow for critical production fixes.

---

## When to Use Hotfix

**Only for production emergencies:**

- [ ] Users affected right now
- [ ] Money/funds at risk
- [ ] Security vulnerability active
- [ ] Core functionality broken

**NOT for:**
- Performance improvements
- Minor bugs
- Features that were missed
- "Nice to have" fixes

---

## Hotfix Rules

1. **Branch from main** (not staging)
2. **Minimal fix only** - no refactoring, no "while I'm here"
3. **Direct PR to main** - bypasses staging for speed
4. **Backport to staging** - sync after production is fixed

---

## Execution

### Step 0: Detect Branching Mode

```bash
BRANCHING_MODE=$(grep '^WORKFLOW_BRANCHING_MODE=' .claude/config/workflow-manifest.sh 2>/dev/null | cut -d'"' -f2)
[ -z "$BRANCHING_MODE" ] && BRANCHING_MODE="trunk"
```

### Step 1: Create Hotfix Branch

```bash
# Start from main (production code)
git checkout main
git pull origin main

# Create hotfix branch
git checkout -b hotfix/brief-description

# Example: hotfix/api-auth-race-condition
```

### Step 2: Implement Minimal Fix

**Rules:**
- Fix ONLY the broken thing
- No cleanup, no refactoring
- No "improvements" while you're there
- Keep the diff as small as possible

```bash
# Make your fix
# ...edit files...

# Verify quality gates — run configured commands from orbital.config.json
# Run commands.typeCheck, commands.lint, commands.test (skip any that are null)
```

### Step 3: Create PR to Main

```bash
# Push hotfix branch
git push -u origin hotfix/brief-description

# Create PR directly to main
gh pr create --base main \
  --title "hotfix: brief description of fix" \
  --body "## Emergency Hotfix

**Issue:** [Brief description of production issue]

**Root Cause:** [What caused it]

**Fix:** [What this PR does]

## Verification

- [ ] Fix verified locally
- [ ] Quality gates pass
- [ ] Minimal changes only

## Post-Merge

- [ ] Monitor production logs
- [ ] Backport to staging
- [ ] Document in lessons-learned.md"
```

### Step 4: Fast-Track Review and Merge

```bash
# Check CI
gh pr checks

# If CI passes and fix is verified, merge
# Use MERGE commit (not squash) for main
gh pr merge --merge
```

### Step 5: Verify Production

```bash
# Wait 3 min for deploy

# Health check (read healthChecks.production from orbital.config.json, skip if not configured)
# curl -s <healthChecks.production URL> | jq

# Watch logs using your deployment platform's CLI
```

### Step 6: Backport to Staging (Gitflow Only)

**Skip this step if `BRANCHING_MODE=trunk`** (no staging branch in trunk mode).

**Critical:** Staging must stay in sync with main.

```bash
# Get the merge commit SHA from main
git checkout main
git pull origin main
HOTFIX_SHA=$(git rev-parse HEAD)

# Switch to staging
git checkout staging
git pull origin staging

# Cherry-pick the hotfix
git cherry-pick $HOTFIX_SHA

# Push to staging
git push origin staging
```

If cherry-pick has conflicts:
```bash
# Resolve conflicts
git add .
git cherry-pick --continue

# Or if too messy, create a regular PR
git cherry-pick --abort
git checkout -b backport/hotfix-description
# ... apply fix manually ...
gh pr create --base staging
```

---

## Hotfix Checklist

```
Pre-Merge:
[ ] Hotfix branches from main (not staging)
[ ] Fix is minimal - no extras
[ ] Quality gates pass
[ ] CI checks pass

Post-Merge:
[ ] Production health verified
[ ] Issue confirmed resolved
[ ] Backported to staging
[ ] Documented in lessons-learned.md
[ ] Team notified
```

---

## Post-Mortem

After the emergency is handled:

1. **Document what happened** in `.claude/lessons-learned.md`
2. **Identify root cause** - why wasn't this caught on staging?
3. **Create follow-up ticket** - proper fix if hotfix was a band-aid
4. **Update monitoring** - add alerting for this scenario

Template for lessons-learned.md:
```markdown
## [Date] Hotfix: [Title]

**Issue:** What broke
**Impact:** Who was affected, for how long
**Root Cause:** Why it happened
**Fix:** What we did
**Prevention:** How to prevent similar issues
```

---

## Common Hotfix Scenarios

| Scenario | Approach |
|----------|----------|
| API returning 500s | Add error handling, return graceful error |
| Database query timeout | Add index, simplify query |
| Rate limit too aggressive | Increase limit temporarily |
| Environment variable wrong | Fix in deployment platform dashboard (no deploy needed) |
| Critical business logic bug | Minimal targeted fix, revert if necessary |

---

## Related

- `/git-production` — Production release PR
- `/git-staging` — Staging PR workflow
