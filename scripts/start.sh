#!/bin/bash
# Start Orbital Command
# Usage: ./scripts/start.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

# Install deps if needed
if [ ! -d "node_modules" ]; then
  echo "[Orbital] Installing dependencies..."
  npm install
fi

# Start both server and client
echo "[Orbital] Starting Orbital Command..."
npm run dev
