import { describe, it, expect, beforeAll, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createSyncRoutes } from '../routes/sync-routes.js';
import type { SyncService } from '../services/sync-service.js';
import type { ProjectManager } from '../project-manager.js';

// Mock child_process to prevent real osascript/git calls
vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>();
  return {
    ...actual,
    execFile: vi.fn(
      (_cmd: string, _args: string[], _opts: unknown, cb?: (err: Error | null, stdout?: string, stderr?: string) => void) => {
        if (cb) cb(null, '/tmp/selected-folder\n', '');
      },
    ),
  };
});

// Mock fs for check-path and create routes
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    default: {
      ...actual,
      existsSync: vi.fn((p: string) => {
        if (typeof p === 'string' && p.includes('nonexistent')) return false;
        if (typeof p === 'string' && p.includes('.git')) return true;
        if (typeof p === 'string' && p.includes('orbital.config.json')) return false;
        return true;
      }),
      statSync: vi.fn(() => ({ isDirectory: () => true })),
      readFileSync: actual.readFileSync,
      writeFileSync: vi.fn(),
      renameSync: vi.fn(),
      mkdirSync: vi.fn(),
    },
  };
});

// Mock init and global-config
vi.mock('../init.js', () => ({
  runInit: vi.fn(),
  TEMPLATES_DIR: '/tmp/templates',
}));

vi.mock('../global-config.js', () => ({
  loadGlobalConfig: vi.fn().mockReturnValue({ projects: [] }),
  getRegisteredProjects: vi.fn().mockReturnValue([]),
  GLOBAL_PRIMITIVES_DIR: '/tmp/global-primitives',
  GLOBAL_WORKFLOW_PATH: '/tmp/global-workflow.json',
}));

vi.mock('../utils/package-info.js', () => ({
  getPackageVersion: vi.fn().mockReturnValue('1.0.0'),
}));

describe('sync-routes', () => {
  let app: express.Express;

  const mockCtx = {
    id: 'test-project',
    config: { projectRoot: '/tmp/test-project' },
  };

  const mockSyncService: Record<string, ReturnType<typeof vi.fn>> = {
    computeSyncState: vi.fn().mockReturnValue({
      projectId: 'test-project',
      files: [],
      overrides: 0,
      drifted: 0,
      synced: 0,
    }),
    computeGlobalSyncState: vi.fn().mockReturnValue({
      projects: [],
      totalFiles: 0,
    }),
    createOverride: vi.fn(),
    revertOverride: vi.fn(),
    promoteOverride: vi.fn().mockReturnValue({
      updated: ['other-project'],
      skipped: [],
      failed: [],
    }),
    resolveDrift: vi.fn(),
    getImpactPreview: vi.fn().mockReturnValue({
      willUpdate: ['project-a'],
      willSkip: [],
    }),
  };

  const mockProjectManager: Record<string, ReturnType<typeof vi.fn>> = {
    getContext: vi.fn((id: string) => (id === 'test-project' ? mockCtx : undefined)),
    getProjectList: vi.fn().mockReturnValue([
      { id: 'test-project', name: 'Test', path: '/tmp/test-project', color: '#ff0', status: 'online', enabled: true, scopeCount: 3 },
    ]),
    addProject: vi.fn().mockResolvedValue({
      id: 'new-project',
      name: 'New Project',
      path: '/tmp/new-project',
      color: '#0ff',
      status: 'online',
      enabled: true,
      scopeCount: 0,
    }),
    removeProject: vi.fn().mockResolvedValue(true),
    updateProject: vi.fn().mockResolvedValue({
      id: 'test-project',
      name: 'Updated',
      path: '/tmp/test-project',
      color: '#ff0',
      enabled: true,
    }),
  };

  beforeAll(() => {
    const router = createSyncRoutes({
      syncService: mockSyncService as unknown as SyncService,
      projectManager: mockProjectManager as unknown as ProjectManager,
    });

    app = express();
    app.use(express.json());
    app.use('/api/orbital', router);
  });

  // ─── Sync State ─────────────────────────────────────────

  describe('GET /api/orbital/sync/state/:projectId', () => {
    it('returns sync state for known project', async () => {
      const res = await request(app).get('/api/orbital/sync/state/test-project');
      expect(res.status).toBe(200);
      expect(mockSyncService.computeSyncState).toHaveBeenCalledWith('test-project', '/tmp/test-project');
    });

    it('returns 404 for unknown project', async () => {
      const res = await request(app).get('/api/orbital/sync/state/unknown');
      expect(res.status).toBe(404);
      expect(res.body.error).toContain('Project not found');
    });
  });

  describe('GET /api/orbital/sync/global-state', () => {
    it('returns global sync state', async () => {
      const res = await request(app).get('/api/orbital/sync/global-state');
      expect(res.status).toBe(200);
      expect(mockSyncService.computeGlobalSyncState).toHaveBeenCalled();
    });
  });

  // ─── Override Operations ────────────────────────────────

  describe('POST /api/orbital/sync/override', () => {
    it('creates override for valid project', async () => {
      const res = await request(app)
        .post('/api/orbital/sync/override')
        .send({ projectId: 'test-project', relativePath: 'hooks/pre-commit.sh', reason: 'Custom logic' });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(mockSyncService.createOverride).toHaveBeenCalledWith('/tmp/test-project', 'hooks/pre-commit.sh', 'Custom logic');
    });

    it('rejects missing fields (400)', async () => {
      const res = await request(app)
        .post('/api/orbital/sync/override')
        .send({ projectId: 'test-project' });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/orbital/sync/revert', () => {
    it('reverts override for valid project', async () => {
      const res = await request(app)
        .post('/api/orbital/sync/revert')
        .send({ projectId: 'test-project', relativePath: 'hooks/pre-commit.sh' });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  // ─── Promote (task C2 #1) ──────────────────────────────

  describe('POST /api/orbital/sync/promote', () => {
    it('promotes override to global', async () => {
      const res = await request(app)
        .post('/api/orbital/sync/promote')
        .send({ projectId: 'test-project', relativePath: 'hooks/guard.sh' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.updated).toEqual(['other-project']);
      expect(mockSyncService.promoteOverride).toHaveBeenCalledWith('/tmp/test-project', 'hooks/guard.sh');
    });

    it('rejects missing fields (400)', async () => {
      const res = await request(app)
        .post('/api/orbital/sync/promote')
        .send({ projectId: 'test-project' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('required');
    });

    it('rejects invalid relative path (400)', async () => {
      const res = await request(app)
        .post('/api/orbital/sync/promote')
        .send({ projectId: 'test-project', relativePath: '../../../etc/passwd' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Invalid');
    });

    it('returns 404 for unknown project', async () => {
      const res = await request(app)
        .post('/api/orbital/sync/promote')
        .send({ projectId: 'unknown', relativePath: 'hooks/guard.sh' });

      expect(res.status).toBe(404);
      expect(res.body.error).toContain('Project not found');
    });
  });

  // ─── Resolve Drift (task C2 #2) ───────────────────────

  describe('POST /api/orbital/sync/resolve-drift', () => {
    it('resolves drift with pin-override', async () => {
      const res = await request(app)
        .post('/api/orbital/sync/resolve-drift')
        .send({ projectId: 'test-project', relativePath: 'hooks/guard.sh', resolution: 'pin-override' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(mockSyncService.resolveDrift).toHaveBeenCalledWith('/tmp/test-project', 'hooks/guard.sh', 'pin-override');
    });

    it('rejects missing fields (400)', async () => {
      const res = await request(app)
        .post('/api/orbital/sync/resolve-drift')
        .send({ projectId: 'test-project', relativePath: 'hooks/guard.sh' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('required');
    });

    it('rejects invalid relative path (400)', async () => {
      const res = await request(app)
        .post('/api/orbital/sync/resolve-drift')
        .send({ projectId: 'test-project', relativePath: '/absolute/path', resolution: 'pin-override' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Invalid');
    });

    it('returns 404 for unknown project', async () => {
      const res = await request(app)
        .post('/api/orbital/sync/resolve-drift')
        .send({ projectId: 'unknown', relativePath: 'hooks/guard.sh', resolution: 'reset-global' });

      expect(res.status).toBe(404);
    });
  });

  // ─── Project Registration (task C2 #3) ────────────────

  describe('POST /api/orbital/projects', () => {
    it('registers a new project (201)', async () => {
      const res = await request(app)
        .post('/api/orbital/projects')
        .send({ path: '/tmp/new-project', name: 'New Project', color: '#0ff' });

      expect(res.status).toBe(201);
      expect(res.body.id).toBe('new-project');
      expect(mockProjectManager.addProject).toHaveBeenCalledWith('/tmp/new-project', { name: 'New Project', color: '#0ff' });
    });

    it('rejects missing path (400)', async () => {
      const res = await request(app)
        .post('/api/orbital/projects')
        .send({ name: 'No Path' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('path');
    });

    it('returns 500 when addProject throws', async () => {
      mockProjectManager.addProject.mockRejectedValueOnce(new Error('Registration failed'));
      const res = await request(app)
        .post('/api/orbital/projects')
        .send({ path: '/tmp/bad-project' });

      expect(res.status).toBe(500);
      expect(res.body.error).toContain('Registration failed');
    });
  });

  // ─── Project Update (task C2 #4) ──────────────────────

  describe('PATCH /api/orbital/projects/:id', () => {
    it('updates project metadata', async () => {
      const res = await request(app)
        .patch('/api/orbital/projects/test-project')
        .send({ name: 'Updated', color: '#f00' });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Updated');
      expect(mockProjectManager.updateProject).toHaveBeenCalledWith('test-project', {
        name: 'Updated', color: '#f00', enabled: undefined,
      });
    });

    it('rejects empty name (400)', async () => {
      const res = await request(app)
        .patch('/api/orbital/projects/test-project')
        .send({ name: '  ' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('empty');
    });

    it('returns 404 for unknown project', async () => {
      mockProjectManager.updateProject.mockResolvedValueOnce(null);
      const res = await request(app)
        .patch('/api/orbital/projects/unknown')
        .send({ color: '#abc' });

      expect(res.status).toBe(404);
      expect(res.body.error).toContain('Project not found');
    });
  });

  // ─── Browse (task C2 #5) ──────────────────────────────

  describe('POST /api/orbital/projects/browse', () => {
    it('returns selected folder path on macOS, not_supported elsewhere', async () => {
      const res = await request(app).post('/api/orbital/projects/browse');
      expect(res.status).toBe(200);
      if (process.platform === 'darwin') {
        // Mocked execFile yields '/tmp/selected-folder'
        expect(res.body.path).toBe('/tmp/selected-folder');
      } else {
        // Linux/Windows CI: handler short-circuits before execFile
        expect(res.body.error).toBe('not_supported');
      }
    });
  });

  // ─── Check Path (task C2 #6) ──────────────────────────

  describe('POST /api/orbital/projects/check-path', () => {
    it('validates an existing directory', async () => {
      const res = await request(app)
        .post('/api/orbital/projects/check-path')
        .send({ path: '/tmp/test-project' });

      expect(res.status).toBe(200);
      expect(res.body.valid).toBe(true);
      expect(res.body).toHaveProperty('absPath');
      expect(res.body).toHaveProperty('hasGit');
      expect(res.body).toHaveProperty('suggestedName');
      expect(res.body).toHaveProperty('alreadyRegistered');
    });

    it('returns invalid for empty path', async () => {
      const res = await request(app)
        .post('/api/orbital/projects/check-path')
        .send({ path: '' });

      expect(res.status).toBe(200);
      expect(res.body.valid).toBe(false);
      expect(res.body.error).toContain('required');
    });

    it('returns invalid for nonexistent path', async () => {
      const res = await request(app)
        .post('/api/orbital/projects/check-path')
        .send({ path: '/tmp/nonexistent-dir' });

      expect(res.status).toBe(200);
      expect(res.body.valid).toBe(false);
      expect(res.body.error).toContain('does not exist');
    });
  });

  // ─── Create Project (task C2 #7) ──────────────────────

  describe('POST /api/orbital/projects/create', () => {
    it('rejects missing required fields (400)', async () => {
      const res = await request(app)
        .post('/api/orbital/projects/create')
        .send({ path: '/tmp/test', name: 'Test' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('required');
    });

    it('rejects nonexistent directory (400)', async () => {
      const res = await request(app)
        .post('/api/orbital/projects/create')
        .send({ path: '/tmp/nonexistent-dir', name: 'Test', color: '#fff' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('existing directory');
    });

    it('creates project with valid inputs (201)', async () => {
      const res = await request(app)
        .post('/api/orbital/projects/create')
        .send({ path: '/tmp/test-project', name: 'New Test', color: '#abc' });

      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
      expect(mockProjectManager.addProject).toHaveBeenCalled();
    });
  });

  // ─── Existing routes ──────────────────────────────────

  describe('GET /api/orbital/projects', () => {
    it('returns project list', async () => {
      const res = await request(app).get('/api/orbital/projects');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body[0]).toHaveProperty('id');
      expect(res.body[0]).toHaveProperty('name');
    });
  });

  describe('DELETE /api/orbital/projects/:id', () => {
    it('removes a registered project', async () => {
      const res = await request(app).delete('/api/orbital/projects/test-project');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('returns 404 for unknown project', async () => {
      mockProjectManager.removeProject.mockResolvedValueOnce(false);
      const res = await request(app).delete('/api/orbital/projects/unknown');
      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/orbital/sync/impact', () => {
    it('returns impact preview', async () => {
      const res = await request(app).get('/api/orbital/sync/impact?path=hooks/guard.sh');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('willUpdate');
      expect(res.body).toHaveProperty('willSkip');
    });

    it('rejects missing path param (400)', async () => {
      const res = await request(app).get('/api/orbital/sync/impact');
      expect(res.status).toBe(400);
    });
  });
});
