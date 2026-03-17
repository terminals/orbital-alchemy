# Anti-Patterns: Dangerous Shortcuts

---
tokens: ~2.5K
load-when: Reviewing code, before committing
last-verified: YYYY-MM-DD
---

These shortcuts seem faster but cause real problems. Each includes the **actual cost** when they go wrong.

---

## Anti-Pattern 1: Using `any` Type

### The Shortcut

```typescript
const data: any = response;
const result: any = await processData(data);
function handler(input: any): any { }
```

### Why It's Tempting
- Faster to write
- No TypeScript errors
- "I'll fix it later"

### Real Consequences
- **Runtime crashes**: `undefined is not a function` in production
- **Wrong data shape**: Passing incorrect objects without compile-time check
- **AI confusion**: Agent can't understand code structure, makes more mistakes

### The Right Way

```typescript
interface ProcessedData {
  id: string;
  value: number;
  status: 'pending' | 'complete';
}

const data: ApiResponse = response;
const result: ProcessedData = await processData(data);
```

---

## Anti-Pattern 2: Business Logic in Controllers

### The Shortcut

```typescript
// In controller
export const getItems = async (req, res) => {
  const items = await db.query('SELECT * FROM items');
  const active = items.filter(i => i.status === 'active');
  const formatted = active.map(i => ({
    ...i,
    display: formatItem(i),
  }));
  res.json({ data: formatted });
};
```

### Why It's Tempting
- Quick to implement
- Everything in one place

### Real Consequences
- **Untestable**: Can't unit test business logic without HTTP
- **Code duplication**: Same logic copied to other endpoints
- **Architecture violation**: Breaks layer separation

### The Right Way

```typescript
// In service
export async function getActiveItems(): Promise<ItemDto[]> {
  const items = await db.query('...');
  return items
    .filter(i => i.status === 'active')
    .map(formatItem);
}

// In controller (HTTP only)
export const getItems = async (req, res) => {
  const items = await itemService.getActiveItems();
  res.json({ data: items });
};
```

---

## Anti-Pattern 3: Using console.log

### The Shortcut

```typescript
console.log('Debug:', data);
console.error('Error:', error);
```

### Why It's Tempting
- Everyone knows it
- Works immediately

### Real Consequences
- **No context**: No timestamps, no service name
- **Production leaks**: Sensitive data in console
- **Unstructured**: Can't search, filter, or aggregate

### The Right Way

Use a structured logger with levels, context, and proper formatting.

---

## Anti-Pattern 4: Hardcoded Values

### The Shortcut

```typescript
const timeout = 5000;
const apiUrl = 'https://api.example.com';
const maxRetries = 3;
```

### Why It's Tempting
- Quick to implement
- Works for now

### Real Consequences
- **Environment issues**: Different values needed for dev/staging/prod
- **Tuning difficulty**: Can't adjust without code changes
- **Magic numbers**: Future devs don't understand why `5000`

### The Right Way

```typescript
// In config/constants.ts
export const CONSTANTS = {
  TIMEOUT_MS: 5000,
  MAX_RETRIES: 10,
} as const;

// In config/environment.ts (env vars)
API_URL: z.string().url()
```

---

## Anti-Pattern 5: Placeholder/Stub Implementations

### The Shortcut

```typescript
const result = 'PLACEHOLDER_NEEDS_IMPLEMENTATION';
const apiKey = 'TODO_REPLACE_WITH_REAL_KEY';
```

### Why It's Tempting
- Unblocks development
- "I'll come back to this later"

### Real Consequences
- **Production failures**: Code "works" but doesn't actually do anything
- **Silent breakage**: Downstream code tries to use placeholder data
- **Lost context**: Original developer may not be the one who finds it

### The Right Way

```typescript
// Option 1: Throw immediately if not implemented
throw new Error('Feature not implemented - see scope 015');

// Option 2: Return typed error response
return { success: false, error: 'FEATURE_NOT_CONFIGURED' };
```

**Rule**: Never commit a placeholder string that could reach production code paths.

---

## Anti-Pattern 6: Mock Data in Production Code

### The Shortcut

```typescript
const mockUser = { id: 'test-user-123', name: 'Mock User' };
const fakeSignature = `${Date.now()}-mock`;
```

### Why It's Tempting
- Makes UI development possible without backend
- Tests pass immediately

### Real Consequences
- **User confusion**: UI shows fake data as if real
- **Data corruption**: Fake IDs stored in database
- **Debugging nightmare**: Is this real data or mock?

### The Right Way

```typescript
// Mock data lives in __tests__/ or __fixtures__/ directories ONLY
// In __tests__/fixtures/mockData.ts
export const mockUser = { id: 'test-user', name: 'Test' };
```

---

## Anti-Pattern 7: "For Now" Shortcuts

### The Shortcut

```typescript
const result = { price: 0 }; // For now
const success = true; // For now, assume it works
```

### Why It's Tempting
- Unblocks development
- "I'll fix it in the next PR"

### Real Consequences
- **Technical debt accumulates**: "For now" becomes "forever"
- **Hidden bugs**: Assumptions baked into code never get verified

### The Right Way

```typescript
// TODO(TICKET-123): Implement proper pricing
// This fallback is temporary until pricing service is integrated
if (!price) {
  logger.warn('Price unavailable, using fallback', { itemId });
  return DEFAULT_PRICE;
}
```

**Rule**: Every "for now" comment must have a linked ticket/scope and a plan for resolution.

---

## Anti-Pattern 8: Default Secret Fallbacks

### The Shortcut

```typescript
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const API_KEY = process.env.API_KEY || 'default-key-123';
```

### Why It's Tempting
- "Makes local development easier"
- Code works without .env file

### Real Consequences
- **Security catastrophe**: If env var isn't set in production, DEFAULT IS USED
- **Predictable secrets**: Attacker reads source code, knows the fallback

### The Right Way

```typescript
// Fail fast on missing secrets
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required.');
}
```

**Rule**: Production code must NEVER have hardcoded secret fallbacks. Fail loudly if missing.

---

## Anti-Pattern 9: Bypassing Git Workflow

### The Shortcut

```bash
git add -A
git commit -m "changes"
git push origin main  # Without running quality gates!
```

### Why It's Tempting
- Faster than running checks
- "It's just documentation/config"

### Real Consequences
- **No quality gates**: Bugs ship without type-check, lint, build, test
- **No rollback point**: Must revert manually
- **Bypasses all safeguards**: Orbital Command hooks and gates not invoked

### The Right Way

Use the configured git skills which run quality gates automatically:

```bash
# Use the skill — it handles branching mode (trunk vs worktree) for you
/git-commit   # Commit with quality gates
/git-main     # Push to main (adapts to your branching mode)
```

---

## Anti-Pattern 10: Silent Failure via Return False/Empty

### The Shortcut

```typescript
export async function pauseItem(id: string): Promise<boolean> {
  try {
    await updateStatus(id, 'PAUSED');
    return true;
  } catch (error) {
    return false; // Silent failure - caller has no error details
  }
}
```

### Why It's Tempting
- Makes caller code simpler
- "Graceful degradation"

### Real Consequences
- **Hidden critical failures**: DB down looks like "no data" to caller
- **No error details**: Caller knows something failed but not what
- **Silent data loss**: Empty arrays hide the fact that data exists but couldn't be read

### The Right Way

```typescript
// Option 1: Let errors propagate (preferred)
export async function pauseItem(id: string): Promise<void> {
  await updateStatus(id, 'PAUSED');
}

// Option 2: Discriminated union for typed errors
type Result<T> =
  | { success: true; data: T }
  | { success: false; error: string; code: string };
```

**Rule**: Never return `false`, `null`, or `[]` to indicate failure. Either throw or use a discriminated union.

---

## Anti-Pattern 11: Empty Catch Blocks

### The Shortcut

```typescript
try {
  await saveMetrics();
} catch {
  // Ignore
}
```

### Why It's Tempting
- "It's just logging, not critical"
- "The main operation succeeded"

### Real Consequences
- **Zero debugging trail**: No record of the error
- **Hidden failures**: "Expected" errors might mask unexpected ones
- **Frequency blindness**: No way to know if errors happen 1% or 99% of the time

### The Right Way

```typescript
try {
  await saveMetrics();
} catch (error) {
  logger.warn('Metrics save failed (non-critical)', {
    error: error instanceof Error ? error.message : String(error),
  });
}
```

**Rule**: An empty catch block is always wrong. At minimum, log a warning.

---

## Quick Reference: Shortcut → Fix

| Shortcut | Fix |
|----------|-----|
| `catch (e) { return null; }` | Let errors propagate or use Result type |
| `catch (e) { return false; }` | `Promise<void>` + throw |
| `catch (e) { return []; }` | Let query errors propagate |
| `: any` | Define proper interface |
| Logic in controller | Move to service |
| `console.log` | Use structured logger |
| Magic numbers | Constants or config |
| `'PLACEHOLDER_...'` strings | Throw error or feature flag |
| Mock data in production | Move to `__tests__/fixtures/` |
| `// for now` comments | Link to ticket + implement |
| `\|\| 'default-secret'` | Fail fast if missing |
| `git push origin main` (without gates) | Use `/git-commit` + `/git-main` |
| `catch { }` or `catch { // ignore }` | Log at warning level minimum |

---

## Verification Commands

Check for these anti-patterns:

```bash
# Any types
grep -r ": any" src --include="*.ts" --include="*.tsx" | grep -v justified | grep -v __tests__

# Console statements
grep -rE "console\.(log|error|warn)" src --include="*.ts" --include="*.tsx" | grep -v __tests__

# Placeholder strings
grep -rEi "PLACEHOLDER|STUB|DUMMY|FAKE_|MOCK_" src --include="*.ts" --include="*.tsx" | grep -v __tests__

# "For now" shortcuts
grep -rEi "for now|todo:|fixme:|hack:" src --include="*.ts" --include="*.tsx" | grep -v __tests__

# Default secret fallbacks
grep -rE "\|\| ['\"][^'\"]{5,}['\"]" src --include="*.ts" | grep -iE "secret|key|token|password"

# Empty catch blocks
grep -rE "catch\s*(\([^)]*\))?\s*\{\s*\}" src --include="*.ts" | grep -v __tests__
```
