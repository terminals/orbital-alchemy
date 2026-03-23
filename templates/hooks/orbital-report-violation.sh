#!/bin/bash
# orbital-report-violation.sh — Emit a VIOLATION event to Orbital dashboard
#
# Usage:
#   orbital-report-violation.sh <rule_name> [file] [details]
#
# Examples:
#   orbital-report-violation.sh "no-any" "src/services/foo.ts" "Found ': any' on line 42"
#   orbital-report-violation.sh "file-size" "src/big.ts" "452 lines (limit 400)"
#   orbital-report-violation.sh "no-console" "" "3 console.log found"
#
# Delegates to orbital-emit.sh for file-based event delivery.
set -e

RULE="${1:?Usage: orbital-report-violation.sh <rule_name> [file] [details]}"
FILE="${2:-}"
DETAILS="${3:-}"

HOOK_DIR="$(cd "$(dirname "$0")" && pwd)"

# Build JSON data payload using jq for safe escaping
JQ_ARGS=(--arg rule "$RULE" --arg outcome "detected")
JQ_EXPR='{rule: $rule, outcome: $outcome}'

if [ -n "$FILE" ]; then
  JQ_ARGS+=(--arg file "$FILE")
  JQ_EXPR='{rule: $rule, outcome: $outcome, file: $file}'
fi
if [ -n "$DETAILS" ]; then
  JQ_ARGS+=(--arg details "$DETAILS")
  JQ_EXPR=$(echo "$JQ_EXPR" | sed 's/}$/, details: $details}/')
fi

DATA=$(jq -n "${JQ_ARGS[@]}" "$JQ_EXPR")

"$HOOK_DIR/orbital-emit.sh" VIOLATION "$DATA"
