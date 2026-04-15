import { describe, it, expect, afterAll, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { runInit, loadManifest, saveManifest } from '../init.js';
import { runUninstall } from '../uninstall.js';

// ─── Shared temp dir setup ──────────────────────────────────

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'orbital-uninstall-test-'));

afterAll(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

let counter = 0;
function makeProjectDir(): string {
  const dir = path.join(tmpRoot, `project-${counter++}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// ─── runUninstall() ──────────────────────────────────────────

describe('runUninstall()', () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = makeProjectDir();
    runInit(projectRoot, { quiet: true });
  });

  it('dry-run mode does not remove files', () => {
    const claudeDir = path.join(projectRoot, '.claude');
    const hooksBefore = fs.existsSync(path.join(claudeDir, 'hooks'));

    runUninstall(projectRoot, { dryRun: true });

    // Files should still exist
    expect(fs.existsSync(path.join(claudeDir, 'hooks'))).toBe(hooksBefore);
    // Manifest should still exist
    expect(loadManifest(projectRoot)).not.toBeNull();
  });

  it('removes template-owned synced files', () => {
    const claudeDir = path.join(projectRoot, '.claude');
    const manifest = loadManifest(projectRoot)!;

    // Find a synced template file
    const syncedFiles = Object.entries(manifest.files)
      .filter(([_, record]) => record.origin === 'template' && record.status === 'synced')
      .map(([relPath]) => relPath);

    expect(syncedFiles.length).toBeGreaterThan(0);

    runUninstall(projectRoot);

    // Synced template files should be removed
    for (const relPath of syncedFiles.slice(0, 3)) {
      const absPath = path.join(claudeDir, relPath);
      expect(fs.existsSync(absPath)).toBe(false);
    }
  });

  it('preserves user-modified files', () => {
    const claudeDir = path.join(projectRoot, '.claude');
    const manifest = loadManifest(projectRoot)!;

    // Find a template file and mark it as modified
    const templateFile = Object.entries(manifest.files)
      .find(([relPath, record]) =>
        record.origin === 'template' && record.status === 'synced' && fs.existsSync(path.join(claudeDir, relPath)));

    if (templateFile) {
      const [relPath, record] = templateFile;
      record.status = 'modified';
      saveManifest(projectRoot, manifest);

      runUninstall(projectRoot);

      // Modified file should be preserved
      expect(fs.existsSync(path.join(claudeDir, relPath))).toBe(true);
    }
  });

  it('removes manifest after uninstall', () => {
    runUninstall(projectRoot);
    expect(loadManifest(projectRoot)).toBeNull();
  });

  it('--keep-config preserves orbital.config.json', () => {
    const configPath = path.join(projectRoot, '.claude', 'orbital.config.json');
    expect(fs.existsSync(configPath)).toBe(true);

    runUninstall(projectRoot, { keepConfig: true });

    // Config should still exist
    expect(fs.existsSync(configPath)).toBe(true);
    // But manifest should be removed
    expect(loadManifest(projectRoot)).toBeNull();
  });

  it('handles project with no manifest (legacy uninstall)', () => {
    // Remove the manifest
    const manifestPath = path.join(projectRoot, '.claude', 'orbital-manifest.json');
    if (fs.existsSync(manifestPath)) {
      fs.unlinkSync(manifestPath);
    }

    // Should not crash
    expect(() => runUninstall(projectRoot)).not.toThrow();
  });

  it('cleans up empty directories', () => {
    const claudeDir = path.join(projectRoot, '.claude');
    // Create an empty subdirectory in hooks
    const emptyDir = path.join(claudeDir, 'hooks', 'empty-test-dir');
    fs.mkdirSync(emptyDir, { recursive: true });

    runUninstall(projectRoot);

    // Empty dir should be cleaned up
    expect(fs.existsSync(emptyDir)).toBe(false);
  });

  it('removes settings hooks', () => {
    const settingsPath = path.join(projectRoot, '.claude', 'settings.local.json');
    expect(fs.existsSync(settingsPath)).toBe(true);

    // Verify it has hooks before
    const before = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    expect(before.hooks).toBeDefined();

    runUninstall(projectRoot);

    // If settings file still exists, hooks should be cleaned
    if (fs.existsSync(settingsPath)) {
      const after = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      // Orbital hooks should be removed
      const hookEvents = Object.values(after.hooks || {});
      const orbitalHooks = hookEvents.flat().filter(
        (g: unknown) => Array.isArray((g as Record<string, unknown>).hooks) &&
          ((g as Record<string, unknown[]>).hooks).some((h: unknown) => (h as Record<string, boolean>)._orbital),
      );
      expect(orbitalHooks.length).toBe(0);
    }
  });
});
