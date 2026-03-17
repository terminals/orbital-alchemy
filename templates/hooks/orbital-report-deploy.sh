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
  # Update existing deployment
  PAYLOAD="{\"status\":\"$STATUS\""
  [ -n "$COMMIT_SHA" ] && PAYLOAD="$PAYLOAD,\"details\":\"$COMMIT_SHA\""
  PAYLOAD="$PAYLOAD}"

  curl --fail --silent --max-time 2 \
    -X PATCH \
    -H "Content-Type: application/json" \
    -d "$PAYLOAD" \
    "$ORBITAL_URL/api/orbital/deployments/$ORBITAL_DEPLOY_ID" > /dev/null 2>&1 || true
else
  # Create new deployment record
  PAYLOAD="{\"environment\":\"$ENVIRONMENT\",\"status\":\"$STATUS\""

  [ -n "$COMMIT_SHA" ] && PAYLOAD="$PAYLOAD,\"commit_sha\":\"$COMMIT_SHA\""
  [ -n "$BRANCH" ] && PAYLOAD="$PAYLOAD,\"branch\":\"$BRANCH\""
  [ -n "$PR_NUMBER" ] && PAYLOAD="$PAYLOAD,\"pr_number\":$PR_NUMBER"

  # Read health check URL from orbital.config.json if configured
  HEALTH_URL=$(cat "$PROJECT_ROOT/.claude/orbital.config.json" 2>/dev/null | grep -A5 "\"healthChecks\"" | grep "\"$ENVIRONMENT\"" | sed 's/.*: *"//;s/".*//')
  if [ -n "$HEALTH_URL" ]; then
    PAYLOAD="$PAYLOAD,\"health_check_url\":\"$HEALTH_URL\""
  fi

  PAYLOAD="$PAYLOAD}"

  # POST and capture the response to extract deployment ID
  RESPONSE=$(curl --fail --silent --max-time 2 \
    -X POST \
    -H "Content-Type: application/json" \
    -d "$PAYLOAD" \
    "$ORBITAL_URL/api/orbital/deployments" 2>/dev/null) || true

  # Print the deployment ID for callers to capture
  if [ -n "$RESPONSE" ]; then
    DEPLOY_ID=$(echo "$RESPONSE" | grep -o '"id":[0-9]*' | grep -o '[0-9]*')
    [ -n "$DEPLOY_ID" ] && echo "$DEPLOY_ID"
  fi
fi
