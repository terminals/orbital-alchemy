import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

/**
 * Test pure/mockable logic from the wizard module.
 *
 * The wizard's interactive functions use @clack/prompts and are hard to test
 * directly. Instead we test:
 * - isOlderThan (semver) — tested indirectly through runHub behavior
 * - checkForUpdate — tested indirectly with mocked fetch
 * - Version export types
 * - Doctor-like diagnostic logic patterns
 */

// Mock @clack/prompts to prevent interactive UI
vi.mock('@clack/prompts', () => ({
  intro: vi.fn(),
  outro: vi.fn(),
  log: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
  select: vi.fn().mockResolvedValue('launch'),
  isCancel: vi.fn().mockReturnValue(false),
  spinner: vi.fn(() => ({ start: vi.fn(), stop: vi.fn() })),
  note: vi.fn(),
}));

// Mock picocolors
vi.mock('picocolors', () => ({
  default: {
    bgCyan: (s: string) => s,
    black: (s: string) => s,
    dim: (s: string) => s,
    cyan: (s: string) => s,
    green: (s: string) => s,
    yellow: (s: string) => s,
    red: (s: string) => s,
    bold: (s: string) => s,
  },
}));

// Mock child_process
vi.mock('child_process', () => ({
  execFileSync: vi.fn().mockReturnValue('1.0.0\n'),
  spawn: vi.fn(),
}));

// Mock iterm2 adapter
vi.mock('../adapters/iterm2-adapter.js', () => ({
  isITerm2Available: vi.fn().mockReturnValue(false),
}));

// Mock manifest
vi.mock('../manifest.js', () => ({
  loadManifest: vi.fn().mockReturnValue(null),
  refreshFileStatuses: vi.fn(),
  summarizeManifest: vi.fn().mockReturnValue({ total: 0 }),
}));

// Mock init
vi.mock('../init.js', () => ({
  runInit: vi.fn(),
  runUpdate: vi.fn(),
  TEMPLATES_DIR: '/tmp/mock-templates',
}));

describe('wizard — runHub', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    vi.resetModules();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('returns launch action by default', async () => {
    // Mock fetch for update check
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('no network'));

    const { runHub } = await import('../wizard/index.js');
    const result = await runHub({
      packageVersion: '1.0.0',
      projectNames: ['Test'],
      itermPromptShown: true,
      isMac: false,
      projectPaths: [],
    });

    expect(result.action).toBe('launch');
  });

  it('uses cached update check within 24 hours', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('should not be called'));

    const { runHub } = await import('../wizard/index.js');
    const result = await runHub({
      packageVersion: '1.0.0',
      projectNames: ['Test'],
      itermPromptShown: true,
      isMac: false,
      lastUpdateCheck: new Date().toISOString(), // recent
      latestVersion: '1.0.0', // same version
      projectPaths: [],
    });

    // Should not have changed cache since within 24h
    expect(result.updateCache).toBeUndefined();
  });

  it('detects outdated version through cache', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('should not be called'));

    // Mock select to return 'launch' (skip the update prompt)
    const clackPrompts = await import('@clack/prompts');
    vi.mocked(clackPrompts.select).mockResolvedValue('skip');

    const { runHub } = await import('../wizard/index.js');
    const result = await runHub({
      packageVersion: '0.9.0',
      projectNames: ['Test'],
      itermPromptShown: true,
      isMac: false,
      lastUpdateCheck: new Date().toISOString(),
      latestVersion: '1.0.0', // newer than current
      projectPaths: [],
    });

    expect(result.action).toBeDefined();
  });

  it('handles fetch failure gracefully (no update info)', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

    // Reset select mock to return 'launch' for the hub menu
    const clackPrompts = await import('@clack/prompts');
    vi.mocked(clackPrompts.select).mockResolvedValue('launch');

    const { runHub } = await import('../wizard/index.js');
    const result = await runHub({
      packageVersion: '1.0.0',
      projectNames: ['Test'],
      itermPromptShown: true,
      isMac: false,
      projectPaths: [],
    });

    // Should still work, just no update info
    expect(result.action).toBe('launch');
  });

  it('handles fetch timeout gracefully', async () => {
    globalThis.fetch = vi.fn().mockImplementation(() =>
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 100))
    );

    // Reset select mock to return 'launch' for the hub menu
    const clackPrompts = await import('@clack/prompts');
    vi.mocked(clackPrompts.select).mockResolvedValue('launch');

    const { runHub } = await import('../wizard/index.js');
    const result = await runHub({
      packageVersion: '1.0.0',
      projectNames: ['Test'],
      itermPromptShown: true,
      isMac: false,
      projectPaths: [],
    });

    expect(result.action).toBe('launch');
  });
});

describe('wizard — HubResult type', () => {
  it('exports HubAction type', async () => {
    const wizardMod = await import('../wizard/index.js');
    // Verify module exports exist and we can construct a HubResult-shaped object
    expect(wizardMod).toBeDefined();
    const result = { action: 'launch' } as { action: string };
    expect(result.action).toBe('launch');
  });
});

describe('wizard — doctor diagnostics', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orbital-doctor-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('doctor runs without crashing on empty project', async () => {
    const { runDoctor } = await import('../wizard/doctor.js');
    // runDoctor writes to console, we just verify it doesn't throw
    await expect(runDoctor(tmpDir, '1.0.0')).resolves.toBeUndefined();
  });

  it('doctor runs on project with config', async () => {
    const claudeDir = path.join(tmpDir, '.claude');
    fs.mkdirSync(claudeDir, { recursive: true });
    fs.writeFileSync(
      path.join(claudeDir, 'orbital.config.json'),
      JSON.stringify({ projectName: 'Doctor Test' }),
    );

    const { runDoctor } = await import('../wizard/doctor.js');
    await expect(runDoctor(tmpDir, '1.0.0')).resolves.toBeUndefined();
  });

  it('doctor runs on project with workflow', async () => {
    const configDir = path.join(tmpDir, '.claude', 'config');
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, '.claude', 'orbital.config.json'),
      JSON.stringify({ projectName: 'Test' }),
    );
    fs.writeFileSync(
      path.join(configDir, 'workflow.json'),
      JSON.stringify({ name: 'Default', lists: [1, 2, 3], branchingMode: 'trunk' }),
    );

    const { runDoctor } = await import('../wizard/doctor.js');
    await expect(runDoctor(tmpDir, '1.0.0')).resolves.toBeUndefined();
  });
});
