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

**Rule**: Production files must be < 400 lines, tests < 800 lines
**Why**: Maintainability, cognitive load
**Verify**:
```bash
find src -name "*.ts" -o -name "*.tsx" | xargs wc -l | awk '$1 > 400' | grep -v __tests__
```
**Expected**: No output
**Fix**: Split into focused modules

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
