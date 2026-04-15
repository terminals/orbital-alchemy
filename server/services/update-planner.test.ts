import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  loadRenameMap,
  computeUpdatePlan,
  formatPlan,
  getFilesToBackup,
} from '../update-planner.js';
import type { OrbitalManifest, UpdatePlan } from '../manifest-types.js';

// ─── Helpers ──────────────────────────────────────────────────

function createManifest(overrides: Partial<OrbitalManifest> = {}): OrbitalManifest {
  return {
    version: 2,
    installedAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    packageVersion: '1.0.0',
    preset: 'default',
    files: {},
    settingsHooksChecksum: '',
    appliedMigrations: [],
    generatedArtifacts: ['INDEX.md', 'config/workflow-manifest.sh'],
    gitignoreEntries: [],
    ...overrides,
  };
}

function emptyPlan(): UpdatePlan {
  return {
    toAdd: [],
    toUpdate: [],
    toRemove: [],
    toRename: [],
    toSkip: [],
    settingsChanges: { hooksToAdd: [], hooksToRemove: [] },
    pendingMigrations: [],
    isEmpty: true,
  };
}

// ─── Tests ────────────────────────────────────────────────────

describe('update-planner', () => {
  let tmpDir: string;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orbital-update-planner-'));
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ─── parseSemver / compareSemver (tested indirectly through loadRenameMap) ──

  describe('semver handling (via loadRenameMap)', () => {
    it('filters rename entries by version range', () => {
      const templatesDir = path.join(tmpDir, 'semver-test');
      const migrationsDir = path.join(templatesDir, 'migrations');
      fs.mkdirSync(migrationsDir, { recursive: true });

      // The filter logic: include if from > fromVersion AND to <= toVersion
      // So from=1.1.0 is > fromVersion=1.0.0 (included), from=1.2.0 is > 1.0.0 (included),
      // from=2.0.0 is > 1.0.0 but to=2.1.0 > toVersion=1.3.0 (excluded)
      const renames = {
        '1.1.0->1.2.0': { 'hooks/old.sh': 'hooks/new.sh' },
        '1.2.0->1.3.0': { 'hooks/a.sh': 'hooks/b.sh' },
        '2.0.0->2.1.0': { 'hooks/x.sh': 'hooks/y.sh' },
      };
      fs.writeFileSync(
        path.join(migrationsDir, 'renames.json'),
        JSON.stringify(renames),
        'utf8',
      );

      // fromVersion=1.0.0, toVersion=1.3.0
      // 1.1.0->1.2.0: from=1.1.0 > 1.0.0, to=1.2.0 <= 1.3.0 => included
      // 1.2.0->1.3.0: from=1.2.0 > 1.0.0, to=1.3.0 <= 1.3.0 => included
      // 2.0.0->2.1.0: from=2.0.0 > 1.0.0, to=2.1.0 > 1.3.0 => excluded
      const result = loadRenameMap(templatesDir, '1.0.0', '1.3.0');
      expect(result.get('hooks/old.sh')).toBe('hooks/new.sh');
      expect(result.get('hooks/a.sh')).toBe('hooks/b.sh');
      expect(result.has('hooks/x.sh')).toBe(false);
    });

    it('chains renames: A->B then B->C results in A->C', () => {
      const templatesDir = path.join(tmpDir, 'semver-chain');
      const migrationsDir = path.join(templatesDir, 'migrations');
      fs.mkdirSync(migrationsDir, { recursive: true });

      // from must be strictly > fromVersion to be included
      const renames = {
        '1.1.0->1.2.0': { 'hooks/alpha.sh': 'hooks/beta.sh' },
        '1.2.0->1.3.0': { 'hooks/beta.sh': 'hooks/gamma.sh' },
      };
      fs.writeFileSync(
        path.join(migrationsDir, 'renames.json'),
        JSON.stringify(renames),
        'utf8',
      );

      const result = loadRenameMap(templatesDir, '1.0.0', '1.3.0');
      expect(result.get('hooks/alpha.sh')).toBe('hooks/gamma.sh');
      expect(result.has('hooks/beta.sh')).toBe(false);
    });

    it('returns empty map when renames.json does not exist', () => {
      const templatesDir = path.join(tmpDir, 'no-renames');
      fs.mkdirSync(templatesDir, { recursive: true });

      const result = loadRenameMap(templatesDir, '1.0.0', '2.0.0');
      expect(result.size).toBe(0);
    });

    it('returns empty map when renames.json is malformed', () => {
      const templatesDir = path.join(tmpDir, 'bad-renames');
      const migrationsDir = path.join(templatesDir, 'migrations');
      fs.mkdirSync(migrationsDir, { recursive: true });
      fs.writeFileSync(
        path.join(migrationsDir, 'renames.json'),
        'not-json!!!',
        'utf8',
      );

      const result = loadRenameMap(templatesDir, '1.0.0', '2.0.0');
      expect(result.size).toBe(0);
    });

    it('skips entries with invalid version strings', () => {
      const templatesDir = path.join(tmpDir, 'invalid-ver');
      const migrationsDir = path.join(templatesDir, 'migrations');
      fs.mkdirSync(migrationsDir, { recursive: true });

      // from must be strictly > fromVersion (0.9.0), so 1.0.0 > 0.9.0 => included
      const renames = {
        'bad->1.1.0': { 'hooks/a.sh': 'hooks/b.sh' },
        '1.0.0->also-bad': { 'hooks/c.sh': 'hooks/d.sh' },
        '1.0.0->1.1.0': { 'hooks/valid.sh': 'hooks/ok.sh' },
      };
      fs.writeFileSync(
        path.join(migrationsDir, 'renames.json'),
        JSON.stringify(renames),
        'utf8',
      );

      const result = loadRenameMap(templatesDir, '0.9.0', '2.0.0');
      expect(result.size).toBe(1);
      expect(result.get('hooks/valid.sh')).toBe('hooks/ok.sh');
    });

    it('skips entries with no arrow separator', () => {
      const templatesDir = path.join(tmpDir, 'no-arrow');
      const migrationsDir = path.join(templatesDir, 'migrations');
      fs.mkdirSync(migrationsDir, { recursive: true });

      const renames = {
        '1.0.0': { 'hooks/a.sh': 'hooks/b.sh' },
        '1.0.0->1.1.0': { 'hooks/c.sh': 'hooks/d.sh' },
      };
      fs.writeFileSync(
        path.join(migrationsDir, 'renames.json'),
        JSON.stringify(renames),
        'utf8',
      );

      const result = loadRenameMap(templatesDir, '0.9.0', '2.0.0');
      expect(result.size).toBe(1);
      expect(result.get('hooks/c.sh')).toBe('hooks/d.sh');
    });
  });

  // ─── computeUpdatePlan ────────────────────────────────────

  describe('computeUpdatePlan()', () => {
    function setupTemplates(dir: string, files: Record<string, string>): string {
      const templatesDir = path.join(dir, 'templates');
      for (const [relPath, content] of Object.entries(files)) {
        const absPath = path.join(templatesDir, relPath);
        fs.mkdirSync(path.dirname(absPath), { recursive: true });
        fs.writeFileSync(absPath, content, 'utf8');
      }
      return templatesDir;
    }

    function setupClaude(dir: string, files: Record<string, string>): string {
      const claudeDir = path.join(dir, '.claude');
      for (const [relPath, content] of Object.entries(files)) {
        const absPath = path.join(claudeDir, relPath);
        fs.mkdirSync(path.dirname(absPath), { recursive: true });
        fs.writeFileSync(absPath, content, 'utf8');
      }
      return claudeDir;
    }

    it('identifies new template files as additions', () => {
      const testDir = path.join(tmpDir, 'plan-add');
      const templatesDir = setupTemplates(testDir, {
        'hooks/new-hook.sh': '#!/bin/bash\necho new',
      });
      const claudeDir = setupClaude(testDir, {});
      const manifest = createManifest();

      const plan = computeUpdatePlan({
        templatesDir,
        claudeDir,
        manifest,
        newVersion: '1.1.0',
        renameMap: new Map(),
      });

      expect(plan.toAdd).toContain('hooks/new-hook.sh');
      expect(plan.isEmpty).toBe(false);
    });

    it('identifies files no longer in templates as removals', () => {
      const testDir = path.join(tmpDir, 'plan-remove');
      const templatesDir = setupTemplates(testDir, {});
      const claudeDir = setupClaude(testDir, {});
      const manifest = createManifest({
        files: {
          'hooks/old-hook.sh': {
            origin: 'template',
            status: 'synced',
            templateHash: 'abc123',
            installedHash: 'abc123',
          },
        },
      });

      const plan = computeUpdatePlan({
        templatesDir,
        claudeDir,
        manifest,
        newVersion: '1.1.0',
        renameMap: new Map(),
      });

      expect(plan.toRemove).toContain('hooks/old-hook.sh');
      expect(plan.isEmpty).toBe(false);
    });

    it('identifies synced files with changed template hash as updates', () => {
      const testDir = path.join(tmpDir, 'plan-update');
      const templatesDir = setupTemplates(testDir, {
        'hooks/hook.sh': '#!/bin/bash\necho updated-content',
      });
      const claudeDir = setupClaude(testDir, {});
      const manifest = createManifest({
        files: {
          'hooks/hook.sh': {
            origin: 'template',
            status: 'synced',
            templateHash: 'old-hash-value',
            installedHash: 'old-hash-value',
          },
        },
      });

      const plan = computeUpdatePlan({
        templatesDir,
        claudeDir,
        manifest,
        newVersion: '1.1.0',
        renameMap: new Map(),
      });

      expect(plan.toUpdate).toContain('hooks/hook.sh');
    });

    it('skips pinned files', () => {
      const testDir = path.join(tmpDir, 'plan-pinned');
      const templatesDir = setupTemplates(testDir, {
        'hooks/pinned.sh': '#!/bin/bash\necho pinned',
      });
      const claudeDir = setupClaude(testDir, {});
      const manifest = createManifest({
        files: {
          'hooks/pinned.sh': {
            origin: 'template',
            status: 'pinned',
            templateHash: 'old-hash',
            installedHash: 'old-hash',
            pinnedAt: '2025-01-01T00:00:00Z',
          },
        },
      });

      const plan = computeUpdatePlan({
        templatesDir,
        claudeDir,
        manifest,
        newVersion: '1.1.0',
        renameMap: new Map(),
      });

      expect(plan.toSkip.some(s => s.file === 'hooks/pinned.sh' && s.reason === 'pinned')).toBe(true);
      expect(plan.toUpdate).not.toContain('hooks/pinned.sh');
    });

    it('skips modified files', () => {
      const testDir = path.join(tmpDir, 'plan-modified');
      const templatesDir = setupTemplates(testDir, {
        'hooks/modified.sh': '#!/bin/bash\necho template',
      });
      const claudeDir = setupClaude(testDir, {});
      const manifest = createManifest({
        files: {
          'hooks/modified.sh': {
            origin: 'template',
            status: 'modified',
            templateHash: 'old-hash',
            installedHash: 'different-hash',
          },
        },
      });

      const plan = computeUpdatePlan({
        templatesDir,
        claudeDir,
        manifest,
        newVersion: '1.1.0',
        renameMap: new Map(),
      });

      expect(plan.toSkip.some(s => s.file === 'hooks/modified.sh' && s.reason === 'modified')).toBe(true);
    });

    it('includes renamed files in toRename', () => {
      const testDir = path.join(tmpDir, 'plan-rename');
      const templatesDir = setupTemplates(testDir, {
        'hooks/new-name.sh': '#!/bin/bash\necho renamed',
      });
      const claudeDir = setupClaude(testDir, {});
      const manifest = createManifest({
        files: {
          'hooks/old-name.sh': {
            origin: 'template',
            status: 'synced',
            templateHash: 'abc',
            installedHash: 'abc',
          },
        },
      });

      const renameMap = new Map([['hooks/old-name.sh', 'hooks/new-name.sh']]);

      const plan = computeUpdatePlan({
        templatesDir,
        claudeDir,
        manifest,
        newVersion: '1.1.0',
        renameMap,
      });

      expect(plan.toRename).toEqual([{ from: 'hooks/old-name.sh', to: 'hooks/new-name.sh' }]);
    });

    it('marks isEmpty=true when all files are up to date', () => {
      const testDir = path.join(tmpDir, 'plan-empty');
      // Create a template file with known content
      const templatesDir = path.join(testDir, 'templates');
      const hookDir = path.join(templatesDir, 'hooks');
      fs.mkdirSync(hookDir, { recursive: true });
      fs.writeFileSync(path.join(hookDir, 'current.sh'), '#!/bin/bash\necho current', 'utf8');

      // Compute the hash that buildTemplateInventory will produce
      const crypto = require('crypto');
      const content = fs.readFileSync(path.join(hookDir, 'current.sh'), 'utf-8').replace(/\r\n/g, '\n');
      const hash = crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);

      const claudeDir = path.join(testDir, '.claude');
      fs.mkdirSync(claudeDir, { recursive: true });

      const manifest = createManifest({
        files: {
          'hooks/current.sh': {
            origin: 'template',
            status: 'synced',
            templateHash: hash,
            installedHash: hash,
          },
        },
      });

      const plan = computeUpdatePlan({
        templatesDir,
        claudeDir,
        manifest,
        newVersion: '1.1.0',
        renameMap: new Map(),
      });

      expect(plan.isEmpty).toBe(true);
      expect(plan.toAdd).toHaveLength(0);
      expect(plan.toUpdate).toHaveLength(0);
      expect(plan.toRemove).toHaveLength(0);
    });

    it('updates outdated files', () => {
      const testDir = path.join(tmpDir, 'plan-outdated');
      const templatesDir = setupTemplates(testDir, {
        'hooks/outdated.sh': '#!/bin/bash\necho newer-content',
      });
      const claudeDir = setupClaude(testDir, {});
      const manifest = createManifest({
        files: {
          'hooks/outdated.sh': {
            origin: 'template',
            status: 'outdated',
            templateHash: 'old-hash',
            installedHash: 'old-hash',
          },
        },
      });

      const plan = computeUpdatePlan({
        templatesDir,
        claudeDir,
        manifest,
        newVersion: '1.1.0',
        renameMap: new Map(),
      });

      expect(plan.toUpdate).toContain('hooks/outdated.sh');
    });

    it('skips user-origin files occupying template paths', () => {
      const testDir = path.join(tmpDir, 'plan-user-conflict');
      const templatesDir = setupTemplates(testDir, {
        'hooks/conflict.sh': '#!/bin/bash\necho template',
      });
      const claudeDir = setupClaude(testDir, {});
      const manifest = createManifest({
        files: {
          'hooks/conflict.sh': {
            origin: 'user',
            status: 'user-owned',
            installedHash: 'user-hash',
          },
        },
      });

      const plan = computeUpdatePlan({
        templatesDir,
        claudeDir,
        manifest,
        newVersion: '1.1.0',
        renameMap: new Map(),
      });

      expect(plan.toSkip.some(s => s.file === 'hooks/conflict.sh' && s.reason === 'modified')).toBe(true);
    });
  });

  // ─── formatPlan ───────────────────────────────────────────

  describe('formatPlan()', () => {
    it('shows "Everything up to date" for empty plan', () => {
      const plan = emptyPlan();
      const output = formatPlan(plan, '1.0.0', '1.1.0');

      expect(output).toContain('Everything up to date');
      expect(output).toContain('1.0.0');
      expect(output).toContain('1.1.0');
    });

    it('lists ADD, UPDATE, RENAME, REMOVE, SKIP entries', () => {
      const plan: UpdatePlan = {
        toAdd: ['hooks/new.sh'],
        toUpdate: ['hooks/updated.sh'],
        toRemove: ['hooks/removed.sh'],
        toRename: [{ from: 'hooks/old.sh', to: 'hooks/renamed.sh' }],
        toSkip: [{ file: 'hooks/pinned.sh', reason: 'pinned', newTemplateHash: 'abc' }],
        settingsChanges: { hooksToAdd: ['cmd-a'], hooksToRemove: ['cmd-b'] },
        pendingMigrations: ['0.1.0->0.2.0'],
        isEmpty: false,
      };

      const output = formatPlan(plan, '1.0.0', '1.1.0');

      expect(output).toContain('ADD');
      expect(output).toContain('hooks/new.sh');
      expect(output).toContain('UPDATE');
      expect(output).toContain('hooks/updated.sh');
      expect(output).toContain('RENAME');
      expect(output).toContain('hooks/old.sh');
      expect(output).toContain('hooks/renamed.sh');
      expect(output).toContain('REMOVE');
      expect(output).toContain('hooks/removed.sh');
      expect(output).toContain('SKIP');
      expect(output).toContain('hooks/pinned.sh');
      expect(output).toContain('pinned');
      expect(output).toContain('SETTINGS');
      expect(output).toContain('CONFIG');
      expect(output).toContain('dry run');
    });

    it('includes version numbers in the header', () => {
      const plan = emptyPlan();
      const output = formatPlan(plan, '0.5.0', '1.0.0');

      expect(output).toContain('0.5.0');
      expect(output).toContain('1.0.0');
      expect(output).toContain('Package version');
    });
  });

  // ─── getFilesToBackup ─────────────────────────────────────

  describe('getFilesToBackup()', () => {
    it('includes files from toUpdate, toRemove, and toRename', () => {
      const plan: UpdatePlan = {
        toAdd: ['hooks/new.sh'],
        toUpdate: ['hooks/updated.sh'],
        toRemove: ['hooks/removed.sh'],
        toRename: [{ from: 'hooks/old-name.sh', to: 'hooks/new-name.sh' }],
        toSkip: [{ file: 'hooks/skip.sh', reason: 'pinned', newTemplateHash: 'x' }],
        settingsChanges: { hooksToAdd: [], hooksToRemove: [] },
        pendingMigrations: [],
        isEmpty: false,
      };

      const files = getFilesToBackup(plan);

      expect(files).toContain('hooks/updated.sh');
      expect(files).toContain('hooks/removed.sh');
      expect(files).toContain('hooks/old-name.sh');
      // Should NOT include additions or skips
      expect(files).not.toContain('hooks/new.sh');
      expect(files).not.toContain('hooks/skip.sh');
    });

    it('returns empty array for empty plan', () => {
      const files = getFilesToBackup(emptyPlan());
      expect(files).toHaveLength(0);
    });

    it('includes only the from side of renames', () => {
      const plan: UpdatePlan = {
        toAdd: [],
        toUpdate: [],
        toRemove: [],
        toRename: [
          { from: 'hooks/a.sh', to: 'hooks/b.sh' },
          { from: 'hooks/c.sh', to: 'hooks/d.sh' },
        ],
        toSkip: [],
        settingsChanges: { hooksToAdd: [], hooksToRemove: [] },
        pendingMigrations: [],
        isEmpty: false,
      };

      const files = getFilesToBackup(plan);
      expect(files).toEqual(['hooks/a.sh', 'hooks/c.sh']);
    });
  });
});
