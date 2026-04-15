/**
 * CLI command tests — subprocess-based integration tests for bin/orbital.js
 *
 * These tests invoke the real CLI binary via execFileSync and verify
 * stdout output, exit codes, and file-system side effects.
 */

import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, test, expect, beforeAll, afterAll } from 'vitest';

// ─── Constants ──────────────────────────────────────────────

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const CLI = path.join(ROOT, 'bin', 'orbital.js');

// ─── Helpers ────────────────────────────────────────────────

function runCli(
  args: string[],
  opts: { cwd?: string; home?: string } = {},
): { stdout: string; exitCode: number } {
  const home = opts.home ?? fs.mkdtempSync(path.join(os.tmpdir(), 'orbital-test-'));
  try {
    const stdout = execFileSync('node', [CLI, ...args], {
      encoding: 'utf-8',
      cwd: opts.cwd ?? ROOT,
      env: {
        ...process.env,
        HOME: home,
        USERPROFILE: home,
        CI: '1',
        NO_COLOR: '1',
        FORCE_COLOR: '0',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { stdout, exitCode: 0 };
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; status?: number };
    return {
      stdout: (e.stdout ?? '') + (e.stderr ?? ''),
      exitCode: e.status ?? 1,
    };
  }
}

/**
 * Initialize a temp project directory by calling runInit directly.
 * Returns the project dir and a dedicated HOME dir for registry isolation.
 */
function initTempProject(): { projectDir: string; homeDir: string } {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orbital-proj-'));
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orbital-home-'));

  // Initialize a git repo so detectProjectRoot works
  execFileSync('git', ['init', '-q', projectDir]);

  // Run init via the compiled module
  execFileSync('node', [
    '-e',
    `import('${ROOT}/dist/server/server/init.js').then(mod => { mod.runInit('${projectDir}', { quiet: true }); });`,
  ], {
    encoding: 'utf-8',
    env: {
      ...process.env,
      HOME: homeDir,
      USERPROFILE: homeDir,
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  return { projectDir, homeDir };
}

function runInProject(
  args: string[],
  ctx: { projectDir: string; homeDir: string },
): { stdout: string; exitCode: number } {
  return runCli(args, { cwd: ctx.projectDir, home: ctx.homeDir });
}

function readManifest(projectDir: string): Record<string, unknown> {
  const p = path.join(projectDir, '.claude', 'orbital-manifest.json');
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

function readRegistry(homeDir: string): Record<string, unknown> {
  const p = path.join(homeDir, '.orbital', 'config.json');
  if (!fs.existsSync(p)) return { projects: [] };
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

// ─── Global setup / teardown ────────────────────────────────

describe('CLI commands — bare (no project)', () => {
  let homeDir: string;

  beforeAll(() => {
    homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orbital-bare-'));
  });

  afterAll(() => {
    fs.rmSync(homeDir, { recursive: true, force: true });
  });

  test('unknown command prints error and exits 1', () => {
    const { stdout, exitCode } = runCli(['bogus-cmd'], { home: homeDir });
    expect(exitCode).toBe(1);
    expect(stdout).toContain('Unknown command');
  });

  test('--help prints usage', () => {
    const { stdout, exitCode } = runCli(['--help'], { home: homeDir });
    expect(exitCode).toBe(0);
    expect(stdout).toContain('Orbital Command');
    expect(stdout).toContain('Usage:');
  });

  test('projects with no registry shows empty message', () => {
    const { stdout, exitCode } = runCli(['projects'], { home: homeDir });
    expect(exitCode).toBe(0);
    expect(stdout).toContain('No projects registered');
  });

  test('emit exits 1 without a type argument', () => {
    const { stdout, exitCode } = runCli(['emit'], { home: homeDir });
    expect(exitCode).toBe(1);
    expect(stdout).toContain('Usage');
  });

  test('emit creates valid JSON event file', () => {
    const emitDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orbital-emit-'));
    fs.mkdirSync(path.join(emitDir, '.git'), { recursive: true });
    fs.mkdirSync(path.join(emitDir, '.claude', 'orbital-events'), { recursive: true });

    const { stdout, exitCode } = runCli(
      ['emit', 'TEST_EVENT', '{"scope":"my-scope"}'],
      { cwd: emitDir, home: homeDir },
    );
    expect(exitCode).toBe(0);
    expect(stdout).toContain('Event emitted');
    expect(stdout).toContain('TEST_EVENT');

    const eventsDir = path.join(emitDir, '.claude', 'orbital-events');
    const eventFiles = fs.readdirSync(eventsDir).filter(f => f.endsWith('.json'));
    expect(eventFiles.length).toBeGreaterThanOrEqual(1);

    const event = JSON.parse(fs.readFileSync(path.join(eventsDir, eventFiles[0]), 'utf-8'));
    expect(event).toHaveProperty('id');
    expect(event).toHaveProperty('type', 'TEST_EVENT');
    expect(event).toHaveProperty('timestamp');
    expect(event).toHaveProperty('scope', 'my-scope');
    expect(event.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);

    fs.rmSync(emitDir, { recursive: true, force: true });
  });

  test('emit with no payload creates bare event', () => {
    const emitDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orbital-emit-bare-'));
    fs.mkdirSync(path.join(emitDir, '.git'), { recursive: true });
    fs.mkdirSync(path.join(emitDir, '.claude', 'orbital-events'), { recursive: true });

    const { stdout, exitCode } = runCli(
      ['emit', 'BARE_EVENT'],
      { cwd: emitDir, home: homeDir },
    );
    expect(exitCode).toBe(0);

    const eventsDir = path.join(emitDir, '.claude', 'orbital-events');
    const eventFiles = fs.readdirSync(eventsDir).filter(f => f.endsWith('.json'));
    expect(eventFiles.length).toBeGreaterThanOrEqual(1);

    const event = JSON.parse(fs.readFileSync(path.join(eventsDir, eventFiles[0]), 'utf-8'));
    expect(event.type).toBe('BARE_EVENT');
    expect(event).toHaveProperty('id');
    expect(event).toHaveProperty('timestamp');

    fs.rmSync(emitDir, { recursive: true, force: true });
  });
});

// ─── Project-aware commands ─────────────────────────────────

describe('CLI commands — initialized project', () => {
  let ctx: { projectDir: string; homeDir: string };

  beforeAll(() => {
    ctx = initTempProject();
  });

  afterAll(() => {
    fs.rmSync(ctx.projectDir, { recursive: true, force: true });
    fs.rmSync(ctx.homeDir, { recursive: true, force: true });
  });

  // ── Validate ──────────────────────────────────────────────

  describe('validate', () => {
    test('passes on a freshly initialized project', () => {
      const { stdout, exitCode } = runInProject(['validate'], ctx);
      expect(exitCode).toBe(0);
      expect(stdout).toContain('All checks passed');
    });

    test('output mentions validation report', () => {
      const { stdout } = runInProject(['validate'], ctx);
      expect(stdout).toContain('validation report');
    });
  });

  // ── Status ────────────────────────────────────────────────

  describe('status', () => {
    test('shows synced file counts', () => {
      const { stdout, exitCode } = runInProject(['status'], ctx);
      expect(exitCode).toBe(0);
      expect(stdout).toContain('synced');
      expect(stdout).toContain('hooks');
    });

    test('shows package version', () => {
      const { stdout } = runInProject(['status'], ctx);
      expect(stdout).toMatch(/Orbital Command v\d+\.\d+\.\d+/);
    });
  });

  // ── Pin ───────────────────────────────────────────────────

  describe('pin', () => {
    test('pins a tracked template file', () => {
      const { stdout, exitCode } = runInProject(
        ['pin', 'hooks/orbital-emit.sh'],
        ctx,
      );
      expect(exitCode).toBe(0);
      expect(stdout).toContain('Pinned: hooks/orbital-emit.sh');

      // Verify manifest updated
      const manifest = readManifest(ctx.projectDir) as {
        files: Record<string, { status: string }>;
      };
      expect(manifest.files['hooks/orbital-emit.sh'].status).toBe('pinned');
    });

    test('pins with a reason', () => {
      const { stdout, exitCode } = runInProject(
        ['pin', 'hooks/scope-gate.sh', '--reason', 'custom logic'],
        ctx,
      );
      expect(exitCode).toBe(0);
      expect(stdout).toContain('Pinned: hooks/scope-gate.sh');
      expect(stdout).toContain('custom logic');

      const manifest = readManifest(ctx.projectDir) as {
        files: Record<string, { status: string; pinnedReason?: string }>;
      };
      expect(manifest.files['hooks/scope-gate.sh'].status).toBe('pinned');
      expect(manifest.files['hooks/scope-gate.sh'].pinnedReason).toBe(
        'custom logic',
      );
    });

    test('errors on non-existent file', () => {
      const { stdout, exitCode } = runInProject(
        ['pin', 'nonexistent.sh'],
        ctx,
      );
      expect(exitCode).toBe(1);
      expect(stdout).toContain('File not tracked');
    });

    test('errors when no path given', () => {
      const { stdout, exitCode } = runInProject(['pin'], ctx);
      expect(exitCode).toBe(1);
      expect(stdout).toContain('Usage');
    });
  });

  // ── Pins ──────────────────────────────────────────────────

  describe('pins', () => {
    test('lists pinned files', () => {
      const { stdout, exitCode } = runInProject(['pins'], ctx);
      expect(exitCode).toBe(0);
      expect(stdout).toContain('Pinned files');
      expect(stdout).toContain('hooks/orbital-emit.sh');
      expect(stdout).toContain('hooks/scope-gate.sh');
    });

    test('shows pin reason', () => {
      const { stdout } = runInProject(['pins'], ctx);
      expect(stdout).toContain('custom logic');
    });

    test('shows pin date', () => {
      const { stdout } = runInProject(['pins'], ctx);
      // Date format varies by locale, just check we get a date-like string
      expect(stdout).toMatch(/Pinned:/);
    });
  });

  // ── Unpin ─────────────────────────────────────────────────

  describe('unpin', () => {
    test('errors on non-pinned file', () => {
      const { stdout, exitCode } = runInProject(
        ['unpin', 'hooks/blocker-check.sh'],
        ctx,
      );
      expect(exitCode).toBe(1);
      expect(stdout).toContain('File is not pinned');
    });

    test('errors when no path given', () => {
      const { stdout, exitCode } = runInProject(['unpin'], ctx);
      expect(exitCode).toBe(1);
      expect(stdout).toContain('Usage');
    });
  });

  // ── Diff ──────────────────────────────────────────────────

  describe('diff', () => {
    test('shows no diff for unmodified file', () => {
      const { stdout, exitCode } = runInProject(
        ['diff', 'hooks/blocker-check.sh'],
        ctx,
      );
      // git diff --no-index returns 0 when files are identical (no output)
      expect(exitCode).toBe(0);
      expect(stdout.trim()).toBe('');
    });

    test('shows diff for modified file', () => {
      const hookPath = path.join(
        ctx.projectDir,
        '.claude',
        'hooks',
        'blocker-check.sh',
      );
      const original = fs.readFileSync(hookPath, 'utf-8');
      fs.appendFileSync(hookPath, '\n# test modification\n');

      const { stdout, exitCode } = runInProject(
        ['diff', 'hooks/blocker-check.sh'],
        ctx,
      );
      // git diff --no-index exits 1 when files differ, but command catches it
      expect(exitCode).toBe(0);
      expect(stdout).toContain('test modification');

      // Restore for other tests
      fs.writeFileSync(hookPath, original);
    });

    test('errors on non-template file', () => {
      const { stdout, exitCode } = runInProject(['diff', 'bogus.txt'], ctx);
      expect(exitCode).toBe(1);
      expect(stdout).toContain('Not a template file');
    });

    test('errors when no path given', () => {
      const { stdout, exitCode } = runInProject(['diff'], ctx);
      expect(exitCode).toBe(1);
      expect(stdout).toContain('Usage');
    });
  });

  // ── Reset ─────────────────────────────────────────────────

  describe('reset', () => {
    test('resets a modified file to template version', () => {
      const hookPath = path.join(
        ctx.projectDir,
        '.claude',
        'hooks',
        'blocker-check.sh',
      );
      const originalContent = fs.readFileSync(hookPath, 'utf-8');

      // Modify the file
      fs.appendFileSync(hookPath, '\n# modification to reset\n');
      expect(fs.readFileSync(hookPath, 'utf-8')).toContain(
        'modification to reset',
      );

      const { stdout, exitCode } = runInProject(
        ['reset', 'hooks/blocker-check.sh'],
        ctx,
      );
      expect(exitCode).toBe(0);
      expect(stdout).toContain('Reset: hooks/blocker-check.sh');
      expect(stdout).toContain('synced with template');

      // Verify file content restored
      const restored = fs.readFileSync(hookPath, 'utf-8');
      expect(restored).toBe(originalContent);

      // Verify manifest updated
      const manifest = readManifest(ctx.projectDir) as {
        files: Record<string, { status: string }>;
      };
      expect(manifest.files['hooks/blocker-check.sh'].status).toBe('synced');
    });

    test('errors on non-template file', () => {
      const { stdout, exitCode } = runInProject(['reset', 'bogus.txt'], ctx);
      expect(exitCode).toBe(1);
      expect(stdout).toContain('Not a template file');
    });

    test('errors when no path given', () => {
      const { stdout, exitCode } = runInProject(['reset'], ctx);
      expect(exitCode).toBe(1);
      expect(stdout).toContain('Usage');
    });
  });
});

// ─── Registry commands ──────────────────────────────────────

describe('CLI commands — registry', () => {
  let ctx: { projectDir: string; homeDir: string };

  beforeAll(() => {
    ctx = initTempProject();
  });

  afterAll(() => {
    fs.rmSync(ctx.projectDir, { recursive: true, force: true });
    fs.rmSync(ctx.homeDir, { recursive: true, force: true });
  });

  describe('register', () => {
    test('registers a project directory', () => {
      const { stdout, exitCode } = runInProject(
        ['register', ctx.projectDir],
        ctx,
      );
      expect(exitCode).toBe(0);
      expect(stdout).toContain('Registered project');
      expect(stdout).toContain(ctx.projectDir);

      const reg = readRegistry(ctx.homeDir) as {
        projects: Array<{ path: string; enabled: boolean }>;
      };
      expect(reg.projects.length).toBe(1);
      expect(reg.projects[0].path).toBe(ctx.projectDir);
      expect(reg.projects[0].enabled).toBe(true);
    });

    test('shows ID and color on registration', () => {
      // Already registered from above, create a second project for this test
      const ctx2 = initTempProject();
      // Use same homeDir to share registry
      const { stdout, exitCode } = runCli(
        ['register', ctx2.projectDir],
        { cwd: ctx2.projectDir, home: ctx.homeDir },
      );
      expect(exitCode).toBe(0);
      expect(stdout).toContain('ID:');
      expect(stdout).toContain('Color:');

      // Unregister from shared registry before cleanup
      runCli(
        ['unregister', ctx2.projectDir],
        { cwd: ctx2.projectDir, home: ctx.homeDir },
      );

      // Clean up second project
      fs.rmSync(ctx2.projectDir, { recursive: true, force: true });
      fs.rmSync(ctx2.homeDir, { recursive: true, force: true });
    });

    test('duplicate registration is idempotent', () => {
      const { stdout, exitCode } = runInProject(
        ['register', ctx.projectDir],
        ctx,
      );
      expect(exitCode).toBe(0);
      expect(stdout).toContain('already registered');

      const reg = readRegistry(ctx.homeDir) as {
        projects: Array<{ path: string }>;
      };
      // Should still be just the 1 from this test suite (2nd project was cleaned up)
      const count = reg.projects.filter(
        (p) => p.path === ctx.projectDir,
      ).length;
      expect(count).toBe(1);
    });
  });

  describe('projects', () => {
    test('lists registered projects', () => {
      const { stdout, exitCode } = runInProject(['projects'], ctx);
      expect(exitCode).toBe(0);
      expect(stdout).toContain('ID');
      expect(stdout).toContain('NAME');
      expect(stdout).toContain('STATUS');
      expect(stdout).toContain('PATH');
      expect(stdout).toContain(ctx.projectDir);
    });

    test('shows active status for existing project', () => {
      const { stdout } = runInProject(['projects'], ctx);
      expect(stdout).toContain('active');
    });
  });

  describe('unregister', () => {
    test('removes a registered project by path', () => {
      const { stdout, exitCode } = runInProject(
        ['unregister', ctx.projectDir],
        ctx,
      );
      expect(exitCode).toBe(0);
      expect(stdout).toContain('Unregistered project');
      expect(stdout).toContain('preserved');

      const reg = readRegistry(ctx.homeDir) as {
        projects: Array<{ path: string }>;
      };
      const found = reg.projects.find((p) => p.path === ctx.projectDir);
      expect(found).toBeUndefined();
    });

    test('errors on non-existent project', () => {
      const { stdout, exitCode } = runInProject(
        ['unregister', '/no/such/project'],
        ctx,
      );
      expect(exitCode).toBe(1);
      expect(stdout).toContain('Project not found');
    });

    test('errors when no argument given', () => {
      const { stdout, exitCode } = runInProject(['unregister'], ctx);
      expect(exitCode).toBe(1);
      expect(stdout).toContain('Usage');
    });
  });

  describe('projects after unregister', () => {
    test('shows empty state after all projects removed', () => {
      const { stdout, exitCode } = runInProject(['projects'], ctx);
      expect(exitCode).toBe(0);
      expect(stdout).toContain('No projects registered');
    });
  });
});

// ─── Update / Uninstall dry-run commands ────────────────────

describe('CLI commands — update and uninstall', () => {
  let ctx: { projectDir: string; homeDir: string };

  beforeAll(() => {
    ctx = initTempProject();
  });

  afterAll(() => {
    fs.rmSync(ctx.projectDir, { recursive: true, force: true });
    fs.rmSync(ctx.homeDir, { recursive: true, force: true });
  });

  describe('update --dry-run', () => {
    test('runs without modifying files', () => {
      // Snapshot the manifest before
      const manifestBefore = fs.readFileSync(
        path.join(ctx.projectDir, '.claude', 'orbital-manifest.json'),
        'utf-8',
      );

      const { stdout, exitCode } = runInProject(
        ['update', '--dry-run'],
        ctx,
      );
      expect(exitCode).toBe(0);
      expect(stdout).toContain('dry run');

      // Manifest should not be modified
      const manifestAfter = fs.readFileSync(
        path.join(ctx.projectDir, '.claude', 'orbital-manifest.json'),
        'utf-8',
      );
      expect(manifestAfter).toBe(manifestBefore);
    });

    test('reports no changes on fresh install', () => {
      const { stdout } = runInProject(['update', '--dry-run'], ctx);
      expect(stdout).toContain('up to date');
    });

    test('includes version info in output', () => {
      const { stdout } = runInProject(['update', '--dry-run'], ctx);
      expect(stdout).toContain('Orbital Command');
      expect(stdout).toContain('update');
    });
  });

  describe('uninstall --dry-run', () => {
    test('runs without removing files', () => {
      // Count files before
      const claudeDir = path.join(ctx.projectDir, '.claude');
      const hooksBefore = fs.readdirSync(path.join(claudeDir, 'hooks'));

      const { stdout, exitCode } = runInProject(
        ['uninstall', '--dry-run'],
        ctx,
      );
      expect(exitCode).toBe(0);
      expect(stdout).toContain('dry run');

      // Files should still be present
      const hooksAfter = fs.readdirSync(path.join(claudeDir, 'hooks'));
      expect(hooksAfter.length).toBe(hooksBefore.length);
    });

    test('lists files that would be removed', () => {
      const { stdout } = runInProject(['uninstall', '--dry-run'], ctx);
      expect(stdout).toContain('REMOVE');
      // Should list at least some hook files
      expect(stdout).toContain('hooks/');
    });

    test('mentions no changes were made', () => {
      const { stdout } = runInProject(['uninstall', '--dry-run'], ctx);
      expect(stdout).toContain('No changes made');
    });
  });
});

// ─── Pin → Diff → Reset flow ───────────────────────────────

describe('CLI commands — pin/diff/reset workflow', () => {
  let ctx: { projectDir: string; homeDir: string };

  beforeAll(() => {
    ctx = initTempProject();
  });

  afterAll(() => {
    fs.rmSync(ctx.projectDir, { recursive: true, force: true });
    fs.rmSync(ctx.homeDir, { recursive: true, force: true });
  });

  test('full pin → modify → diff → reset cycle', () => {
    const file = 'hooks/dependency-check.sh';
    const filePath = path.join(ctx.projectDir, '.claude', file);
    const original = fs.readFileSync(filePath, 'utf-8');

    // 1. Pin the file
    const pin = runInProject(['pin', file], ctx);
    expect(pin.exitCode).toBe(0);
    expect(pin.stdout).toContain('Pinned');

    // 2. Modify the file
    fs.appendFileSync(filePath, '\n# workflow test edit\n');

    // 3. Diff should show the change
    const diff = runInProject(['diff', file], ctx);
    expect(diff.exitCode).toBe(0);
    expect(diff.stdout).toContain('workflow test edit');

    // 4. Reset restores to template
    const reset = runInProject(['reset', file], ctx);
    expect(reset.exitCode).toBe(0);
    expect(reset.stdout).toContain('synced with template');

    const restored = fs.readFileSync(filePath, 'utf-8');
    expect(restored).toBe(original);

    // 5. Manifest shows synced
    const manifest = readManifest(ctx.projectDir) as {
      files: Record<string, { status: string }>;
    };
    expect(manifest.files[file].status).toBe('synced');
  });

  test('pins list shows no pinned after reset clears pin', () => {
    // After the reset above, pins should be empty (reset clears pin status)
    const { stdout, exitCode } = runInProject(['pins'], ctx);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('No pinned files');
  });
});

// ─── Register → Projects → Unregister flow ─────────────────

describe('CLI commands — registry workflow', () => {
  let ctx: { projectDir: string; homeDir: string };

  beforeAll(() => {
    ctx = initTempProject();
  });

  afterAll(() => {
    fs.rmSync(ctx.projectDir, { recursive: true, force: true });
    fs.rmSync(ctx.homeDir, { recursive: true, force: true });
  });

  test('full register → list → unregister cycle', () => {
    // 1. Empty state
    const empty = runInProject(['projects'], ctx);
    expect(empty.stdout).toContain('No projects registered');

    // 2. Register
    const reg = runInProject(['register', ctx.projectDir], ctx);
    expect(reg.exitCode).toBe(0);
    expect(reg.stdout).toContain('Registered');

    // 3. List shows the project
    const list = runInProject(['projects'], ctx);
    expect(list.stdout).toContain(ctx.projectDir);
    expect(list.stdout).toContain('active');

    // 4. Duplicate is idempotent
    const dup = runInProject(['register', ctx.projectDir], ctx);
    expect(dup.exitCode).toBe(0);
    expect(dup.stdout).toContain('already registered');

    // 5. Unregister
    const unreg = runInProject(['unregister', ctx.projectDir], ctx);
    expect(unreg.exitCode).toBe(0);

    // 6. Empty again
    const emptyAgain = runInProject(['projects'], ctx);
    expect(emptyAgain.stdout).toContain('No projects registered');
  });
});
