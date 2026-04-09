#!/bin/bash
# orbital-report-deploy.sh — Report deployment events to Orbital dashboard
#
# Usage:
#   orbital-report-deploy.sh <environment> <status> [commit_sha] [branch] [pr_number]
#
# Actions:
#   New deployment:  orbital-report-deploy.sh staging deploying abc1234 feature/x 42
#   Update status:   ORBITAL_DEPLOY_ID=5 orbital-report-deploy.sh staging healthy
#
# Environment variables:
#   ORBITAL_DEPLOY_ID   — existing deployment ID to update (PATCH instead of POST)
#   ORBITAL_URL         — base URL (default: http://localhost:4444)
#
# Health check URLs are read from .claude/orbital.config.json under "healthChecks".
# If not configured, the health check step is skipped.
#
# Fails silently if the Orbital server is not running.
set -e

ENVIRONMENT="${1:?Usage: orbital-report-deploy.sh <environment> <status> [commit_sha] [branch] [pr_number]}"
STATUS="${2:?Usage: orbital-report-deploy.sh <environment> <status> [commit_sha] [branch] [pr_number]}"
COMMIT_SHA="${3:-}"
BRANCH="${4:-}"
PR_NUMBER="${5:-}"

ORBITAL_URL="${ORBITAL_URL:-http://localhost:4444}"

# Find project root for config lookup
if [ -n "$CLAUDE_PROJECT_DIR" ]; then
  PROJECT_ROOT="$CLAUDE_PROJECT_DIR"
else
  PROJECT_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || echo ".")
fi

if [ -n "$ORBITAL_DEPLOY_ID" ]; then
  # Update existing deployment — build payload with jq
  JQ_ARGS=(--arg status "$STATUS")
  JQ_EXPR='{status: $status}'
  [ -n "$COMMIT_SHA" ] && JQ_ARGS+=(--arg details "$COMMIT_SHA") && JQ_EXPR='{status: $status, details: $details}'
  PAYLOAD=$(jq -n "${JQ_ARGS[@]}" "$JQ_EXPR")

  curl --fail --silent --max-time 2 \
    -X PATCH \
    -H "Content-Type: application/json" \
    -d "$PAYLOAD" \
    "$ORBITAL_URL/api/orbital/deployments/$ORBITAL_DEPLOY_ID" > /dev/null 2>&1 || true
else
  # Create new deployment record — build payload with jq
  JQ_ARGS=(--arg environment "$ENVIRONMENT" --arg status "$STATUS")
  JQ_EXPR='{environment: $environment, status: $status}'

  [ -n "$COMMIT_SHA" ] && JQ_ARGS+=(--arg commit_sha "$COMMIT_SHA") && JQ_EXPR="${JQ_EXPR%\}}, commit_sha: \$commit_sha}"
  [ -n "$BRANCH" ] && JQ_ARGS+=(--arg branch "$BRANCH") && JQ_EXPR="${JQ_EXPR%\}}, branch: \$branch}"
  [ -n "$PR_NUMBER" ] && JQ_ARGS+=(--argjson pr_number "$PR_NUMBER") && JQ_EXPR="${JQ_EXPR%\}}, pr_number: \$pr_number}"

  # Read health check URL from orbital.config.json if configured
  HEALTH_URL=""
  if command -v jq >/dev/null 2>&1 && [ -f "$PROJECT_ROOT/.claude/orbital.config.json" ]; then
    HEALTH_URL=$(jq -r ".healthChecks[\"$ENVIRONMENT\"] // empty" "$PROJECT_ROOT/.claude/orbital.config.json" 2>/dev/null)
  fi
  [ -n "$HEALTH_URL" ] && JQ_ARGS+=(--arg health_check_url "$HEALTH_URL") && JQ_EXPR="${JQ_EXPR%\}}, health_check_url: \$health_check_url}"

  PAYLOAD=$(jq -n "${JQ_ARGS[@]}" "$JQ_EXPR")

  # POST and capture the response to extract deployment ID
  RESPONSE=$(curl --fail --silent --max-time 2 \
    -X POST \
    -H "Content-Type: application/json" \
    -d "$PAYLOAD" \
    "$ORBITAL_URL/api/orbital/deployments" 2>/dev/null) || true

  # Print the deployment ID for callers to capture
  if [ -n "$RESPONSE" ]; then
    DEPLOY_ID=$(echo "$RESPONSE" | jq -r '.id // empty' 2>/dev/null)
    [ -n "$DEPLOY_ID" ] && echo "$DEPLOY_ID"
  fi
fi
