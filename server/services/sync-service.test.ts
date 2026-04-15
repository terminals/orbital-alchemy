import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

// We need to mock global-config and manifest before importing SyncService
let mockGlobalPrimitivesDir: string;
let mockGlobalWorkflowPath: string;
let registeredProjects: Array<{ id: string; path: string; name: string; enabled: boolean }>;

vi.mock('../global-config.js', () => ({
  get GLOBAL_PRIMITIVES_DIR() { return mockGlobalPrimitivesDir; },
  get GLOBAL_WORKFLOW_PATH() { return mockGlobalWorkflowPath; },
  getRegisteredProjects: () => registeredProjects,
}));

vi.mock('../utils/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import { SyncService } from './sync-service.js';

describe('SyncService', () => {
  let tmpDir: string;
  let globalDir: string;
  let globalWorkflowPath: string;
  let projectA: string;
  let projectB: string;
  let service: SyncService;

  function writeFile(filePath: string, content: string): void {
    const dir = path.dirname(filePath);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, content, 'utf-8');
  }

  function writeManifest(projectRoot: string, manifest: Record<string, unknown>): void {
    const mp = path.join(projectRoot, '.claude', 'orbital-sync.json');
    fs.mkdirSync(path.dirname(mp), { recursive: true });
    fs.writeFileSync(mp, JSON.stringify(manifest), 'utf-8');
  }

  function readManifest(projectRoot: string): Record<string, unknown> {
    const mp = path.join(projectRoot, '.claude', 'orbital-sync.json');
    return JSON.parse(fs.readFileSync(mp, 'utf-8'));
  }

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-svc-test-'));
    globalDir = path.join(tmpDir, 'global-primitives');
    globalWorkflowPath = path.join(tmpDir, 'global-workflow.json');
    projectA = path.join(tmpDir, 'project-a');
    projectB = path.join(tmpDir, 'project-b');

    fs.mkdirSync(globalDir, { recursive: true });
    fs.mkdirSync(path.join(projectA, '.claude'), { recursive: true });
    fs.mkdirSync(path.join(projectB, '.claude'), { recursive: true });

    mockGlobalPrimitivesDir = globalDir;
    mockGlobalWorkflowPath = globalWorkflowPath;
    registeredProjects = [
      { id: 'proj-a', path: projectA, name: 'Project A', enabled: true },
      { id: 'proj-b', path: projectB, name: 'Project B', enabled: true },
    ];

    service = new SyncService();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ─── computeSyncState() ─────────────────────────────────────

  describe('computeSyncState()', () => {
    it('creates an initial manifest when none exists', () => {
      // Create a global file
      writeFile(path.join(globalDir, 'hooks', 'pre-push.sh'), '#!/bin/bash\necho hello');

      const report = service.computeSyncState('proj-a', projectA);

      expect(report.projectId).toBe('proj-a');
      expect(report.files.length).toBeGreaterThanOrEqual(1);
      // The file should have been copied locally
      const localFile = path.join(projectA, '.claude', 'hooks', 'pre-push.sh');
      expect(fs.existsSync(localFile)).toBe(true);
    });

    it('detects synced files correctly', () => {
      const content = '#!/bin/bash\necho synced';
      writeFile(path.join(globalDir, 'hooks', 'test.sh'), content);
      writeFile(path.join(projectA, '.claude', 'hooks', 'test.sh'), content);

      // Create manifest with matching hashes
      const report = service.computeSyncState('proj-a', projectA);
      const fileStatus = report.files.find(f => f.relativePath === 'hooks/test.sh');
      expect(fileStatus).toBeDefined();
      expect(fileStatus!.state).toBe('synced');
    });

    it('detects override files', () => {
      const globalContent = 'global content';
      const localContent = 'local override';
      writeFile(path.join(globalDir, 'hooks', 'hook.sh'), globalContent);
      writeFile(path.join(projectA, '.claude', 'hooks', 'hook.sh'), localContent);

      // First call creates manifest which detects the difference as override
      const report = service.computeSyncState('proj-a', projectA);
      const fileStatus = report.files.find(f => f.relativePath === 'hooks/hook.sh');
      expect(fileStatus).toBeDefined();
      expect(fileStatus!.state).toBe('override');
    });

    it('detects absent files (global file not in manifest)', () => {
      // Create initial manifest with no files
      writeManifest(projectA, { version: 1, files: {}, workflow: { mode: 'synced', globalHash: '', localHash: '', syncedAt: '' }, newFilesPolicy: 'auto-sync' });

      // Add a global file that the project doesn't have
      writeFile(path.join(globalDir, 'agents', 'new-agent.md'), '# New Agent');

      const report = service.computeSyncState('proj-a', projectA);
      const newFile = report.files.find(f => f.relativePath === 'agents/new-agent.md');
      expect(newFile).toBeDefined();
      expect(newFile!.state).toBe('absent');
    });

    it('detects drifted files (local changed since last sync)', () => {
      const content = 'original content';
      writeFile(path.join(globalDir, 'hooks', 'test.sh'), content);
      writeFile(path.join(projectA, '.claude', 'hooks', 'test.sh'), content);

      // Create manifest that matches the original
      service.computeSyncState('proj-a', projectA);

      // Now modify the local file
      writeFile(path.join(projectA, '.claude', 'hooks', 'test.sh'), 'modified locally');

      const report = service.computeSyncState('proj-a', projectA);
      const fileStatus = report.files.find(f => f.relativePath === 'hooks/test.sh');
      expect(fileStatus).toBeDefined();
      expect(fileStatus!.state).toBe('drifted');
    });
  });

  // ─── propagateGlobalChange() ────────────────────────────────

  describe('propagateGlobalChange()', () => {
    it('copies updated global file to synced projects', () => {
      const originalContent = 'original';
      const updatedContent = 'updated version';

      writeFile(path.join(globalDir, 'hooks', 'hook.sh'), originalContent);
      writeFile(path.join(projectA, '.claude', 'hooks', 'hook.sh'), originalContent);
      writeFile(path.join(projectB, '.claude', 'hooks', 'hook.sh'), originalContent);

      // Set up manifests for both projects as synced
      service.computeSyncState('proj-a', projectA);
      service.computeSyncState('proj-b', projectB);

      // Update the global file
      writeFile(path.join(globalDir, 'hooks', 'hook.sh'), updatedContent);

      const result = service.propagateGlobalChange('hooks/hook.sh');

      expect(result.updated).toContain('proj-a');
      expect(result.updated).toContain('proj-b');

      // Both projects should have the updated content
      expect(fs.readFileSync(path.join(projectA, '.claude', 'hooks', 'hook.sh'), 'utf-8')).toBe(updatedContent);
      expect(fs.readFileSync(path.join(projectB, '.claude', 'hooks', 'hook.sh'), 'utf-8')).toBe(updatedContent);
    });

    it('skips projects with overrides', () => {
      writeFile(path.join(globalDir, 'hooks', 'hook.sh'), 'global');
      writeFile(path.join(projectA, '.claude', 'hooks', 'hook.sh'), 'local override');

      // Manifest marks file as override
      service.computeSyncState('proj-a', projectA);

      writeFile(path.join(globalDir, 'hooks', 'hook.sh'), 'updated global');
      const result = service.propagateGlobalChange('hooks/hook.sh');

      expect(result.skipped).toContain('proj-a');
      // Local file should remain unchanged
      expect(fs.readFileSync(path.join(projectA, '.claude', 'hooks', 'hook.sh'), 'utf-8')).toBe('local override');
    });

    it('returns empty arrays when global file does not exist', () => {
      const result = service.propagateGlobalChange('nonexistent/file.sh');
      expect(result.updated).toEqual([]);
      expect(result.skipped).toEqual([]);
      expect(result.failed).toEqual([]);
    });

    it('skips disabled projects', () => {
      writeFile(path.join(globalDir, 'hooks', 'hook.sh'), 'content');
      writeFile(path.join(projectA, '.claude', 'hooks', 'hook.sh'), 'content');
      service.computeSyncState('proj-a', projectA);

      registeredProjects[0].enabled = false;

      writeFile(path.join(globalDir, 'hooks', 'hook.sh'), 'new content');
      const result = service.propagateGlobalChange('hooks/hook.sh');
      expect(result.updated).not.toContain('proj-a');
    });
  });

  // ─── createOverride() ──────────────────────────────────────

  describe('createOverride()', () => {
    it('marks a file as override in the manifest', () => {
      const content = 'original content';
      writeFile(path.join(globalDir, 'hooks', 'hook.sh'), content);
      writeFile(path.join(projectA, '.claude', 'hooks', 'hook.sh'), content);
      service.computeSyncState('proj-a', projectA);

      service.createOverride(projectA, 'hooks/hook.sh', 'Custom implementation');

      const manifest = readManifest(projectA) as any;
      expect(manifest.files['hooks/hook.sh'].mode).toBe('override');
      expect(manifest.files['hooks/hook.sh'].reason).toBe('Custom implementation');
      expect(manifest.files['hooks/hook.sh'].overriddenAt).toBeDefined();
    });

    it('does nothing when manifest does not exist', () => {
      // No manifest created — should not throw
      expect(() => service.createOverride(projectA, 'hooks/hook.sh')).not.toThrow();
    });

    it('preserves override across propagations', () => {
      writeFile(path.join(globalDir, 'hooks', 'hook.sh'), 'global');
      writeFile(path.join(projectA, '.claude', 'hooks', 'hook.sh'), 'global');
      service.computeSyncState('proj-a', projectA);

      // Create override
      writeFile(path.join(projectA, '.claude', 'hooks', 'hook.sh'), 'my custom version');
      service.createOverride(projectA, 'hooks/hook.sh', 'Custom');

      // Propagate global change
      writeFile(path.join(globalDir, 'hooks', 'hook.sh'), 'new global version');
      service.propagateGlobalChange('hooks/hook.sh');

      // Local file should still have custom version
      expect(fs.readFileSync(path.join(projectA, '.claude', 'hooks', 'hook.sh'), 'utf-8')).toBe('my custom version');
    });
  });

  // ─── revertOverride() ──────────────────────────────────────

  describe('revertOverride()', () => {
    it('restores global version and resets manifest to synced', () => {
      const globalContent = 'global version';
      writeFile(path.join(globalDir, 'hooks', 'hook.sh'), globalContent);
      writeFile(path.join(projectA, '.claude', 'hooks', 'hook.sh'), 'override content');
      service.computeSyncState('proj-a', projectA);

      service.revertOverride(projectA, 'hooks/hook.sh');

      expect(fs.readFileSync(path.join(projectA, '.claude', 'hooks', 'hook.sh'), 'utf-8')).toBe(globalContent);
      const manifest = readManifest(projectA) as any;
      expect(manifest.files['hooks/hook.sh'].mode).toBe('synced');
      expect(manifest.files['hooks/hook.sh'].overriddenAt).toBeUndefined();
      expect(manifest.files['hooks/hook.sh'].reason).toBeUndefined();
    });

    it('does nothing when global file does not exist', () => {
      // Create a manifest with a file record, but no corresponding global file
      writeFile(path.join(projectA, '.claude', 'hooks', 'hook.sh'), 'local');
      writeManifest(projectA, {
        version: 1,
        files: { 'hooks/hook.sh': { mode: 'override', globalHash: 'abc', localHash: 'def', syncedAt: '' } },
        workflow: { mode: 'synced', globalHash: '', localHash: '', syncedAt: '' },
        newFilesPolicy: 'auto-sync',
      });

      // Global file does not exist — revertOverride should not throw
      expect(() => service.revertOverride(projectA, 'hooks/hook.sh')).not.toThrow();
      // Local file should remain unchanged
      expect(fs.readFileSync(path.join(projectA, '.claude', 'hooks', 'hook.sh'), 'utf-8')).toBe('local');
    });
  });

  // ─── handleNewGlobalFile() ──────────────────────────────────

  describe('handleNewGlobalFile()', () => {
    it('copies new global file to projects with auto-sync policy', () => {
      writeFile(path.join(globalDir, 'agents', 'readme.md'), '# Agent');
      writeFile(path.join(projectA, '.claude', 'some-file.txt'), 'placeholder');

      // Create initial manifest with auto-sync policy
      writeManifest(projectA, {
        version: 1,
        files: {},
        workflow: { mode: 'synced', globalHash: '', localHash: '', syncedAt: '' },
        newFilesPolicy: 'auto-sync',
      });

      const result = service.handleNewGlobalFile('agents/readme.md');
      expect(result.updated).toContain('proj-a');

      const localPath = path.join(projectA, '.claude', 'agents', 'readme.md');
      expect(fs.existsSync(localPath)).toBe(true);
    });

    it('skips projects with prompt policy', () => {
      writeFile(path.join(globalDir, 'agents', 'readme.md'), '# Agent');

      writeManifest(projectA, {
        version: 1,
        files: {},
        workflow: { mode: 'synced', globalHash: '', localHash: '', syncedAt: '' },
        newFilesPolicy: 'prompt',
      });

      const result = service.handleNewGlobalFile('agents/readme.md');
      expect(result.skipped).toContain('proj-a');
    });

    it('returns empty when global file does not exist', () => {
      const result = service.handleNewGlobalFile('nonexistent.md');
      expect(result.updated).toEqual([]);
      expect(result.skipped).toEqual([]);
    });
  });

  // ─── handleGlobalFileDeletion() ─────────────────────────────

  describe('handleGlobalFileDeletion()', () => {
    it('deletes local copies of synced files', () => {
      const content = 'shared hook';
      writeFile(path.join(projectA, '.claude', 'hooks', 'hook.sh'), content);

      writeManifest(projectA, {
        version: 1,
        files: { 'hooks/hook.sh': { mode: 'synced', globalHash: 'abc', localHash: 'abc', syncedAt: '' } },
        workflow: { mode: 'synced', globalHash: '', localHash: '', syncedAt: '' },
        newFilesPolicy: 'auto-sync',
      });

      const result = service.handleGlobalFileDeletion('hooks/hook.sh');
      expect(result.removed).toContain('proj-a');
      expect(fs.existsSync(path.join(projectA, '.claude', 'hooks', 'hook.sh'))).toBe(false);
    });

    it('preserves local files with override mode', () => {
      const content = 'custom override';
      writeFile(path.join(projectA, '.claude', 'hooks', 'hook.sh'), content);

      writeManifest(projectA, {
        version: 1,
        files: { 'hooks/hook.sh': { mode: 'override', globalHash: 'abc', localHash: 'def', syncedAt: '' } },
        workflow: { mode: 'synced', globalHash: '', localHash: '', syncedAt: '' },
        newFilesPolicy: 'auto-sync',
      });

      const result = service.handleGlobalFileDeletion('hooks/hook.sh');
      expect(result.preserved).toContain('proj-a');
      expect(fs.existsSync(path.join(projectA, '.claude', 'hooks', 'hook.sh'))).toBe(true);
    });
  });

  // ─── resolveDrift() ─────────────────────────────────────────

  describe('resolveDrift()', () => {
    it('pins drift as override when using pin-override resolution', () => {
      const content = 'content';
      writeFile(path.join(globalDir, 'hooks', 'hook.sh'), content);
      writeFile(path.join(projectA, '.claude', 'hooks', 'hook.sh'), content);
      service.computeSyncState('proj-a', projectA);

      service.resolveDrift(projectA, 'hooks/hook.sh', 'pin-override');

      const manifest = readManifest(projectA) as any;
      expect(manifest.files['hooks/hook.sh'].mode).toBe('override');
    });

    it('resets to global when using reset-global resolution', () => {
      writeFile(path.join(globalDir, 'hooks', 'hook.sh'), 'global');
      writeFile(path.join(projectA, '.claude', 'hooks', 'hook.sh'), 'drifted');
      service.computeSyncState('proj-a', projectA);

      service.resolveDrift(projectA, 'hooks/hook.sh', 'reset-global');

      expect(fs.readFileSync(path.join(projectA, '.claude', 'hooks', 'hook.sh'), 'utf-8')).toBe('global');
    });
  });

  // ─── getImpactPreview() ─────────────────────────────────────

  describe('getImpactPreview()', () => {
    it('shows which projects will be updated vs skipped', () => {
      // Project A: synced file
      writeFile(path.join(globalDir, 'hooks', 'hook.sh'), 'global');
      writeFile(path.join(projectA, '.claude', 'hooks', 'hook.sh'), 'global');
      service.computeSyncState('proj-a', projectA);

      // Project B: override
      writeFile(path.join(projectB, '.claude', 'hooks', 'hook.sh'), 'custom');
      service.computeSyncState('proj-b', projectB);
      service.createOverride(projectB, 'hooks/hook.sh', 'Custom');

      const preview = service.getImpactPreview('hooks/hook.sh');
      expect(preview.willUpdate).toContain('proj-a');
      expect(preview.willSkip.map(s => s.id)).toContain('proj-b');
    });
  });

  // ─── ensureManifest() ──────────────────────────────────────

  describe('ensureManifest()', () => {
    it('creates a manifest if none exists', () => {
      writeFile(path.join(globalDir, 'hooks', 'test.sh'), 'content');
      const manifestPath = path.join(projectA, '.claude', 'orbital-sync.json');
      expect(fs.existsSync(manifestPath)).toBe(false);

      const manifest = service.ensureManifest(projectA);

      expect(manifest.version).toBe(1);
      expect(fs.existsSync(manifestPath)).toBe(true);
    });

    it('returns existing manifest without modification', () => {
      writeManifest(projectA, {
        version: 1,
        files: { 'test.sh': { mode: 'synced', globalHash: 'abc', localHash: 'abc', syncedAt: '2026-01-01' } },
        workflow: { mode: 'synced', globalHash: '', localHash: '', syncedAt: '' },
        newFilesPolicy: 'prompt',
      });

      const manifest = service.ensureManifest(projectA);
      expect(manifest.newFilesPolicy).toBe('prompt');
    });
  });

  // ─── Empty / edge states ────────────────────────────────────

  describe('edge cases', () => {
    it('handles no registered projects', () => {
      registeredProjects = [];

      writeFile(path.join(globalDir, 'hooks', 'hook.sh'), 'content');
      const result = service.propagateGlobalChange('hooks/hook.sh');
      expect(result.updated).toEqual([]);
    });

    it('handles missing global primitives dir in computeSyncState', () => {
      writeManifest(projectA, {
        version: 1,
        files: {},
        workflow: { mode: 'synced', globalHash: '', localHash: '', syncedAt: '' },
        newFilesPolicy: 'auto-sync',
      });

      // Remove the global dir
      fs.rmSync(globalDir, { recursive: true, force: true });

      // Should not throw
      const report = service.computeSyncState('proj-a', projectA);
      expect(report.files).toEqual([]);
    });
  });
});
