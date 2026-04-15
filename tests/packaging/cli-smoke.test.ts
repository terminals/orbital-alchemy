import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync, ExecFileSyncOptions } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';

const ROOT = path.resolve(import.meta.dirname, '../..');
const CLI = path.join(ROOT, 'bin/orbital.js');

// Use a temp HOME to avoid touching real ~/.orbital/
let tmpHome: string;

beforeAll(() => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'orbital-smoke-'));
});

afterAll(() => {
  fs.rmSync(tmpHome, { recursive: true, force: true });
});

function runCli(args: string[], opts: Partial<ExecFileSyncOptions> = {}): { stdout: string; exitCode: number } {
  try {
    const stdout = execFileSync('node', [CLI, ...args], {
      encoding: 'utf8',
      timeout: 15_000,
      cwd: tmpHome,
      env: {
        ...process.env,
        CI: '1',
        HOME: tmpHome,
        USERPROFILE: tmpHome,
        // Prevent color codes from polluting assertions
        NO_COLOR: '1',
        FORCE_COLOR: '0',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
      ...opts,
    });
    return { stdout, exitCode: 0 };
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; status?: number };
    return {
      stdout: (e.stdout || '') + (e.stderr || ''),
      exitCode: e.status ?? 1,
    };
  }
}

// ---------------------------------------------------------------------------
// Help output
// ---------------------------------------------------------------------------

describe('help commands', () => {
  it('orbital --help exits 0 with usage info', () => {
    const { stdout, exitCode } = runCli(['--help']);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('Usage:');
    expect(stdout).toContain('Commands:');
  });

  it('orbital help exits 0 with usage info', () => {
    const { stdout, exitCode } = runCli(['help']);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('Usage:');
  });
});

// ---------------------------------------------------------------------------
// Unknown command
// ---------------------------------------------------------------------------

describe('unknown command', () => {
  it('orbital unknown-command exits non-zero', () => {
    const { stdout, exitCode } = runCli(['unknown-command']);
    expect(exitCode).not.toBe(0);
    expect(stdout).toContain('Unknown command');
  });
});

// ---------------------------------------------------------------------------
// Postinstall script
// ---------------------------------------------------------------------------

describe('postinstall', () => {
  it('scripts/postinstall.js exits 0 with banner', () => {
    const postinstall = path.join(ROOT, 'scripts/postinstall.js');
    const stdout = execFileSync('node', [postinstall], {
      encoding: 'utf8',
      timeout: 10_000,
      env: { ...process.env, HOME: tmpHome, USERPROFILE: tmpHome },
    });
    expect(stdout).toContain('Orbital Command installed');
  });
});

// ---------------------------------------------------------------------------
// Commands that exercise module loading
// ---------------------------------------------------------------------------

describe('module loading smoke tests', () => {
  it('orbital status runs without crashing (exercises loadSharedModule)', () => {
    // status in a non-project dir should exit cleanly
    const { exitCode } = runCli(['status']);
    // May exit 0 or 1 depending on whether a manifest exists, but should not crash
    expect(exitCode).toBeLessThanOrEqual(1);
  });

  it('orbital doctor runs without crashing (exercises loadWizardModule)', () => {
    const { exitCode } = runCli(['doctor']);
    // doctor may warn about missing config but should not crash
    expect(exitCode).toBeLessThanOrEqual(1);
  });
});
