# Non-Negotiable Rules

---
tokens: ~2K
load-when: Every coding session
last-verified: YYYY-MM-DD
---

Every rule has a **Verify** command. Run it to check compliance.

---

## Code Quality Rules

### Rule 1: No `any` Types

**Rule**: Never use `any` without explicit justification comment
**Why**: Type safety prevents runtime errors, helps AI understand code
**Verify**:
```bash
grep -r ": any" src --include="*.ts" --include="*.tsx" | grep -v "// justified:"
```
**Expected**: No output (or only justified cases)
**Fix**: Replace with proper type or add `// justified: [reason]`

```typescript
// ❌ FORBIDDEN
const data: any = response;

// ✅ REQUIRED
const data: UserResponse = response;

// ✅ ALLOWED (with justification)
// justified: third-party SDK returns untyped data
const result = response as any;
```

---

### Rule 2: No console.log in Production Code

**Rule**: Never use `console.log`, `console.error`, `console.warn` in production code
**Why**: No context, leaks to production, unstructured
**Verify**:
```bash
grep -rE "console\.(log|error|warn|info)" src --include="*.ts" --include="*.tsx" | grep -v __tests__
```
**Expected**: No output
**Fix**: Use a structured logger

---

### Rule 3: File Size Limit (400 lines)

**Rule**: Production files must be < 400 lines, tests < 800 lines. Applies to `src/`, `server/`, and `bin/`.
**Why**: The v0.3 refactor found 10 files over 500 lines. Large files mix concerns, resist review, and accumulate tech debt silently. The cleanup took a full session to unwind.
**Verify**:
```bash
find src server -name "*.ts" -o -name "*.tsx" | xargs wc -l | sort -rn | awk '$1 > 400 && !/test|__fixtures__/' | head -20
```
**Expected**: No output (or only justified exceptions like types/index.ts, aggregate-routes.ts)
**Fix**: Extract sub-components, split into focused modules, move types to companion files

---

### Rule 4: Max 4 Function Parameters

**Rule**: Functions with >4 parameters must use options object
**Why**: Readability, maintainability
**Verify**: Manual review during PR

```typescript
// ❌ FORBIDDEN
async function processItem(id: string, name: string, type: string, amount: number, options: object): Promise<Result>

// ✅ REQUIRED
async function processItem(options: {
  id: string;
  name: string;
  type: string;
  amount: number;
  options?: object;
}): Promise<Result>
```

---

### Rule 5: Import Ordering

**Rule**: Imports must be: External → Internal (@/) → Relative (./)
**Why**: Consistency, easier scanning
**Verify**: ESLint rule (automatic via linter)

```typescript
// 1. External packages (node_modules)
import { useState } from 'react';
import express from 'express';

// 2. Internal aliases (@/)
import { config } from '@/config';
import { UserService } from '@/services/user';

// 3. Relative imports (./)
import { helpers } from './utils';
```

---

### Rule 6: Explicit Return Types

**Rule**: All exported functions must have explicit return types
**Why**: Contract clarity, catch errors early
**Verify**: TypeScript strict mode catches most cases

```typescript
// ❌ FORBIDDEN
export async function getUser(id: string) { }

// ✅ REQUIRED
export async function getUser(id: string): Promise<User | null> { }
```

---

## Testing Rules

### Rule 7: Tests Required for New Code

**Rule**: All new service and business logic code must have tests
**Why**: Catch bugs early, documentation
**Fix**: Create corresponding test file for new modules

---

### Rule 8: Test Structure (Arrange-Act-Assert)

**Rule**: Tests must follow AAA pattern
**Why**: Readability, maintainability

```typescript
it('should return user by ID', async () => {
  // Arrange
  const userId = 'test-user';

  // Act
  const result = await getUser(userId);

  // Assert
  expect(result).toBeDefined();
  expect(result.id).toBe(userId);
});
```

---

## Git Rules

### Rule 9: Quality Gates Before Commit

**Rule**: Configured checks must pass before committing
**Why**: Prevent broken code in repository
**Verify**: Run configured commands from orbital.config.json (typeCheck, lint, build, test)
**Expected**: All pass with exit code 0

---

### Rule 10: One Commit Per Phase

**Rule**: Commit after each phase completion
**Why**: Progress tracking, easy rollback
**Fix**: Follow phase-by-phase workflow

---

## Workflow Rules

### Rule 11: Verify Before Claiming Success

**Rule**: Run verification commands BEFORE claiming work is complete. Include output as evidence.
**Why**: "Should work" is not evidence. Past incidents where untested claims led to broken commits.
**Fix**: Always run quality gates and show the output before saying "done"

```
// FORBIDDEN
"I've fixed the bug, it should work now."

// REQUIRED
"I've fixed the bug. Here's the verification:
  type-check: PASS
  lint: PASS
  build: PASS
  tests: 47/47 passing"
```

---

### Rule 12: Verify Review Feedback Before Implementing

**Rule**: Verify code review feedback against the actual codebase before implementing suggestions.
**Why**: Review suggestions may be based on stale context or break existing patterns.
**Fix**: Read the relevant code, confirm the suggestion applies, then implement (or push back with reasoning)

---

## Duplication Prevention Rules

### Rule 13: Single Source of Truth for Constants

**Rule**: Color maps, config objects, icon maps, and display constants must be defined once and imported everywhere. Never define inline.
**Why**: The v0.3 audit found ENFORCEMENT_COLORS defined 3x, CATEGORY_CONFIG 4x, and CATEGORY_HEX 2x across the codebase. Each copy drifted slightly (singular vs plural labels, different lifecycle colors).
**Verify**:
```bash
grep -rn "const.*COLORS.*Record\|const.*CONFIG.*Record.*icon\|const.*HEX.*Record" src/components src/views --include="*.tsx" --include="*.ts" | grep -v "import "
```
**Expected**: No output — all constants come from `src/lib/workflow-constants.ts` or similar shared modules
**Fix**: Move to `src/lib/workflow-constants.ts` and import

---

### Rule 14: Use Shared Hook Primitives

**Rule**: Data-fetching hooks must use `useFetch()`. Socket listeners must use `useSocketListener()`. Never duplicate the fetch lifecycle or socket.on/off pattern manually.
**Why**: The v0.3 audit found 15+ hooks with identical fetch boilerplate (useState triple, AbortController, useReconnect) and 86 manual socket.on/off calls. This was ~500 lines of pure duplication.
**Verify**:
```bash
# Check no hook manually manages AbortController (should be in useFetch)
grep -rn "new AbortController" src/hooks --include="*.ts" | grep -v useFetch | grep -v test
```
**Expected**: No output (only useFetch.ts should create AbortControllers)
**Fix**: Use `useFetch(fetchFn)` for data fetching, `useSocketListener(event, handler, deps)` for socket events

---

### Rule 15: Use catchRoute for Express Handlers

**Rule**: Route handlers that can throw must use `catchRoute()` from `server/utils/route-helpers.ts` instead of inline try-catch.
**Why**: The v0.3 audit found identical try-catch + errMsg + status-inference blocks in 7+ route handlers. The pattern is mechanical and should be centralized.
**Verify**:
```bash
grep -rn "try {" server/routes --include="*.ts" | grep -v test | grep -v node_modules
```
**Expected**: Minimal matches — most routes should use catchRoute
**Fix**: Wrap handler with `catchRoute(fn)` or `catchRoute(fn, inferErrorStatus)`

---

### Rule 16: No Inline Utility Functions in Large Files

**Rule**: Pure functions (parsers, formatters, validators) that don't close over component/hook state must live in companion `*-utils.ts` files, not inline in the consuming file.
**Why**: The v0.3 audit found `parseJsonFields` copied verbatim between two files, and `parseDragId` + `checkActiveDispatch` buried inside a 490-line hook. Extracting them enabled testing and reuse.
**Verify**: Manual review — if a function doesn't reference `useState`, `useCallback`, or local state, it belongs in a utils file
**Fix**: Extract to a companion file (e.g., `useKanbanDnd.ts` → `kanban-dnd-utils.ts`)

---

## Quick Verification Checklist

Run before every commit:

```bash
# Run configured quality gates (commands from orbital.config.json)
# Typical setup:
# 1. Type check:  npx tsc --noEmit
# 2. Lint:        npx eslint src/
# 3. Build:       npm run build
# 4. Tests:       npm test
```

All must pass. No exceptions.
