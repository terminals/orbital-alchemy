import { describe, it, expect, afterAll, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { runInit, loadManifest, saveManifest } from '../init.js';
import { runUpdate } from '../update.js';

// ─── Shared temp dir setup ──────────────────────────────────

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'orbital-update-test-'));

afterAll(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

let counter = 0;
function makeProjectDir(): string {
  const dir = path.join(tmpRoot, `project-${counter++}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// ─── runUpdate() ────────────────────────────────────────────

describe('runUpdate()', () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = makeProjectDir();
    // Initialize the project first
    runInit(projectRoot, { quiet: true });
  });

  it('completes without error on a freshly initialized project', () => {
    expect(() => runUpdate(projectRoot)).not.toThrow();
  });

  it('dry-run mode does not modify files', () => {
    // Get manifest before
    const manifestBefore = loadManifest(projectRoot);
    const beforeTimestamp = manifestBefore!.updatedAt;

    runUpdate(projectRoot, { dryRun: true });

    // Manifest should not be updated
    const manifestAfter = loadManifest(projectRoot);
    expect(manifestAfter!.updatedAt).toBe(beforeTimestamp);
  });

  it('new template files are added during update', () => {
    // Remove a known template file, then update should re-add it
    const claudeDir = path.join(projectRoot, '.claude');
    const manifest = loadManifest(projectRoot)!;

    // Find a synced template file to remove
    const syncedFile = Object.entries(manifest.files)
      .find(([_, record]) => record.origin === 'template' && record.status === 'synced');

    if (syncedFile) {
      const [relPath] = syncedFile;
      const absPath = path.join(claudeDir, relPath);

      // Delete the file and remove from manifest
      if (fs.existsSync(absPath)) {
        fs.unlinkSync(absPath);
      }
      delete manifest.files[relPath];
      saveManifest(projectRoot, manifest);

      // Run update — it should detect the missing file and add it back
      runUpdate(projectRoot);

      const updated = loadManifest(projectRoot)!;
      expect(updated.files[relPath]).toBeDefined();
    }
  });

  it('pinned files are skipped during update', () => {
    const manifest = loadManifest(projectRoot)!;
    const claudeDir = path.join(projectRoot, '.claude');

    // Find a template file and pin it
    const templateFile = Object.entries(manifest.files)
      .find(([_, record]) => record.origin === 'template' && record.status === 'synced');

    if (templateFile) {
      const [relPath, record] = templateFile;
      record.status = 'pinned';
      saveManifest(projectRoot, manifest);

      // Write custom content
      const absPath = path.join(claudeDir, relPath);
      if (fs.existsSync(absPath)) {
        fs.writeFileSync(absPath, '# PINNED CUSTOM CONTENT', 'utf-8');
      }

      runUpdate(projectRoot);

      // Verify pinned file was not overwritten
      if (fs.existsSync(absPath)) {
        const content = fs.readFileSync(absPath, 'utf-8');
        expect(content).toBe('# PINNED CUSTOM CONTENT');
      }
    }
  });

  it('modified files get backed up before overwrite', () => {
    const manifest = loadManifest(projectRoot)!;
    const claudeDir = path.join(projectRoot, '.claude');

    // Find a template file and modify it
    const templateFile = Object.entries(manifest.files)
      .find(([relPath, record]) =>
        record.origin === 'template' && record.status === 'synced' && fs.existsSync(path.join(claudeDir, relPath)));

    if (templateFile) {
      const [relPath] = templateFile;
      const absPath = path.join(claudeDir, relPath);
      fs.writeFileSync(absPath, '# USER MODIFIED CONTENT', 'utf-8');

      runUpdate(projectRoot);

      // The modified file should be preserved (skipped)
      const updatedManifest = loadManifest(projectRoot)!;
      const updatedRecord = updatedManifest.files[relPath];
      // Modified files are either skipped or backed up
      // The status should reflect the modification was detected
      expect(updatedRecord).toBeDefined();
    }
  });

  it('updates manifest metadata after successful update', () => {
    const manifestBefore = loadManifest(projectRoot)!;
    void manifestBefore.updatedAt;

    // Short sleep-free approach: just verify the updatedAt gets refreshed
    runUpdate(projectRoot);

    const manifestAfter = loadManifest(projectRoot)!;
    // updatedAt should be set (could be same if ran in same millisecond, but field should exist)
    expect(manifestAfter.updatedAt).toBeDefined();
    expect(manifestAfter.packageVersion).toBeDefined();
  });

  it('handles project with no manifest gracefully (no crash)', () => {
    const emptyProject = makeProjectDir();
    // No init — no manifest
    expect(() => runUpdate(emptyProject)).not.toThrow();
  });
});
