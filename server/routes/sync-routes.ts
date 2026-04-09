import { Router } from 'express';
import type { SyncService } from '../services/sync-service.js';
import type { ProjectManager } from '../project-manager.js';
import { isValidRelativePath } from '../utils/route-helpers.js';

interface SyncRouteDeps {
  syncService: SyncService;
  projectManager: ProjectManager;
}

export function createSyncRoutes({ syncService, projectManager }: SyncRouteDeps): Router {
  const router = Router();

  // ─── Sync State ─────────────────────────────────────────

  /** GET /sync/state/:projectId — sync state for a specific project */
  router.get('/sync/state/:projectId', (req, res) => {
    const ctx = projectManager.getContext(req.params.projectId);
    if (!ctx) return res.status(404).json({ error: 'Project not found' });

    const report = syncService.computeSyncState(ctx.id, ctx.config.projectRoot);
    res.json(report);
  });

  /** GET /sync/global-state — matrix view across all projects */
  router.get('/sync/global-state', (_req, res) => {
    const report = syncService.computeGlobalSyncState();
    res.json(report);
  });

  // ─── Override Operations ────────────────────────────────

  /** POST /sync/override — create an override for a file in a project */
  router.post('/sync/override', (req, res) => {
    const { projectId, relativePath, reason } = req.body as {
      projectId: string; relativePath: string; reason?: string;
    };
    if (!projectId || !relativePath) {
      return res.status(400).json({ error: 'projectId and relativePath required' });
    }
    if (!isValidRelativePath(relativePath)) {
      return res.status(400).json({ error: 'Invalid relativePath' });
    }

    const ctx = projectManager.getContext(projectId);
    if (!ctx) return res.status(404).json({ error: 'Project not found' });

    syncService.createOverride(ctx.config.projectRoot, relativePath, reason);
    res.json({ success: true });
  });

  /** POST /sync/revert — revert an override back to global */
  router.post('/sync/revert', (req, res) => {
    const { projectId, relativePath } = req.body as {
      projectId: string; relativePath: string;
    };
    if (!projectId || !relativePath) {
      return res.status(400).json({ error: 'projectId and relativePath required' });
    }
    if (!isValidRelativePath(relativePath)) {
      return res.status(400).json({ error: 'Invalid relativePath' });
    }

    const ctx = projectManager.getContext(projectId);
    if (!ctx) return res.status(404).json({ error: 'Project not found' });

    syncService.revertOverride(ctx.config.projectRoot, relativePath);
    res.json({ success: true });
  });

  /** POST /sync/promote — promote a project override to global */
  router.post('/sync/promote', (req, res) => {
    const { projectId, relativePath } = req.body as {
      projectId: string; relativePath: string;
    };
    if (!projectId || !relativePath) {
      return res.status(400).json({ error: 'projectId and relativePath required' });
    }
    if (!isValidRelativePath(relativePath)) {
      return res.status(400).json({ error: 'Invalid relativePath' });
    }

    const ctx = projectManager.getContext(projectId);
    if (!ctx) return res.status(404).json({ error: 'Project not found' });

    const result = syncService.promoteOverride(ctx.config.projectRoot, relativePath);
    res.json({ success: true, ...result });
  });

  /** POST /sync/resolve-drift — resolve a drifted file */
  router.post('/sync/resolve-drift', (req, res) => {
    const { projectId, relativePath, resolution } = req.body as {
      projectId: string; relativePath: string; resolution: 'pin-override' | 'reset-global';
    };
    if (!projectId || !relativePath || !resolution) {
      return res.status(400).json({ error: 'projectId, relativePath, and resolution required' });
    }
    if (!isValidRelativePath(relativePath)) {
      return res.status(400).json({ error: 'Invalid relativePath' });
    }

    const ctx = projectManager.getContext(projectId);
    if (!ctx) return res.status(404).json({ error: 'Project not found' });

    syncService.resolveDrift(ctx.config.projectRoot, relativePath, resolution);
    res.json({ success: true });
  });

  // ─── Impact Preview ─────────────────────────────────────

  /** GET /sync/impact?path=<relativePath> — preview impact of a global change */
  router.get('/sync/impact', (req, res) => {
    const relativePath = req.query.path as string;
    if (!relativePath) {
      return res.status(400).json({ error: 'path query parameter required' });
    }
    if (!isValidRelativePath(relativePath)) {
      return res.status(400).json({ error: 'Invalid path' });
    }

    const preview = syncService.getImpactPreview(relativePath);
    res.json(preview);
  });

  // ─── Project Management ─────────────────────────────────

  /** GET /projects — list all registered projects */
  router.get('/projects', (req, res) => {
    const include = req.query.include as string | undefined;
    res.json(projectManager.getProjectList({
      includeWorkflow: include?.includes('workflow'),
    }));
  });

  /** POST /projects — register a new project */
  router.post('/projects', async (req, res) => {
    const { path: projectPath, name, color } = req.body as {
      path: string; name?: string; color?: string;
    };
    if (!projectPath) {
      return res.status(400).json({ error: 'path required' });
    }

    try {
      const summary = await projectManager.addProject(projectPath, { name, color });
      res.status(201).json(summary);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  /** DELETE /projects/:id — unregister a project */
  router.delete('/projects/:id', async (req, res) => {
    const removed = await projectManager.removeProject(req.params.id);
    if (!removed) return res.status(404).json({ error: 'Project not found' });
    res.json({ success: true });
  });

  /** PATCH /projects/:id — update project metadata */
  router.patch('/projects/:id', async (req, res) => {
    const { name, color, enabled } = req.body as {
      name?: string; color?: string; enabled?: boolean;
    };

    if (name !== undefined && !name.trim()) {
      return res.status(400).json({ error: 'Name cannot be empty' });
    }

    const updated = await projectManager.updateProject(req.params.id, { name, color, enabled });
    if (!updated) return res.status(404).json({ error: 'Project not found' });
    res.json(updated);
  });

  return router;
}
