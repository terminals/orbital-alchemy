#!/bin/bash
# Release Orbital Command
# Usage: ./scripts/release.sh [patch|minor|major]
#
# Runs the full validation pipeline, bumps version, tags, and pushes.
# The tag push triggers publish.yml which publishes to npm.

set -e

BUMP="${1:-patch}"

if [[ "$BUMP" != "patch" && "$BUMP" != "minor" && "$BUMP" != "major" ]]; then
  echo "Usage: ./scripts/release.sh [patch|minor|major]"
  echo "  Default: patch"
  exit 1
fi

# Ensure clean working tree
if [[ -n "$(git status --porcelain)" ]]; then
  echo "Error: working tree is dirty. Commit or stash changes first."
  exit 1
fi

# Ensure we're on main
BRANCH="$(git branch --show-current)"
if [[ "$BRANCH" != "main" ]]; then
  echo "Error: releases must be cut from main (currently on $BRANCH)"
  exit 1
fi

# Pull latest
echo "Pulling latest from origin/main..."
git pull --ff-only origin main

# Validate
echo ""
echo "Running full validation pipeline..."
echo ""
npm run validate

# Bump version and create tag
echo ""
echo "Bumping $BUMP version..."
npm version "$BUMP"

# Push commit and tag
echo ""
echo "Pushing to origin..."
git push origin main --follow-tags

VERSION="$(node -p "require('./package.json').version")"
echo ""
echo "Released v$VERSION — publish.yml will handle npm publish."
