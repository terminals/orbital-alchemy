import { describe, it, expect, beforeAll, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createManifestRoutes } from '../routes/manifest-routes.js';

// Mock manifest module
vi.mock('../manifest.js', () => ({
  loadManifest: vi.fn().mockReturnValue({
    packageVersion: '1.0.0',
    preset: 'default',
    updatedAt: '2026-01-01T00:00:00.000Z',
    files: {
      'hooks/pre-commit.sh': {
        origin: 'template',
        status: 'synced',
        templateHash: 'abc',
        installedHash: 'abc',
      },
      'skills/test.md': {
        origin: 'user',
        status: 'synced',
        templateHash: 'def',
        installedHash: 'def',
      },
    },
  }),
  saveManifest: vi.fn(),
  hashFile: vi.fn().mockReturnValue('abc'),
  computeFileStatus: vi.fn().mockReturnValue('synced'),
  refreshFileStatuses: vi.fn(),
  summarizeManifest: vi.fn().mockReturnValue({
    total: 2,
    synced: 2,
    modified: 0,
    pinned: 0,
    userOwned: 1,
    byType: {},
  }),
  reverseRemapPath: vi.fn((f: string) => f),
  safeBackupFile: vi.fn(),
  safeCopyTemplate: vi.fn(),
  safeRestoreFile: vi.fn().mockReturnValue(true),
}));

// Mock validator
vi.mock('../validator.js', () => ({
  validate: vi.fn().mockReturnValue({ valid: true, issues: [] }),
}));

// Mock update-planner
vi.mock('../update-planner.js', () => ({
  computeUpdatePlan: vi.fn().mockReturnValue({ actions: [] }),
  loadRenameMap: vi.fn().mockReturnValue({}),
}));

// Mock init
vi.mock('../init.js', () => ({
  runInit: vi.fn(),
  runUpdate: vi.fn(),
}));

// Mock migrate-legacy
vi.mock('../migrate-legacy.js', () => ({
  needsLegacyMigration: vi.fn().mockReturnValue(false),
  migrateFromLegacy: vi.fn(),
}));

// Mock fs for existsSync
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    default: {
      ...actual,
      existsSync: vi.fn().mockReturnValue(true),
      lstatSync: vi.fn().mockReturnValue({ isSymbolicLink: () => false }),
    },
    existsSync: vi.fn().mockReturnValue(true),
    lstatSync: vi.fn().mockReturnValue({ isSymbolicLink: () => false }),
  };
});

// Mock child_process
vi.mock('child_process', () => ({
  execFileSync: vi.fn().mockReturnValue('diff output'),
}));

import { loadManifest, safeRestoreFile } from '../manifest.js';
import { needsLegacyMigration, migrateFromLegacy } from '../migrate-legacy.js';
import { runInit, runUpdate } from '../init.js';

const mockLoadManifest = loadManifest as ReturnType<typeof vi.fn>;
const mockNeedsLegacyMigration = needsLegacyMigration as ReturnType<typeof vi.fn>;
const mockMigrateFromLegacy = migrateFromLegacy as ReturnType<typeof vi.fn>;
const mockRunInit = runInit as ReturnType<typeof vi.fn>;
const mockRunUpdate = runUpdate as ReturnType<typeof vi.fn>;
const mockSafeRestoreFile = safeRestoreFile as ReturnType<typeof vi.fn>;

describe('manifest-routes', () => {
  let app: express.Express;
  let mockIo: { emit: ReturnType<typeof vi.fn> };

  beforeAll(() => {
    mockIo = { emit: vi.fn() };
    const router = createManifestRoutes({
      projectRoot: '/tmp/test-project',
      templatesDir: '/tmp/test-templates',
      packageVersion: '1.1.0',
      io: mockIo as any,
    });

    app = express();
    app.use(express.json());
    app.use('/api/orbital', router);
  });

  // ─── GET /manifest/status ─────────────────────────────────

  describe('GET /manifest/status', () => {
    it('returns manifest status', async () => {
      const res = await request(app).get('/api/orbital/manifest/status');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('exists');
      expect(res.body.data).toHaveProperty('packageVersion');
      expect(res.body.data.packageVersion).toBe('1.1.0');
    });
  });

  // ─── GET /manifest/files ──────────────────────────────────

  describe('GET /manifest/files', () => {
    it('returns file inventory', async () => {
      const res = await request(app).get('/api/orbital/manifest/files');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBe(2);
    });
  });

  // ─── GET /manifest/validate ───────────────────────────────

  describe('GET /manifest/validate', () => {
    it('returns validation report', async () => {
      const res = await request(app).get('/api/orbital/manifest/validate');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('valid');
    });
  });

  // ─── POST /manifest/pin ──────────────────────────────────

  describe('POST /manifest/pin', () => {
    it('pins a template file', async () => {
      const res = await request(app)
        .post('/api/orbital/manifest/pin')
        .send({ file: 'hooks/pre-commit.sh', reason: 'customized' });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('rejects invalid file path (400)', async () => {
      const res = await request(app)
        .post('/api/orbital/manifest/pin')
        .send({ file: '../etc/passwd' });
      expect(res.status).toBe(400);
    });

    it('rejects missing file (400)', async () => {
      const res = await request(app)
        .post('/api/orbital/manifest/pin')
        .send({});
      expect(res.status).toBe(400);
    });

    it('rejects pinning user-owned file (400)', async () => {
      const res = await request(app)
        .post('/api/orbital/manifest/pin')
        .send({ file: 'skills/test.md' });
      expect(res.status).toBe(400);
    });
  });

  // ─── POST /manifest/unpin ────────────────────────────────

  describe('POST /manifest/unpin', () => {
    it('rejects invalid file path (400)', async () => {
      const res = await request(app)
        .post('/api/orbital/manifest/unpin')
        .send({ file: '' });
      expect(res.status).toBe(400);
    });
  });

  // ─── POST /manifest/reset ────────────────────────────────

  describe('POST /manifest/reset', () => {
    it('rejects invalid path (400)', async () => {
      const res = await request(app)
        .post('/api/orbital/manifest/reset')
        .send({ file: '' });
      expect(res.status).toBe(400);
    });
  });

  // ─── GET /manifest/diff ──────────────────────────────────

  describe('GET /manifest/diff', () => {
    it('returns 400 without file param', async () => {
      const res = await request(app).get('/api/orbital/manifest/diff');
      expect(res.status).toBe(400);
    });

    it('returns 400 for path traversal', async () => {
      const res = await request(app).get('/api/orbital/manifest/diff?file=../etc/passwd');
      expect(res.status).toBe(400);
    });
  });

  // ─── POST /manifest/init ──────────────────────────────────

  describe('POST /manifest/init', () => {
    const fakeManifest = {
      packageVersion: '1.0.0',
      preset: 'default',
      updatedAt: '2026-01-01T00:00:00Z',
      files: {
        'hooks/pre-commit.sh': {
          origin: 'template',
          status: 'synced',
          templateHash: 'aaa',
          installedHash: 'aaa',
        },
      },
    };

    it('returns success if manifest already exists', async () => {
      mockLoadManifest.mockReturnValueOnce(fakeManifest);

      const res = await request(app).post('/api/orbital/manifest/init');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Already initialized');
    });

    it('migrates from legacy if needed', async () => {
      mockLoadManifest.mockReturnValueOnce(null);
      mockNeedsLegacyMigration.mockReturnValueOnce(true);

      const res = await request(app).post('/api/orbital/manifest/init');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(mockMigrateFromLegacy).toHaveBeenCalled();
      expect(mockIo.emit).toHaveBeenCalledWith('manifest:changed', { action: 'initialized' });
    });

    it('runs full init when no manifest and no legacy', async () => {
      mockLoadManifest.mockReturnValueOnce(null);
      mockNeedsLegacyMigration.mockReturnValueOnce(false);

      const res = await request(app).post('/api/orbital/manifest/init');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(mockRunInit).toHaveBeenCalledWith('/tmp/test-project', { force: false });
      expect(mockIo.emit).toHaveBeenCalledWith('manifest:changed', { action: 'initialized' });
    });

    it('returns 500 on error', async () => {
      mockLoadManifest.mockImplementationOnce(() => { throw new Error('disk full'); });

      const res = await request(app).post('/api/orbital/manifest/init');
      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
    });
  });

  // ─── POST /manifest/update ────────────────────────────────

  describe('POST /manifest/update', () => {
    const fakeManifest = {
      packageVersion: '1.0.0',
      preset: 'default',
      updatedAt: '2026-01-01T00:00:00Z',
      files: {
        'hooks/pre-commit.sh': {
          origin: 'template',
          status: 'synced',
          templateHash: 'aaa',
          installedHash: 'aaa',
        },
      },
    };

    it('returns dry-run plan by default', async () => {
      mockLoadManifest.mockReturnValueOnce(fakeManifest);

      const res = await request(app)
        .post('/api/orbital/manifest/update')
        .send({});
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
    });

    it('executes actual update when dryRun is false', async () => {
      mockLoadManifest.mockReturnValueOnce(fakeManifest);

      const res = await request(app)
        .post('/api/orbital/manifest/update')
        .send({ dryRun: false });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(mockRunUpdate).toHaveBeenCalledWith('/tmp/test-project', { dryRun: false });
      expect(mockIo.emit).toHaveBeenCalledWith('manifest:changed', { action: 'updated' });
    });

    it('returns 400 when no manifest exists', async () => {
      mockLoadManifest.mockReturnValueOnce(null);
      mockNeedsLegacyMigration.mockReturnValueOnce(false);

      const res = await request(app)
        .post('/api/orbital/manifest/update')
        .send({ dryRun: false });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('No manifest');
    });

    it('migrates legacy before updating', async () => {
      mockLoadManifest
        .mockReturnValueOnce(null)         // first call: no manifest
        .mockReturnValueOnce(fakeManifest); // after migration
      mockNeedsLegacyMigration.mockReturnValueOnce(true);

      const res = await request(app)
        .post('/api/orbital/manifest/update')
        .send({ dryRun: false });
      expect(res.status).toBe(200);
      expect(mockMigrateFromLegacy).toHaveBeenCalled();
    });
  });

  // ─── POST /manifest/revert ────────────────────────────────

  describe('POST /manifest/revert', () => {
    const fakeManifest = {
      packageVersion: '1.0.0',
      preset: 'default',
      updatedAt: '2026-01-01T00:00:00Z',
      files: {
        'hooks/pre-commit.sh': {
          origin: 'template',
          status: 'synced',
          templateHash: 'aaa',
          installedHash: 'aaa',
        },
      },
    };

    it('reverts a tracked file', async () => {
      mockLoadManifest.mockReturnValueOnce({
        ...fakeManifest,
        files: {
          'hooks/pre-commit.sh': {
            origin: 'template',
            status: 'modified',
            templateHash: 'aaa',
            installedHash: 'bbb',
          },
        },
      });
      mockSafeRestoreFile.mockReturnValueOnce(true);

      const res = await request(app)
        .post('/api/orbital/manifest/revert')
        .send({ file: 'hooks/pre-commit.sh' });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(mockIo.emit).toHaveBeenCalledWith('manifest:changed', { action: 'reverted', file: 'hooks/pre-commit.sh' });
    });

    it('returns 400 for missing file param', async () => {
      const res = await request(app)
        .post('/api/orbital/manifest/revert')
        .send({});
      expect(res.status).toBe(400);
    });

    it('returns 404 when file is not tracked', async () => {
      mockLoadManifest.mockReturnValueOnce(fakeManifest);

      const res = await request(app)
        .post('/api/orbital/manifest/revert')
        .send({ file: 'nonexistent.sh' });
      expect(res.status).toBe(404);
      expect(res.body.error).toContain('not tracked');
    });

    it('returns 404 when no .prev backup exists', async () => {
      mockLoadManifest.mockReturnValueOnce({
        ...fakeManifest,
        files: {
          'hooks/pre-commit.sh': {
            origin: 'template',
            status: 'modified',
            templateHash: 'aaa',
            installedHash: 'bbb',
          },
        },
      });
      mockSafeRestoreFile.mockReturnValueOnce(false);

      const res = await request(app)
        .post('/api/orbital/manifest/revert')
        .send({ file: 'hooks/pre-commit.sh' });
      expect(res.status).toBe(404);
      expect(res.body.error).toContain('No previous version');
    });

    it('returns 400 when no manifest exists', async () => {
      mockLoadManifest.mockReturnValueOnce(null);

      const res = await request(app)
        .post('/api/orbital/manifest/revert')
        .send({ file: 'hooks/pre-commit.sh' });
      expect(res.status).toBe(400);
    });
  });
});
