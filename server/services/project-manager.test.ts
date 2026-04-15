import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

// Mock logger
vi.mock('../utils/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Mock global-config
const mockGlobalConfig = {
  version: 1 as const,
  projects: [] as Array<{
    id: string;
    path: string;
    name: string;
    color: string;
    registeredAt: string;
    enabled: boolean;
  }>,
};

vi.mock('../global-config.js', () => ({
  loadGlobalConfig: vi.fn(() => mockGlobalConfig),
  registerProject: vi.fn((projectRoot: string, options?: { name?: string; color?: string }) => ({
    id: path.basename(projectRoot).toLowerCase(),
    path: projectRoot,
    name: options?.name ?? path.basename(projectRoot),
    color: options?.color ?? '210 80% 55%',
    registeredAt: new Date().toISOString(),
    enabled: true,
  })),
  unregisterProject: vi.fn(),
  updateProject: vi.fn((id: string, updates: Record<string, unknown>) => ({
    id,
    path: `/tmp/${id}`,
    name: id,
    color: '210 80% 55%',
    registeredAt: new Date().toISOString(),
    enabled: true,
    ...updates,
  })),
  findProject: vi.fn((id: string) => {
    const reg = mockGlobalConfig.projects.find(p => p.id === id);
    return reg ?? null;
  }),
}));

// Mock project-context — createProjectContext is the key factory
const mockShutdown = vi.fn().mockResolvedValue(undefined);
vi.mock('../project-context.js', () => ({
  createProjectContext: vi.fn().mockImplementation(async (id: string) => ({
    id,
    status: 'active',
    config: {
      projectRoot: `/tmp/${id}`,
      projectName: id,
      categories: [],
      agents: [],
      serverPort: 4444,
      clientPort: 4445,
      configDir: `/tmp/${id}/.claude/config`,
    },
    db: {},
    emitter: { emit: vi.fn() },
    scopeService: { getAll: vi.fn().mockReturnValue([{ id: 1 }]) },
    sprintService: { getAll: vi.fn().mockReturnValue([]) },
    gateService: {},
    eventService: {},
    deployService: {},
    sprintOrchestrator: {},
    batchOrchestrator: {},
    readinessService: {},
    workflowService: { getActive: vi.fn().mockReturnValue({}) },
    workflowEngine: {
      getAllHooks: vi.fn().mockReturnValue([]),
      getAllEdges: vi.fn().mockReturnValue([]),
      getConfig: vi.fn().mockReturnValue({ lists: [] }),
    },
    gitService: {},
    githubService: {},
    telemetryService: null,
    telemetryRouter: null,
    scopeWatcher: { close: vi.fn() },
    eventWatcher: { close: vi.fn() },
    intervals: [],
    shutdown: mockShutdown,
  })),
}));

// Mock project-emitter — must be a real class since ProjectManager calls `new ProjectEmitter()`
vi.mock('../project-emitter.js', () => {
  class MockProjectEmitter {
    emit = vi.fn();
    getProjectId = vi.fn();
    getServer = vi.fn();
    constructor(_io: any, _projectId: string) {}
  }
  return { ProjectEmitter: MockProjectEmitter };
});

// Mock all route factories (buildProjectRouter calls them)
vi.mock('../routes/scope-routes.js', () => ({ createScopeRoutes: vi.fn(() => ((_req: any, _res: any, next: any) => next())) }));
vi.mock('../routes/data-routes.js', () => ({ createDataRoutes: vi.fn(() => ((_req: any, _res: any, next: any) => next())) }));
vi.mock('../routes/dispatch-routes.js', () => ({ createDispatchRoutes: vi.fn(() => ((_req: any, _res: any, next: any) => next())) }));
vi.mock('../routes/sprint-routes.js', () => ({ createSprintRoutes: vi.fn(() => ((_req: any, _res: any, next: any) => next())) }));
vi.mock('../routes/workflow-routes.js', () => ({ createWorkflowRoutes: vi.fn(() => ((_req: any, _res: any, next: any) => next())) }));
vi.mock('../routes/config-routes.js', () => ({ createConfigRoutes: vi.fn(() => ((_req: any, _res: any, next: any) => next())) }));
vi.mock('../routes/git-routes.js', () => ({ createGitRoutes: vi.fn(() => ((_req: any, _res: any, next: any) => next())) }));
vi.mock('../routes/manifest-routes.js', () => ({ createManifestRoutes: vi.fn(() => ((_req: any, _res: any, next: any) => next())) }));
vi.mock('../init.js', () => ({ TEMPLATES_DIR: '/tmp/templates' }));
vi.mock('../utils/package-info.js', () => ({ getPackageVersion: vi.fn(() => '1.0.0') }));
vi.mock('../utils/dispatch-utils.js', () => ({
  resolveActiveDispatchesForScope: vi.fn(),
}));

import { ProjectManager } from '../project-manager.js';

describe('ProjectManager', () => {
  let pm: ProjectManager;
  let mockIo: { emit: ReturnType<typeof vi.fn>; on: ReturnType<typeof vi.fn> };
  let tmpDir: string;

  beforeEach(() => {
    vi.clearAllMocks();
    mockShutdown.mockResolvedValue(undefined);
    mockIo = {
      emit: vi.fn(),
      on: vi.fn(),
    };
    pm = new ProjectManager(mockIo as any);
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-test-'));

    // Reset global config
    mockGlobalConfig.projects = [];
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ─── initializeProject ────────────────────────────────────

  describe('initializeProject()', () => {
    it('creates a context and stores it in the map', async () => {
      const reg = {
        id: 'test-proj',
        path: tmpDir,
        name: 'Test Project',
        color: '210 80% 55%',
        registeredAt: new Date().toISOString(),
        enabled: true,
      };

      const ctx = await pm.initializeProject(reg);
      expect(ctx).not.toBeNull();
      expect(pm.getContext('test-proj')).toBeDefined();
    });

    it('also builds and stores a router', async () => {
      const reg = {
        id: 'router-proj',
        path: tmpDir,
        name: 'Router Project',
        color: '120 60% 45%',
        registeredAt: new Date().toISOString(),
        enabled: true,
      };

      await pm.initializeProject(reg);
      expect(pm.getRouter('router-proj')).toBeDefined();
    });

    it('returns null when project directory does not exist', async () => {
      const reg = {
        id: 'missing-proj',
        path: '/tmp/nonexistent-dir-abc123',
        name: 'Missing',
        color: '0 0% 50%',
        registeredAt: new Date().toISOString(),
        enabled: true,
      };

      const ctx = await pm.initializeProject(reg);
      expect(ctx).toBeNull();
      expect(pm.getContext('missing-proj')).toBeUndefined();
    });

    it('returns null when createProjectContext throws', async () => {
      const { createProjectContext } = await import('../project-context.js');
      vi.mocked(createProjectContext).mockRejectedValueOnce(new Error('DB init failed'));

      const reg = {
        id: 'fail-proj',
        path: tmpDir,
        name: 'Fail Project',
        color: '0 0% 50%',
        registeredAt: new Date().toISOString(),
        enabled: true,
      };

      const ctx = await pm.initializeProject(reg);
      expect(ctx).toBeNull();
    });
  });

  // ─── addProject ───────────────────────────────────────────

  describe('addProject()', () => {
    it('registers the project and emits project:registered event', async () => {
      const summary = await pm.addProject(tmpDir, { name: 'My Project' });
      expect(summary.id).toBeDefined();
      expect(summary.name).toBe('My Project');
      expect(mockIo.emit).toHaveBeenCalledWith('project:registered', expect.objectContaining({
        name: 'My Project',
      }));
    });

    it('returns a valid ProjectSummary with status', async () => {
      const summary = await pm.addProject(tmpDir);
      expect(summary).toHaveProperty('id');
      expect(summary).toHaveProperty('status');
      expect(summary).toHaveProperty('enabled');
      expect(summary).toHaveProperty('scopeCount');
    });
  });

  // ─── removeProject ────────────────────────────────────────

  describe('removeProject()', () => {
    it('shuts down the context, removes from maps, and emits event', async () => {
      const reg = {
        id: 'remove-me',
        path: tmpDir,
        name: 'Remove Me',
        color: '0 0% 50%',
        registeredAt: new Date().toISOString(),
        enabled: true,
      };
      mockGlobalConfig.projects = [reg];

      await pm.initializeProject(reg);
      expect(pm.getContext('remove-me')).toBeDefined();

      const removed = await pm.removeProject('remove-me');
      expect(removed).toBe(true);
      expect(pm.getContext('remove-me')).toBeUndefined();
      expect(pm.getRouter('remove-me')).toBeUndefined();
      expect(mockIo.emit).toHaveBeenCalledWith('project:unregistered', { id: 'remove-me' });
    });

    it('returns false when project is not found', async () => {
      mockGlobalConfig.projects = [];
      const removed = await pm.removeProject('nonexistent');
      expect(removed).toBe(false);
    });
  });

  // ─── getProjectList ───────────────────────────────────────

  describe('getProjectList()', () => {
    it('returns summaries for all registered projects', async () => {
      mockGlobalConfig.projects = [
        { id: 'proj-a', path: tmpDir, name: 'A', color: '210 80% 55%', registeredAt: new Date().toISOString(), enabled: true },
        { id: 'proj-b', path: '/tmp/nowhere', name: 'B', color: '120 60% 45%', registeredAt: new Date().toISOString(), enabled: false },
      ];

      // Initialize only proj-a
      await pm.initializeProject(mockGlobalConfig.projects[0]);

      const list = pm.getProjectList();
      expect(list.length).toBe(2);

      const projA = list.find(p => p.id === 'proj-a');
      expect(projA).toBeDefined();
      expect(projA!.status).toBe('active');
      expect(projA!.scopeCount).toBe(1); // mock returns [{ id: 1 }]

      const projB = list.find(p => p.id === 'proj-b');
      expect(projB).toBeDefined();
      expect(projB!.status).toBe('offline');
      expect(projB!.scopeCount).toBe(0);
    });

    it('includes workflow data when includeWorkflow is true', async () => {
      mockGlobalConfig.projects = [
        { id: 'proj-wf', path: tmpDir, name: 'WF', color: '210 80% 55%', registeredAt: new Date().toISOString(), enabled: true },
      ];
      await pm.initializeProject(mockGlobalConfig.projects[0]);

      const list = pm.getProjectList({ includeWorkflow: true });
      expect(list[0]).toHaveProperty('workflow');
    });
  });

  // ─── shutdownAll ──────────────────────────────────────────

  describe('shutdownAll()', () => {
    it('shuts down all contexts and clears both maps', async () => {
      const reg1 = { id: 'sa-1', path: tmpDir, name: 'SA1', color: '0 0% 50%', registeredAt: new Date().toISOString(), enabled: true };
      const sub = path.join(tmpDir, 'sub');
      fs.mkdirSync(sub, { recursive: true });
      const reg2 = { id: 'sa-2', path: sub, name: 'SA2', color: '0 0% 50%', registeredAt: new Date().toISOString(), enabled: true };

      await pm.initializeProject(reg1);
      await pm.initializeProject(reg2);

      expect(pm.getAllContexts().size).toBe(2);
      expect(pm.getAllRouters().size).toBe(2);

      await pm.shutdownAll();

      expect(pm.getAllContexts().size).toBe(0);
      expect(pm.getAllRouters().size).toBe(0);
    });

    it('handles shutdown errors gracefully', async () => {
      mockShutdown.mockRejectedValueOnce(new Error('close failed'));

      const reg = { id: 'err-proj', path: tmpDir, name: 'Err', color: '0 0% 50%', registeredAt: new Date().toISOString(), enabled: true };
      await pm.initializeProject(reg);

      // Should not throw
      await pm.shutdownAll();
      expect(pm.getAllContexts().size).toBe(0);
    });
  });

  // ─── shutdownProject ──────────────────────────────────────

  describe('shutdownProject()', () => {
    it('calls shutdown on the context and removes it', async () => {
      const reg = { id: 'sp-proj', path: tmpDir, name: 'SP', color: '0 0% 50%', registeredAt: new Date().toISOString(), enabled: true };
      await pm.initializeProject(reg);

      await pm.shutdownProject('sp-proj');
      expect(mockShutdown).toHaveBeenCalled();
      expect(pm.getContext('sp-proj')).toBeUndefined();
      expect(pm.getRouter('sp-proj')).toBeUndefined();
    });

    it('does nothing when project ID does not exist', async () => {
      await pm.shutdownProject('nonexistent');
      // No error thrown
    });
  });

  // ─── updateProject ────────────────────────────────────────

  describe('updateProject()', () => {
    it('emits project:updated event on metadata change', async () => {
      const reg = { id: 'upd-proj', path: tmpDir, name: 'Update', color: '0 0% 50%', registeredAt: new Date().toISOString(), enabled: true };
      mockGlobalConfig.projects = [reg];
      await pm.initializeProject(reg);

      const result = await pm.updateProject('upd-proj', { name: 'Updated Name' });
      expect(result).not.toBeNull();
      expect(mockIo.emit).toHaveBeenCalledWith('project:updated', expect.objectContaining({
        id: 'upd-proj',
        name: 'Updated Name',
      }));
    });

    it('shuts down context when disabling', async () => {
      const reg = { id: 'disable-proj', path: tmpDir, name: 'Disable', color: '0 0% 50%', registeredAt: new Date().toISOString(), enabled: true };
      mockGlobalConfig.projects = [reg];
      await pm.initializeProject(reg);

      await pm.updateProject('disable-proj', { enabled: false });
      expect(mockShutdown).toHaveBeenCalled();
      expect(pm.getContext('disable-proj')).toBeUndefined();
    });
  });

  // ─── Context Access ───────────────────────────────────────

  describe('context access', () => {
    it('getContext returns undefined for non-existent projects', () => {
      expect(pm.getContext('nope')).toBeUndefined();
    });

    it('getRouter returns undefined for non-existent projects', () => {
      expect(pm.getRouter('nope')).toBeUndefined();
    });

    it('getAllContexts returns a Map', () => {
      expect(pm.getAllContexts()).toBeInstanceOf(Map);
    });
  });
});
