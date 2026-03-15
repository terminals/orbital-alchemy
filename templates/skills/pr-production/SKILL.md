---
name: pr-production
description: Creates release pull requests from staging to main for production deployment. Use when staging is validated, ready for production release, or creating release PRs.
user-invocable: false
---

# /git:pr-production

Workflow for creating a release PR from staging to main.

---

## Prerequisites

**Critical:** This creates a production release. Verify:

- [ ] Changes have been on staging for at least 1 hour
- [ ] Staging has been manually verified
- [ ] No critical issues reported on staging
- [ ] Appropriate deployment window (avoid peak hours)
- [ ] Rollback plan identified

---

## Execution

### Step 1: Verify Staging Health

> **Automated:** The `scope-lifecycle-gate.sh` hook records the session UUID
> and transitions staging scopes to production when BATCH_SCOPE_IDS is set.

```bash
# Check staging is healthy (read healthChecks.staging from orbital.config.json, skip if not configured)
# curl -s <healthChecks.staging URL> | jq

# See what will be released
git fetch origin
git log origin/main..origin/staging --oneline
```

**Review these commits carefully.** Understand what's being released.

### Step 2: Scope Status Transition

> **Automated:** The `scope-lifecycle-gate.sh` hook transitions staging scopes to production when BATCH_SCOPE_IDS is set.

### Step 3: Create Release PR

```bash
# Create the release PR
gh pr create \
  --base main \
  --head staging \
  --title "release: $(date +%Y-%m-%d) deployment" \
  --body "## Release Contents

$(git log origin/main..origin/staging --oneline)

## Pre-Release Checklist

- [ ] Staging stable for 1+ hours
- [ ] Manual verification completed
- [ ] No critical issues on staging
- [ ] Rollback plan identified

## Post-Release Verification

- [ ] Health check passes
- [ ] Version endpoint shows correct commit
- [ ] No error spikes in logs
- [ ] Key functionality verified

## Rollback

If issues occur, follow your project's rollback procedure."
```

### Step 4: Review and Approve

```bash
# View the PR
gh pr view --web

# Check CI status
gh pr checks
```

**MANUAL STEP:** Get team review/approval if required.

### Step 5: Merge (Triggers Deploy)

```bash
# Use MERGE commit for production releases (preserves history)
gh pr merge --merge

# Your CI/CD pipeline auto-deploys main to production (if configured)
```

### Step 6: Signal Completion

After the merge succeeds, emit the agent completion event if working on a dispatched scope:

```bash
bash .claude/hooks/orbital-emit.sh AGENT_COMPLETED '{"outcome":"success","action":"pr_production"}' --scope "{NNN}"
```

### Step 7: Verify Production

Wait for deployment to complete (timing depends on your CI/CD pipeline), then:

```bash
# Health check (read healthChecks.production from orbital.config.json, skip if not configured)
# curl -s <healthChecks.production URL> | jq

# Version check (read healthChecks.version from orbital.config.json, skip if not configured)
# curl -s <healthChecks.version URL> | jq

# Watch logs using your deployment platform's CLI
```

---

## Production Release Checklist

After merge:

- [ ] Health check returns 200 (if configured)
- [ ] Version matches expected commit (if configured)
- [ ] No new errors in logs (watch 5 min)
- [ ] Database migrations completed (if any)
- [ ] Key functionality verified
- [ ] Team notified of successful deployment

---

## If Something Goes Wrong

Follow your project's rollback procedure. Common approaches:
```bash
# Via your deployment platform's dashboard (fastest)
# Go to Deployments → Previous deployment → Redeploy

# Or via git revert
git revert HEAD
git push origin main
```

---

## Important Differences: Staging vs Production

| Aspect | Staging PR | Production PR |
|--------|-----------|---------------|
| Merge strategy | Squash | Merge (preserves history) |
| Source | Feature branch | staging branch |
| Target | staging | main |
| Review required | Optional | Recommended |
| Wait after deploy | 3 min | 5+ min monitoring |

---

## Related

- `/git pr-staging` — Create PR from dev to staging (previous step)
- `/git hotfix` — Emergency fix workflow
