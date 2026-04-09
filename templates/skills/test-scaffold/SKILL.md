---
name: test-scaffold
description: Analyzes any project, scaffolds test infrastructure, writes real unit and integration tests, and configures orbital.config.json. Use when a project has no test suite or when commands.test is null.
user-invocable: true
---

# /test-scaffold - Scaffold Test Infrastructure & Write Tests

---
tokens: ~1200
trigger: /test-scaffold
purpose: Detect, install, configure, and write a complete test suite for any project
---

## What This Does

Analyzes the current project, picks the right test framework, installs it, writes real unit and integration tests for the most testable code, and configures `orbital.config.json` so the test gate runs automatically in future quality checks.

## Steps

### Step 1: Detect Existing Test Infrastructure

Check if the project already has tests.

1. Read `.claude/orbital.config.json` — check if `commands.test` is non-null
2. Check `package.json` (or equivalent) for a `test` script
3. Search for existing test files: `*.test.*`, `*.spec.*`, `__tests__/` directories
4. Search for test config files: `vitest.config.*`, `jest.config.*`, `pytest.ini`, `pyproject.toml [tool.pytest]`, `*_test.go`

If tests exist AND `commands.test` is non-null, **verify they actually pass** by running the test command:

```bash
<commands.test value>   # e.g., npm run test
```

- **If tests pass** → print "Tests already configured and passing" and **EXIT**.
- **If tests fail** → print "Tests exist but are failing — proceeding to diagnose and fix." Continue to Step 2, but focus on fixing the existing tests rather than scaffolding from scratch.

If no test infrastructure exists at all, continue to Step 2.

### Step 2: Analyze the Project

Read the project's configuration and source code to determine the stack:

**2a. Identify language and runtime:**
- Read `package.json` → Node.js/TypeScript project
- Read `pyproject.toml` or `setup.py` or `requirements.txt` → Python project
- Read `go.mod` → Go project
- Read `Cargo.toml` → Rust project
- Read `pom.xml` or `build.gradle` → Java/Kotlin project

**2b. Identify build tooling (for framework selection):**
- Check for `vite.config.*` → Vite-based (use Vitest)
- Check for `webpack.config.*` → Webpack-based
- Check for `tsconfig.json` → TypeScript project
- Check for `next.config.*` → Next.js

**2c. Identify code structure:**
- List top-level directories (e.g., `src/`, `server/`, `shared/`, `lib/`, `app/`)
- Note path aliases (from tsconfig `paths`, webpack aliases, etc.)
- **Monorepo detection:** Check for `pnpm-workspace.yaml`, `lerna.json`, `rush.json`, or `workspaces` field in `package.json`. If detected, scope test scaffolding to the current package (the directory containing the nearest `package.json`), not the workspace root.

**2d. Find the most testable code — prioritize in this order:**

1. **Pure functions and classes** — no I/O, no side effects. Look for:
   - Utility modules, parsers, validators, transformers
   - Engine/logic classes that take config and return computed results
   - Type guard functions, normalizers, formatters

2. **Services with injectable dependencies** — constructor takes DB, event emitter, or other services:
   - Database services (CRUD operations)
   - Business logic services
   - Cache/store classes

3. **API routes** — if the project uses Express, Fastify, Flask, etc.:
   - Route handlers with dependency injection
   - REST endpoints that can be tested with HTTP assertions

For each candidate, note: file path, exported functions/classes, whether it has side effects, and what test data it would need.

### Step 3: Choose Test Framework

Based on the analysis in Step 2, select the appropriate test framework:

| Project Type | Framework | HTTP Testing | Why |
|---|---|---|---|
| Vite / React / Vue | **Vitest** | supertest | Shares Vite transform pipeline, native ESM |
| Node.js (no Vite) | **Vitest** | supertest | Fast, modern, good ESM support |
| Next.js | **Vitest** or **Jest** | supertest | Check if Jest is already a dependency |
| Python | **pytest** | pytest + httpx/requests | De facto standard |
| Go | **built-in testing** | net/http/httptest | No external framework needed |
| Rust | **built-in #[test]** | actix-test / axum::test | No external framework needed |

**Do not install a framework the project already has** — check existing dependencies first.

### Step 4: Install and Configure

**4a. Install the framework and test utilities:**

For Node.js projects:
```bash
npm install -D vitest  # (or chosen framework)
# Add HTTP testing if the project has API routes:
npm install -D supertest @types/supertest
```

For Python projects:
```bash
pip install pytest  # or add to dev dependencies
```

**4b. Create the test configuration file:**

For Vitest — create `vitest.config.ts` (separate from `vite.config.ts`):
- Configure `test.environment: 'node'` for server/pure logic tests
- Configure path aliases to match the project's tsconfig
- If the project has both pure logic and I/O-dependent code, configure two projects:
  - `unit` — pure logic tests (fast, no setup)
  - `integration` — tests requiring DB, filesystem, or network (may need setup/teardown)

**4c. Add test scripts** to `package.json` (or equivalent):

```json
"test": "<framework> run",
"test:unit": "<framework> run --project unit",
"test:integration": "<framework> run --project integration",
"test:watch": "<framework>",
"test:coverage": "<framework> run --coverage"
```

**4d. Add `coverage/` to `.gitignore`** if not already present.

### Step 5: Create Test Helpers

Based on what the project needs, create shared test utilities:

**If the project uses a database (SQLite, Postgres, etc.):**
- Create a DB test helper that sets up an isolated test database (in-memory SQLite, test schema, etc.)
- Helper should return `{ db, cleanup }` for use in `beforeEach`/`afterEach`
- **Finding the schema:** Search for `schema.*` files (`.ts`, `.js`, `.sql`), `schema/` directories, or migration files. For TypeScript projects, look for exported DDL constants (e.g., `export const SCHEMA_DDL`). For SQL files, import them directly. Apply the discovered schema to the test database.

**If services depend on event emitters, websockets, or message buses:**
- Create a mock factory (e.g., `createMockEmitter()`) that returns a spy-instrumented object matching the real interface

**If tests need fixture data (config objects, sample records, etc.):**
- Create a `__fixtures__/` directory with reusable test data
- Export named constants: `MINIMAL_CONFIG`, `DEFAULT_CONFIG`, `INVALID_CONFIGS`, etc.
- Build fixtures from the project's actual config schemas, not invented formats

### Step 6: Write Real Test Cases

Write actual, meaningful test cases for the code identified in Step 2. **Do not write stubs or placeholder tests.**

**For each testable module, write tests that cover:**

1. **Happy path** — normal inputs produce expected outputs
2. **Edge cases** — empty inputs, boundary values, null/undefined
3. **Error cases** — invalid inputs throw or return error results
4. **Constructor/initialization** — validation logic, required params

**Organize tests by module:**
- Co-locate test files next to source files: `foo.ts` → `foo.test.ts`
- Exception: integration tests spanning multiple modules go in `__tests__/` directories

**Naming convention:**
```
describe('ClassName', () => {
  describe('methodName()', () => {
    it('returns X when given Y', () => { ... });
    it('throws when given invalid input', () => { ... });
  });
});
```

**Prioritize coverage by test value:**
1. Pure logic with complex branching (highest value)
2. Services that write/read data (catches data bugs)
3. API routes (catches contract breaks)
4. Simple getters/setters (lowest value — skip if time-constrained)

### Step 7: Verify

Run the complete test suite and confirm all tests pass:

```bash
npm run test  # or equivalent
```

If any tests fail:
1. Read the failure output
2. Fix the test or the test helper (not the source code — tests should match existing behavior)
3. Re-run until all pass

Also verify the project still builds:
```bash
npm run typecheck  # if TypeScript
npm run build      # if applicable
```

### Step 8: Update orbital.config.json

Set `commands.test` so the test gate (#13 in `/test-checks`) runs automatically:

Read `.claude/orbital.config.json`, update the `commands.test` field:

```json
{
  "commands": {
    "test": "npm run test"
  }
}
```

Use the appropriate command for the project's package manager and framework.

## Notes

- This skill is framework-agnostic — the framework choice emerges from project analysis
- For projects with both frontend and backend, focus tests on backend/shared logic first (higher value per test)
- Do not add component tests (React Testing Library, etc.) unless the project specifically needs them — they require additional setup (jsdom, etc.) and are lower priority than logic tests
- Do not modify source code to make it testable — tests should work with the existing API surface
- If the project already has _some_ tests but `commands.test` is null, configure the command without rewriting existing tests
