import fs from 'fs';
import { Router } from 'express';
import type { Server } from 'socket.io';
import { ProjectEmitter } from './project-emitter.js';
import { createProjectContext } from './project-context.js';
import type { ProjectContext, ProjectStatus } from './project-context.js';
import {
  loadGlobalConfig,
  registerProject,
  unregisterProject,
  updateProject,
  findProject,
} from './global-config.js';
import type { ProjectRegistration } from './global-config.js';
import { createScopeRoutes } from './routes/scope-routes.js';
import { createDataRoutes } from './routes/data-routes.js';
import { createDispatchRoutes } from './routes/dispatch-routes.js';
import { createSprintRoutes } from './routes/sprint-routes.js';
import { createWorkflowRoutes } from './routes/workflow-routes.js';
import { createConfigRoutes } from './routes/config-routes.js';
import { createGitRoutes } from './routes/git-routes.js';
import { resolveActiveDispatchesForScope } from './utils/dispatch-utils.js';
import { createLogger } from './utils/logger.js';

const log = createLogger('project-manager');

// ─── Types ──────────────────────────────────────────────────

export interface ProjectSummary {
  id: string;
  name: string;
  path: string;
  color: string;
  status: ProjectStatus;
  enabled: boolean;
  scopeCount: number;
  error?: string;
}

// ─── Manager ────────────────────────────────────────────────

export class ProjectManager {
  private contexts = new Map<string, ProjectContext>();
  private routers = new Map<string, Router>();
  private healthCheckInterval: ReturnType<typeof setInterval> | null = null;

  constructor(private io: Server) {}

  // ─── Initialization ─────────────────────────────────────

  /** Initialize all enabled projects from the registry. */
  async initializeAll(): Promise<void> {
    const config = loadGlobalConfig();
    const enabledProjects = config.projects.filter(p => p.enabled);

    log.info('Initializing projects', { count: enabledProjects.length });

    for (const reg of enabledProjects) {
      try {
        await this.initializeProject(reg);
      } catch (err) {
        log.error('Failed to initialize project', {
          id: reg.id,
          path: reg.path,
          error: String(err),
        });
      }
    }

    // Start periodic health checks
    this.healthCheckInterval = setInterval(() => this.checkHealth(), 60_000);
  }

  /** Initialize a single project from its registration. */
  async initializeProject(reg: ProjectRegistration): Promise<ProjectContext | null> {
    // Verify directory exists
    if (!fs.existsSync(reg.path)) {
      log.warn('Project directory not found, marking offline', { id: reg.id, path: reg.path });
      // Store a placeholder context to track status
      return null;
    }

    const emitter = new ProjectEmitter(this.io, reg.id);

    try {
      const ctx = await createProjectContext(reg.id, reg.path, emitter);
      this.contexts.set(reg.id, ctx);

      // Build and cache the project's router
      const router = this.buildProjectRouter(ctx);
      this.routers.set(reg.id, router);

      log.info('Project initialized', {
        id: reg.id,
        name: reg.name,
        scopeCount: ctx.scopeService.getAll().length,
      });

      return ctx;
    } catch (err) {
      log.error('Project initialization failed', { id: reg.id, error: String(err) });
      return null;
    }
  }

  // ─── Context Access ─────────────────────────────────────

  /** Get a project context by ID. */
  getContext(id: string): ProjectContext | undefined {
    return this.contexts.get(id);
  }

  /** Get all active contexts. */
  getAllContexts(): Map<string, ProjectContext> {
    return this.contexts;
  }

  /** Get the router for a project. */
  getRouter(id: string): Router | undefined {
    return this.routers.get(id);
  }

  /** Get all project routers. */
  getAllRouters(): Map<string, Router> {
    return this.routers;
  }

  // ─── Project List ───────────────────────────────────────

  /** Get summary of all registered projects with live status. */
  getProjectList(): ProjectSummary[] {
    const config = loadGlobalConfig();
    return config.projects.map(reg => {
      const ctx = this.contexts.get(reg.id);
      return {
        id: reg.id,
        name: reg.name,
        path: reg.path,
        color: reg.color,
        status: ctx?.status ?? 'offline' as ProjectStatus,
        enabled: reg.enabled,
        scopeCount: ctx ? ctx.scopeService.getAll().length : 0,
        error: ctx?.error,
      };
    });
  }

  // ─── Registration ───────────────────────────────────────

  /** Register and initialize a new project. */
  async addProject(projectRoot: string, options?: { name?: string; color?: string }): Promise<ProjectSummary> {
    const reg = registerProject(projectRoot, options);
    const ctx = await this.initializeProject(reg);

    // Notify all clients
    this.io.emit('project:registered', {
      id: reg.id,
      name: reg.name,
      path: reg.path,
      color: reg.color,
    });

    return {
      id: reg.id,
      name: reg.name,
      path: reg.path,
      color: reg.color,
      status: ctx?.status ?? 'offline',
      enabled: reg.enabled,
      scopeCount: ctx ? ctx.scopeService.getAll().length : 0,
    };
  }

  /** Unregister a project and shut down its context. */
  async removeProject(idOrPath: string): Promise<boolean> {
    // Find the registration before removing
    const config = loadGlobalConfig();
    const reg = config.projects.find(p => p.id === idOrPath || p.path === idOrPath);
    if (!reg) return false;

    // Shut down context
    await this.shutdownProject(reg.id);

    // Remove from registry
    unregisterProject(idOrPath);

    // Notify clients
    this.io.emit('project:unregistered', { id: reg.id });

    return true;
  }

  /** Update project metadata (name, color, enabled). */
  async updateProject(
    id: string,
    updates: Partial<Pick<ProjectRegistration, 'name' | 'color' | 'enabled'>>,
  ): Promise<ProjectRegistration | null> {
    const result = updateProject(id, updates);
    if (!result) return null;

    // If disabling, shut down the context
    if (updates.enabled === false) {
      await this.shutdownProject(id);
    }

    // If enabling, initialize the context
    if (updates.enabled === true && !this.contexts.has(id)) {
      const reg = findProject(id);
      if (reg) await this.initializeProject(reg);
    }

    // Notify clients of metadata change
    this.io.emit('project:updated', { id, ...updates });

    return result;
  }

  // ─── Lifecycle ──────────────────────────────────────────

  /** Shut down a single project's context. */
  async shutdownProject(id: string): Promise<void> {
    const ctx = this.contexts.get(id);
    if (ctx) {
      await ctx.shutdown();
      this.contexts.delete(id);
      this.routers.delete(id);
      log.info('Project shut down', { id });
    }
  }

  /** Shut down all projects and stop health checks. */
  async shutdownAll(): Promise<void> {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    const shutdowns = [...this.contexts.entries()].map(([id, ctx]) =>
      ctx.shutdown().catch(err =>
        log.error('Error shutting down project', { id, error: String(err) }),
      ),
    );
    await Promise.all(shutdowns);
    this.contexts.clear();
    this.routers.clear();
    log.info('All projects shut down');
  }

  // ─── Health Checks ──────────────────────────────────────

  /** Periodic health check — detect projects that have gone offline or come back. */
  private async checkHealth(): Promise<void> {
    const config = loadGlobalConfig();

    for (const reg of config.projects) {
      if (!reg.enabled) continue;

      const ctx = this.contexts.get(reg.id);
      const dirExists = fs.existsSync(reg.path);

      if (ctx && !dirExists) {
        // Project went offline
        log.warn('Project directory disappeared', { id: reg.id, path: reg.path });
        await this.shutdownProject(reg.id);
        this.io.emit('project:status:changed', { id: reg.id, status: 'offline' });
      } else if (!ctx && dirExists) {
        // Project came back online (or failed to initialize previously — retry)
        log.info('Attempting to initialize project', { id: reg.id, path: reg.path });
        try {
          await this.initializeProject(reg);
          this.io.emit('project:status:changed', { id: reg.id, status: 'active' });
        } catch (err) {
          log.warn('Project initialization retry failed', { id: reg.id, error: String(err) });
        }
      }
    }
  }

  // ─── Route Building ─────────────────────────────────────

  /** Build an Express Router with all per-project routes for a context. */
  /** Build an Express Router with all per-project routes.
   *  Note: createVersionRoutes is intentionally omitted — version/update endpoints
   *  are global (they update the Orbital Command package), not per-project. */
  private buildProjectRouter(ctx: ProjectContext): Router {
    const router = Router();
    const { db, emitter, config, scopeService, gateService, deployService,
            sprintService, sprintOrchestrator, batchOrchestrator,
            readinessService, workflowService, workflowEngine,
            gitService, githubService } = ctx;

    // Scope status inference function (same logic as index.ts)
    function inferScopeStatus(
      eventType: string,
      scopeId: unknown,
      data: Record<string, unknown>,
    ): void {
      if (scopeId == null) return;
      const id = Number(scopeId);
      if (isNaN(id) || id <= 0) return;
      const current = scopeService.getById(id);
      if (current?.status === 'icebox') return;
      const currentStatus = current?.status ?? '';
      const result = workflowEngine.inferStatus(eventType, currentStatus, data);
      if (result === null) return;
      if (typeof result === 'object' && 'dispatchResolution' in result) {
        resolveActiveDispatchesForScope(db, emitter, id, result.resolution as 'completed' | 'failed');
        return;
      }
      scopeService.updateStatus(id, result, 'event');
    }

    // Project config endpoint
    router.get('/config', (_req, res) => {
      res.json({
        projectName: config.projectName,
        categories: config.categories,
        agents: config.agents,
        serverPort: config.serverPort,
        clientPort: config.clientPort,
      });
    });

    // Mount all route groups
    router.use(createScopeRoutes({
      db, io: emitter, scopeService, readinessService,
      projectRoot: config.projectRoot, projectName: config.projectName,
      engine: workflowEngine,
    }));
    router.use(createDataRoutes({
      db, io: emitter, gateService, deployService,
      engine: workflowEngine, projectRoot: config.projectRoot,
      inferScopeStatus,
    }));
    router.use(createDispatchRoutes({
      db, io: emitter, scopeService,
      projectRoot: config.projectRoot, engine: workflowEngine,
    }));
    router.use(createSprintRoutes({
      sprintService, sprintOrchestrator, batchOrchestrator,
    }));
    router.use(createWorkflowRoutes({
      workflowService, projectRoot: config.projectRoot,
    }));
    router.use(createConfigRoutes({
      projectRoot: config.projectRoot, workflowService, io: emitter,
    }));
    router.use(createGitRoutes({
      gitService, githubService, engine: workflowEngine,
    }));

    return router;
  }
}
