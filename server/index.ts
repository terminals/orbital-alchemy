import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { openProjectDatabase } from './database.js';
import { getConfig, resetConfig } from './config.js';
import { ScopeCache } from './services/scope-cache.js';
import { ScopeService } from './services/scope-service.js';
import { EventService } from './services/event-service.js';
import { GateService } from './services/gate-service.js';
import type { GateRow } from './services/gate-service.js';
import { DeployService } from './services/deploy-service.js';
import { SprintService } from './services/sprint-service.js';
import { SprintOrchestrator } from './services/sprint-orchestrator.js';
import { BatchOrchestrator } from './services/batch-orchestrator.js';
import { ReadinessService } from './services/readiness-service.js';
import { startScopeWatcher } from './watchers/scope-watcher.js';
import { startEventWatcher } from './watchers/event-watcher.js';
import { ensureDynamicProfiles, launchInTerminal } from './utils/terminal-launcher.js';
import { syncClaudeSessionsToDB, setSessionProjectRoot, getClaudeSessions, getSessionStats } from './services/claude-session-service.js';
import { resolveStaleDispatches, resolveActiveDispatchesForScope, resolveDispatchesByPid, resolveDispatchesByDispatchId, linkPidToDispatch, getActiveScopeIds, getAbandonedScopeIds } from './utils/dispatch-utils.js';
import { createScopeRoutes } from './routes/scope-routes.js';
import { createDataRoutes } from './routes/data-routes.js';
import { createDispatchRoutes } from './routes/dispatch-routes.js';
import { createSprintRoutes } from './routes/sprint-routes.js';
import { createWorkflowRoutes } from './routes/workflow-routes.js';
import { createConfigRoutes } from './routes/config-routes.js';
import { ConfigService, isValidPrimitiveType } from './services/config-service.js';
import { GLOBAL_PRIMITIVES_DIR } from './global-config.js';
import { createGitRoutes } from './routes/git-routes.js';
import { createVersionRoutes } from './routes/version-routes.js';
import { WorkflowService } from './services/workflow-service.js';
import { GitService } from './services/git-service.js';
import { GitHubService } from './services/github-service.js';
import { WorkflowEngine } from '../shared/workflow-engine.js';
import defaultWorkflow from '../shared/default-workflow.json' with { type: 'json' };
import { getHookEnforcement } from '../shared/workflow-config.js';
import type { WorkflowConfig } from '../shared/workflow-config.js';
import { createLogger, setLogLevel } from './utils/logger.js';
import type { LogLevel } from './utils/logger.js';

import type http from 'http';
import type Database from 'better-sqlite3';

// ─── Types ──────────────────────────────────────────────────

export interface ServerOverrides {
  port?: number;
  projectRoot?: string;
}

export interface ServerInstance {
  app: express.Application;
  io: Server;
  db: Database.Database;
  workflowEngine: WorkflowEngine;
  httpServer: http.Server;
  shutdown: () => Promise<void>;
}

// ─── Server Factory ─────────────────────────────────────────

export async function startServer(overrides?: ServerOverrides): Promise<ServerInstance> {
  // Apply project root override before config loads
  if (overrides?.projectRoot) {
    process.env.ORBITAL_PROJECT_ROOT = overrides.projectRoot;
    resetConfig();
  }

  const config = getConfig();
  setSessionProjectRoot(config.projectRoot);
  const envLevel = process.env.ORBITAL_LOG_LEVEL;
  if (envLevel && ['debug', 'info', 'warn', 'error'].includes(envLevel)) {
    setLogLevel(envLevel as LogLevel);
  } else {
    setLogLevel(config.logLevel);
  }
  const log = createLogger('server');
  const port = overrides?.port ?? config.serverPort;

  const workflowEngine = new WorkflowEngine(defaultWorkflow as WorkflowConfig);

  // Generate shell manifest for bash hooks (config-driven lifecycle)
  const MANIFEST_PATH = path.join(config.configDir, 'workflow-manifest.sh');
  if (!fs.existsSync(config.configDir)) fs.mkdirSync(config.configDir, { recursive: true });
  fs.writeFileSync(MANIFEST_PATH, workflowEngine.generateShellManifest(), 'utf-8');

  const ICEBOX_DIR = path.join(config.scopesDir, 'icebox');
  // Resolve path to the bundled default workflow config.
  const __selfDir2 = path.dirname(fileURLToPath(import.meta.url));
  const DEFAULT_CONFIG_PATH = path.resolve(__selfDir2, '../shared/default-workflow.json');

  // Ensure icebox directory exists for idea files
  if (!fs.existsSync(ICEBOX_DIR)) fs.mkdirSync(ICEBOX_DIR, { recursive: true });

  const app = express();
  const httpServer = createServer(app);

  const io = new Server(httpServer, {
    cors: {
      origin: (origin, callback) => {
        // Allow all localhost origins (dev tool, not production)
        if (!origin || origin.startsWith('http://localhost:')) {
          callback(null, true);
        } else {
          callback(new Error('CORS not allowed'));
        }
      },
      methods: ['GET', 'POST'],
    },
  });

  // Middleware
  app.use(express.json());

  // Initialize database
  const db = openProjectDatabase(config.dbDir);

  // Initialize services
  const scopeCache = new ScopeCache();
  const scopeService = new ScopeService(scopeCache, io, config.scopesDir, workflowEngine);
  const eventService = new EventService(db, io);
  const gateService = new GateService(db, io);
  const deployService = new DeployService(db, io);
  const sprintService = new SprintService(db, io, scopeService);
  const sprintOrchestrator = new SprintOrchestrator(db, io, sprintService, scopeService, workflowEngine, config.projectRoot);
  const batchOrchestrator = new BatchOrchestrator(db, io, sprintService, scopeService, workflowEngine, config.projectRoot);
  const readinessService = new ReadinessService(scopeService, gateService, workflowEngine, config.projectRoot);
  const workflowService = new WorkflowService(config.configDir, workflowEngine, config.scopesDir, DEFAULT_CONFIG_PATH);
  workflowService.setSocketServer(io);

  // Ensure in-memory engine reflects the actual active config (may differ from bundled default
  // if the user applied a custom preset)
  workflowEngine.reload(workflowService.getActive());
  const gitService = new GitService(config.projectRoot, scopeCache);
  const githubService = new GitHubService(config.projectRoot);

  // Wire active-group guard into scope service (blocks manual moves for scopes in active batches/sprints)
  scopeService.setActiveGroupCheck((scopeId) => sprintService.getActiveGroupForScope(scopeId));

  // ─── Event Wiring ──────────────────────────────────────────

  function inferScopeStatus(
    eventType: string,
    scopeId: unknown,
    data: Record<string, unknown>
  ): void {
    if (scopeId == null) return;
    const id = Number(scopeId);
    if (isNaN(id) || id <= 0) return;

    // Don't infer status for icebox idea cards
    const current = scopeService.getById(id);
    if (current?.status === 'icebox') return;

    const currentStatus = current?.status ?? '';
    const result = workflowEngine.inferStatus(eventType, currentStatus, data);
    if (result === null) return;

    // Handle dispatch resolution (AGENT_COMPLETED with outcome)
    if (typeof result === 'object' && 'dispatchResolution' in result) {
      resolveActiveDispatchesForScope(
        db, io, id,
        result.resolution as 'completed' | 'failed',
      );
      return;
    }

    scopeService.updateStatus(id, result, 'event');
  }

  eventService.onIngest((eventType, scopeId, data) => {
    // Handle SESSION_START: link PID to dispatch via dispatch_id env var
    if (eventType === 'SESSION_START' && typeof data.dispatch_id === 'string' && typeof data.pid === 'number') {
      linkPidToDispatch(db, data.dispatch_id, data.pid);
      log.info('SESSION_START: linked PID to dispatch', { pid: data.pid, dispatch_id: data.dispatch_id });
      return;
    }

    // Handle SESSION_END: resolve dispatches by dispatch_id (preferred) or PID (fallback)
    if (eventType === 'SESSION_END') {
      let count = 0;
      if (typeof data.dispatch_id === 'string') {
        count = resolveDispatchesByDispatchId(db, io, data.dispatch_id);
        if (count > 0) {
          log.info('SESSION_END: resolved dispatches', { count, dispatch_id: data.dispatch_id });
        }
      }
      // PID fallback for old hooks without dispatch_id
      if (count === 0 && typeof data.pid === 'number') {
        count = resolveDispatchesByPid(db, io, data.pid);
        if (count > 0) {
          log.info('SESSION_END: resolved dispatches by PID fallback', { count, pid: data.pid });
        }
      }
      // Immediately resolve any batches/sprints whose session just ended,
      // rather than waiting for the next stale-check interval
      if (count > 0) {
        batchOrchestrator.resolveStaleBatches();
      }
      return;
    }

    inferScopeStatus(eventType, scopeId, data);
  });

  scopeService.onStatusChange((scopeId, newStatus) => {
    if (newStatus === 'dev') {
      sprintOrchestrator.onScopeReachedDev(scopeId);
    }
    // Batch orchestrator tracks all status transitions (dev, staging, production)
    batchOrchestrator.onScopeStatusChanged(scopeId, newStatus);
  });

  scopeService.onStatusChange((scopeId, newStatus) => {
    if (workflowEngine.isTerminalStatus(newStatus)) {
      resolveActiveDispatchesForScope(db, io, scopeId, 'completed');
    }
  });

  // ─── Routes ────────────────────────────────────────────────

  app.get('/api/orbital/health', (_req, res) => {
    res.json({ status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() });
  });

  // Serve dynamic config to the frontend
  app.get('/api/orbital/config', (_req, res) => {
    res.json({
      projectName: config.projectName,
      categories: config.categories,
      agents: config.agents,
      serverPort: config.serverPort,
      clientPort: config.clientPort,
    });
  });

  app.use('/api/orbital', createScopeRoutes({ db, io, scopeService, readinessService, projectRoot: config.projectRoot, projectName: config.projectName, engine: workflowEngine }));
  app.use('/api/orbital', createDataRoutes({ db, io, gateService, deployService, engine: workflowEngine, projectRoot: config.projectRoot, inferScopeStatus }));
  app.use('/api/orbital', createDispatchRoutes({ db, io, scopeService, projectRoot: config.projectRoot, engine: workflowEngine }));
  app.use('/api/orbital', createSprintRoutes({ sprintService, sprintOrchestrator, batchOrchestrator }));
  app.use('/api/orbital', createWorkflowRoutes({ workflowService, projectRoot: config.projectRoot }));
  app.use('/api/orbital', createConfigRoutes({ projectRoot: config.projectRoot, workflowService, io }));
  app.use('/api/orbital', createGitRoutes({ gitService, githubService, engine: workflowEngine }));
  app.use('/api/orbital', createVersionRoutes({ io }));

  // ─── Static File Serving (production) ───────────────────────

  // Resolve the Vite-built frontend dist directory (server/ → ../dist).
  const __selfDir = path.dirname(fileURLToPath(import.meta.url));
  const distDir = path.resolve(__selfDir, '../dist');
  if (fs.existsSync(path.join(distDir, 'index.html'))) {
    app.use(express.static(distDir));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/') || req.path.startsWith('/socket.io')) return next();
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    // Dev mode: redirect root to Vite dev server
    app.get('/', (_req, res) => res.redirect(`http://localhost:${config.clientPort}`));
  }

  // ─── Socket.io ──────────────────────────────────────────────

  io.on('connection', (socket) => {
    log.debug('Client connected', { socketId: socket.id });

    socket.on('disconnect', () => {
      log.debug('Client disconnected', { socketId: socket.id });
    });
  });

  // ─── Startup ───────────────────────────────────────────────

  // References for graceful shutdown
  let scopeWatcher: ReturnType<typeof startScopeWatcher>;
  let eventWatcher: ReturnType<typeof startEventWatcher>;
  let batchRecoveryInterval: ReturnType<typeof setInterval>;
  let staleCleanupInterval: ReturnType<typeof setInterval>;
  let sessionSyncInterval: ReturnType<typeof setInterval>;
  let gitPollInterval: ReturnType<typeof setInterval>;

  const actualPort = await new Promise<number>((resolve, reject) => {
    let attempt = 0;
    const maxAttempts = 10;

    httpServer.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE' && attempt < maxAttempts) {
        attempt++;
        const nextPort = port + attempt;
        log.warn('Port in use, trying next', { tried: port + attempt - 1, next: nextPort });
        httpServer.listen(nextPort);
      } else {
        reject(new Error(`Failed to start server: ${err.message}`));
      }
    });

    httpServer.on('listening', () => {
      const addr = httpServer.address();
      const listenPort = typeof addr === 'object' && addr ? addr.port : port;
      resolve(listenPort);
    });

    httpServer.listen(port);
  });

  // ─── Post-listen initialization ────────────────────────────

  // Sync scopes from filesystem on startup (populates in-memory cache)
  const scopeCount = scopeService.syncFromFilesystem();

  // Resolve stale dispatch events (terminal scopes + age-based)
  const staleResolved = resolveStaleDispatches(db, io, scopeService, workflowEngine);
  if (staleResolved > 0) {
    log.info('Resolved stale dispatch events', { count: staleResolved });
  }

  // Write iTerm2 dispatch profiles (idempotent, fire-and-forget)
  ensureDynamicProfiles(workflowEngine);

  // Start file watchers
  scopeWatcher = startScopeWatcher(config.scopesDir, scopeService);
  eventWatcher = startEventWatcher(config.eventsDir, eventService);

  // Recover any active sprints/batches from before server restart
  sprintOrchestrator.recoverActiveSprints().catch(err => log.error('Sprint recovery failed', { error: err.message }));
  batchOrchestrator.recoverActiveBatches().catch(err => log.error('Batch recovery failed', { error: err.message }));

  // Resolve stale batches on startup (catches stuck dispatches from previous runs)
  const staleBatchesResolved = batchOrchestrator.resolveStaleBatches();
  if (staleBatchesResolved > 0) {
    log.info('Resolved stale batches', { count: staleBatchesResolved });
  }

  // Poll active batch PIDs every 30s for two-phase completion (B-1)
  batchRecoveryInterval = setInterval(() => {
    batchOrchestrator.recoverActiveBatches().catch(err => log.error('Batch recovery failed', { error: err.message }));
  }, 30_000);

  // Periodic stale dispatch + batch cleanup (crash recovery — catches SIGKILL'd sessions)
  staleCleanupInterval = setInterval(() => {
    const count = resolveStaleDispatches(db, io, scopeService, workflowEngine);
    if (count > 0) {
      log.info('Periodic cleanup: resolved stale dispatches', { count });
    }
    const batchCount = batchOrchestrator.resolveStaleBatches();
    if (batchCount > 0) {
      log.info('Periodic cleanup: resolved stale batches', { count: batchCount });
    }
  }, 30_000);

  // Sync frontmatter-derived sessions into DB (non-blocking)
  syncClaudeSessionsToDB(db, scopeService, config.projectRoot).then((count) => {
    log.info('Synced frontmatter sessions', { count });

    // Purge legacy pattern-matched rows (no action = old regex system)
    const purged = db.prepare(
      "DELETE FROM sessions WHERE action IS NULL AND id LIKE 'claude-%'"
    ).run();
    if (purged.changes > 0) {
      log.info('Purged legacy pattern-matched session rows', { count: purged.changes });
    }
  }).catch(err => log.error('Session sync failed', { error: err.message }));

  // Re-sync every 5 minutes so new sessions appear without restart
  sessionSyncInterval = setInterval(() => {
    syncClaudeSessionsToDB(db, scopeService, config.projectRoot)
      .then((count) => {
        if (count > 0) io.emit('session:updated', { type: 'resync', count });
      })
      .catch(err => log.error('Session resync failed', { error: err.message }));
  }, 5 * 60 * 1000);

  // Poll git status every 10s — emit socket event on change
  let lastGitHash = '';
  gitPollInterval = setInterval(async () => {
    try {
      const hash = await gitService.getStatusHash();
      if (lastGitHash && hash !== lastGitHash) {
        gitService.clearCache();
        io.emit('git:status:changed');
      }
      lastGitHash = hash;
    } catch { /* ok */ }
  }, 10_000);

  // eslint-disable-next-line no-console
  console.log(`
╔══════════════════════════════════════════════════════╗
║         Orbital Command                              ║
║         ${config.projectName.padEnd(42)} ║
║                                                      ║
║  >>> Open: http://localhost:${actualPort} <<<                 ║
║                                                      ║
╠══════════════════════════════════════════════════════╣
║  Scopes:    ${String(scopeCount).padEnd(3)} loaded from filesystem          ║
║  API:       http://localhost:${actualPort}/api/orbital/*       ║
║  Socket.io: ws://localhost:${actualPort}                      ║
╚══════════════════════════════════════════════════════╝
`);

  // ─── Graceful Shutdown ─────────────────────────────────────

  let shuttingDown = false;
  function shutdown(): Promise<void> {
    if (shuttingDown) return Promise.resolve();
    shuttingDown = true;
    log.info('Shutting down');
    scopeWatcher.close();
    eventWatcher.close();
    clearInterval(batchRecoveryInterval);
    clearInterval(staleCleanupInterval);
    clearInterval(sessionSyncInterval);
    clearInterval(gitPollInterval);

    return new Promise<void>((resolve) => {
      const forceTimeout = setTimeout(() => {
        db.close();
        resolve();
      }, 2000);

      io.close(() => {
        clearTimeout(forceTimeout);
        db.close();
        resolve();
      });
    });
  }

  return { app, io, db, workflowEngine, httpServer, shutdown };
}

// ─── Central Server (multi-project) ─────────────────────────

import { ProjectManager } from './project-manager.js';
import { SyncService } from './services/sync-service.js';
import { startGlobalWatcher } from './watchers/global-watcher.js';
import { createSyncRoutes } from './routes/sync-routes.js';
import {
  ensureOrbitalHome,
  loadGlobalConfig,
  registerProject as registerProjectGlobal,
  ORBITAL_HOME,
} from './global-config.js';

export interface CentralServerOverrides {
  port?: number;
  /** If set, auto-register this project on first launch */
  autoRegisterPath?: string;
}

export interface CentralServerInstance {
  app: express.Application;
  io: Server;
  projectManager: ProjectManager;
  syncService: SyncService;
  httpServer: http.Server;
  shutdown: () => Promise<void>;
}

export async function startCentralServer(overrides?: CentralServerOverrides): Promise<CentralServerInstance> {
  ensureOrbitalHome();

  const envLevel = process.env.ORBITAL_LOG_LEVEL;
  if (envLevel && ['debug', 'info', 'warn', 'error'].includes(envLevel)) {
    setLogLevel(envLevel as LogLevel);
  }
  const log = createLogger('central');
  const port = overrides?.port ?? (Number(process.env.ORBITAL_SERVER_PORT) || 4444);

  // Auto-register current project if registry is empty
  const globalConfig = loadGlobalConfig();
  if (globalConfig.projects.length === 0 && overrides?.autoRegisterPath) {
    registerProjectGlobal(overrides.autoRegisterPath);
    log.info('Auto-registered current project', { path: overrides.autoRegisterPath });
  }

  const app = express();
  const httpServer = createServer(app);

  const io = new Server(httpServer, {
    cors: {
      origin: (origin, callback) => {
        if (!origin || origin.startsWith('http://localhost:')) {
          callback(null, true);
        } else {
          callback(new Error('CORS not allowed'));
        }
      },
      methods: ['GET', 'POST'],
    },
  });

  app.use(express.json());

  // Initialize ProjectManager and boot all registered projects
  const projectManager = new ProjectManager(io);
  await projectManager.initializeAll();

  // Initialize SyncService and global watcher
  const syncService = new SyncService();
  const globalWatcher = startGlobalWatcher(syncService, io);

  // ─── Routes ──────────────────────────────────────────────

  // Health check
  app.get('/api/orbital/health', (_req, res) => {
    res.json({ status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() });
  });

  // Project management + sync routes (top-level)
  app.use('/api/orbital', createSyncRoutes({ syncService, projectManager }));
  app.use('/api/orbital', createVersionRoutes({ io }));

  // Per-project routes — dynamic middleware that resolves :projectId
  app.use('/api/orbital/projects/:projectId', (req, res, next) => {
    const projectId = req.params.projectId;
    const router = projectManager.getRouter(projectId);
    if (!router) {
      const ctx = projectManager.getContext(projectId);
      if (!ctx) return res.status(404).json({ error: `Project '${projectId}' not found` });
      return res.status(503).json({ error: `Project '${projectId}' is offline` });
    }
    router(req, res, next);
  });

  // Aggregate endpoints
  app.get('/api/orbital/aggregate/scopes', (_req, res) => {
    const allScopes: Array<Record<string, unknown>> = [];
    for (const [projectId, ctx] of projectManager.getAllContexts()) {
      for (const scope of ctx.scopeService.getAll()) {
        allScopes.push({ ...scope, project_id: projectId });
      }
    }
    res.json(allScopes);
  });

  app.get('/api/orbital/aggregate/events', (req, res) => {
    const limit = Number(req.query.limit) || 50;
    const allEvents: Array<Record<string, unknown>> = [];
    for (const [projectId, ctx] of projectManager.getAllContexts()) {
      const events = ctx.db.prepare(
        `SELECT * FROM events ORDER BY timestamp DESC LIMIT ?`
      ).all(limit) as Array<Record<string, unknown>>;
      for (const event of events) {
        allEvents.push({ ...event, project_id: projectId });
      }
    }
    // Sort by timestamp descending across all projects
    allEvents.sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));
    res.json(allEvents.slice(0, limit));
  });

  // Aggregate sessions across all projects
  const JSON_FIELDS = ['tags', 'blocked_by', 'blocks', 'data', 'discoveries', 'next_steps', 'details'];
  function parseJsonFields(row: Record<string, unknown>): Record<string, unknown> {
    const parsed = { ...row };
    for (const field of JSON_FIELDS) {
      if (typeof parsed[field] === 'string') {
        try { parsed[field] = JSON.parse(parsed[field] as string); } catch { /* keep string */ }
      }
    }
    return parsed;
  }

  app.get('/api/orbital/aggregate/sessions', (_req, res) => {
    const allRows: Array<Record<string, unknown>> = [];
    for (const [projectId, ctx] of projectManager.getAllContexts()) {
      const rows = ctx.db.prepare(
        'SELECT * FROM sessions ORDER BY started_at DESC'
      ).all() as Array<Record<string, unknown>>;
      for (const row of rows) {
        allRows.push({ ...parseJsonFields(row), project_id: projectId });
      }
    }

    // Deduplicate by claude_session_id, aggregate scope_ids and actions
    const seen = new Map<string, Record<string, unknown>>();
    const scopeMap = new Map<string, number[]>();
    const actionMap = new Map<string, string[]>();

    for (const row of allRows) {
      const key = (row.claude_session_id as string | null) ?? (row.id as string);
      if (!seen.has(key)) {
        seen.set(key, row);
        scopeMap.set(key, []);
        actionMap.set(key, []);
      }
      const sid = row.scope_id as number | null;
      if (sid != null) {
        const arr = scopeMap.get(key)!;
        if (!arr.includes(sid)) arr.push(sid);
      }
      const action = row.action as string | null;
      if (action) {
        const actions = actionMap.get(key)!;
        if (!actions.includes(action)) actions.push(action);
      }
    }

    const results = [...seen.values()].map((row) => {
      const key = (row.claude_session_id as string | null) ?? (row.id as string);
      return { ...row, scope_ids: scopeMap.get(key) ?? [], actions: actionMap.get(key) ?? [] };
    });

    // Sort by started_at descending across all projects
    results.sort((a, b) =>
      String((b as Record<string, unknown>).started_at ?? '').localeCompare(
        String((a as Record<string, unknown>).started_at ?? ''),
      ),
    );
    res.json(results.slice(0, 50));
  });

  app.get('/api/orbital/aggregate/sessions/:id/content', async (req, res) => {
    const sessionId = req.params.id;

    // Find the session across all project databases
    let session: Record<string, unknown> | undefined;
    let matchedProjectRoot: string | undefined;
    for (const [, ctx] of projectManager.getAllContexts()) {
      const row = ctx.db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId) as Record<string, unknown> | undefined;
      if (row) {
        session = parseJsonFields(row);
        matchedProjectRoot = ctx.config.projectRoot;
        break;
      }
    }

    if (!session || !matchedProjectRoot) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    let content = '';
    let meta: Record<string, unknown> | null = null;
    let stats: Record<string, unknown> | null = null;

    if (session.claude_session_id && typeof session.claude_session_id === 'string') {
      const claudeSessions = await getClaudeSessions(undefined, matchedProjectRoot);
      const match = claudeSessions.find(s => s.id === session!.claude_session_id);
      if (match) {
        meta = {
          slug: match.slug,
          branch: match.branch,
          fileSize: match.fileSize,
          summary: match.summary,
          startedAt: match.startedAt,
          lastActiveAt: match.lastActiveAt,
        };
      }
      stats = getSessionStats(session.claude_session_id, matchedProjectRoot) as Record<string, unknown> | null;
    }

    if (!content) {
      const parts: string[] = [];
      if (session.summary) parts.push(`# ${session.summary}\n`);
      const discoveries = Array.isArray(session.discoveries) ? session.discoveries : [];
      if (discoveries.length > 0) {
        parts.push('## Completed\n');
        for (const d of discoveries) parts.push(`- ${d}`);
        parts.push('');
      }
      const nextSteps = Array.isArray(session.next_steps) ? session.next_steps : [];
      if (nextSteps.length > 0) {
        parts.push('## Next Steps\n');
        for (const n of nextSteps) parts.push(`- ${n}`);
      }
      content = parts.join('\n');
    }

    res.json({
      id: session.id,
      content,
      claude_session_id: session.claude_session_id ?? null,
      meta,
      stats,
    });
  });

  app.post('/api/orbital/aggregate/sessions/:id/resume', async (req, res) => {
    const sessionId = req.params.id;
    const { claude_session_id } = req.body as { claude_session_id?: string };

    if (!claude_session_id || !/^[0-9a-f-]{36}$/i.test(claude_session_id)) {
      res.status(400).json({ error: 'Valid claude_session_id (UUID) required' });
      return;
    }

    // Find the session's project root
    let matchedProjectRoot: string | undefined;
    for (const [, ctx] of projectManager.getAllContexts()) {
      const row = ctx.db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);
      if (row) {
        matchedProjectRoot = ctx.config.projectRoot;
        break;
      }
    }

    if (!matchedProjectRoot) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    const resumeCmd = `cd '${matchedProjectRoot}' && claude --dangerously-skip-permissions --resume '${claude_session_id}'`;
    try {
      await launchInTerminal(resumeCmd);
      res.json({ ok: true, session_id: claude_session_id });
    } catch (err) {
      res.status(500).json({ error: 'Failed to launch terminal', details: String(err) });
    }
  });

  // ─── Aggregate: Enforcement & Gates ──────────────────────

  app.get('/api/orbital/aggregate/events/violations/summary', (_req, res) => {
    try {
      const mergedByRule = new Map<string, { rule: string; count: number; last_seen: string }>();
      const mergedByFile = new Map<string, { file: string; count: number }>();
      let allOverrides: Array<{ rule: string; reason: string; date: string }> = [];
      let totalViolations = 0;
      let totalOverrides = 0;

      for (const [, ctx] of projectManager.getAllContexts()) {
        const byRule = ctx.db.prepare(
          `SELECT JSON_EXTRACT(data, '$.rule') as rule, COUNT(*) as count, MAX(timestamp) as last_seen
           FROM events WHERE type = 'VIOLATION' GROUP BY rule ORDER BY count DESC`
        ).all() as Array<{ rule: string; count: number; last_seen: string }>;
        for (const r of byRule) {
          const existing = mergedByRule.get(r.rule);
          if (existing) {
            existing.count += r.count;
            if (r.last_seen > existing.last_seen) existing.last_seen = r.last_seen;
          } else {
            mergedByRule.set(r.rule, { ...r });
          }
        }

        const byFile = ctx.db.prepare(
          `SELECT JSON_EXTRACT(data, '$.file') as file, COUNT(*) as count FROM events
           WHERE type = 'VIOLATION' AND JSON_EXTRACT(data, '$.file') IS NOT NULL AND JSON_EXTRACT(data, '$.file') != ''
           GROUP BY file ORDER BY count DESC LIMIT 20`
        ).all() as Array<{ file: string; count: number }>;
        for (const f of byFile) {
          const existing = mergedByFile.get(f.file);
          if (existing) {
            existing.count += f.count;
          } else {
            mergedByFile.set(f.file, { ...f });
          }
        }

        const overrides = ctx.db.prepare(
          `SELECT JSON_EXTRACT(data, '$.rule') as rule, JSON_EXTRACT(data, '$.reason') as reason, timestamp as date
           FROM events WHERE type = 'OVERRIDE' ORDER BY timestamp DESC LIMIT 50`
        ).all() as Array<{ rule: string; reason: string; date: string }>;
        allOverrides = allOverrides.concat(overrides);

        const tv = ctx.db.prepare(`SELECT COUNT(*) as count FROM events WHERE type = 'VIOLATION'`).get() as { count: number };
        const to = ctx.db.prepare(`SELECT COUNT(*) as count FROM events WHERE type = 'OVERRIDE'`).get() as { count: number };
        totalViolations += tv.count;
        totalOverrides += to.count;
      }

      const byRule = [...mergedByRule.values()].sort((a, b) => b.count - a.count);
      const byFile = [...mergedByFile.values()].sort((a, b) => b.count - a.count).slice(0, 20);
      allOverrides.sort((a, b) => b.date.localeCompare(a.date));

      res.json({ byRule, byFile, overrides: allOverrides.slice(0, 50), totalViolations, totalOverrides });
    } catch {
      res.status(500).json({ error: 'Failed to aggregate violations summary' });
    }
  });

  app.get('/api/orbital/aggregate/enforcement/rules', (_req, res) => {
    try {
      const hookMap = new Map<string, {
        hook: ReturnType<WorkflowEngine['getAllHooks']>[number];
        enforcement: string;
        edges: Array<{ from: string; to: string; label: string }>;
        stats: { violations: number; overrides: number; last_triggered: string | null };
      }>();
      const summary = { guards: 0, gates: 0, lifecycle: 0, observers: 0 };
      const edgeIdSet = new Set<string>();
      let totalEdges = 0;

      for (const [, ctx] of projectManager.getAllContexts()) {
        const allHooks = ctx.workflowEngine.getAllHooks();
        const allEdges = ctx.workflowEngine.getAllEdges();

        // Build edge map for this project
        const hookEdgeMap = new Map<string, Array<{ from: string; to: string; label: string }>>();
        for (const edge of allEdges) {
          const edgeKey = `${edge.from}->${edge.to}`;
          if (!edgeIdSet.has(edgeKey)) {
            edgeIdSet.add(edgeKey);
            totalEdges++;
          }
          for (const hookId of edge.hooks ?? []) {
            if (!hookEdgeMap.has(hookId)) hookEdgeMap.set(hookId, []);
            hookEdgeMap.get(hookId)!.push({ from: edge.from, to: edge.to, label: edge.label });
          }
        }

        // Query stats from this project's DB
        const violationStats = ctx.db.prepare(
          `SELECT JSON_EXTRACT(data, '$.rule') as rule, COUNT(*) as count, MAX(timestamp) as last_seen
           FROM events WHERE type = 'VIOLATION' GROUP BY rule`
        ).all() as Array<{ rule: string; count: number; last_seen: string }>;
        const overrideStats = ctx.db.prepare(
          `SELECT JSON_EXTRACT(data, '$.rule') as rule, COUNT(*) as count
           FROM events WHERE type = 'OVERRIDE' GROUP BY rule`
        ).all() as Array<{ rule: string; count: number }>;
        const violationMap = new Map(violationStats.map((v) => [v.rule, v]));
        const overrideMap = new Map(overrideStats.map((o) => [o.rule, o]));

        for (const hook of allHooks) {
          const existing = hookMap.get(hook.id);
          const projViolations = violationMap.get(hook.id)?.count ?? 0;
          const projOverrides = overrideMap.get(hook.id)?.count ?? 0;
          const projLastTriggered = violationMap.get(hook.id)?.last_seen ?? null;

          if (existing) {
            // Sum stats across projects
            existing.stats.violations += projViolations;
            existing.stats.overrides += projOverrides;
            if (projLastTriggered && (!existing.stats.last_triggered || projLastTriggered > existing.stats.last_triggered)) {
              existing.stats.last_triggered = projLastTriggered;
            }
            // Union edges
            const existingEdgeKeys = new Set(existing.edges.map((e) => `${e.from}->${e.to}`));
            for (const edge of hookEdgeMap.get(hook.id) ?? []) {
              if (!existingEdgeKeys.has(`${edge.from}->${edge.to}`)) {
                existing.edges.push(edge);
              }
            }
          } else {
            // First time seeing this hook — count it in summary
            if (hook.category === 'guard') summary.guards++;
            else if (hook.category === 'gate') summary.gates++;
            else if (hook.category === 'lifecycle') summary.lifecycle++;
            else if (hook.category === 'observer') summary.observers++;

            hookMap.set(hook.id, {
              hook,
              enforcement: getHookEnforcement(hook),
              edges: hookEdgeMap.get(hook.id) ?? [],
              stats: {
                violations: projViolations,
                overrides: projOverrides,
                last_triggered: projLastTriggered,
              },
            });
          }
        }
      }

      res.json({ summary, rules: [...hookMap.values()], totalEdges });
    } catch {
      res.status(500).json({ error: 'Failed to aggregate enforcement rules' });
    }
  });

  app.get('/api/orbital/aggregate/events/violations/trend', (req, res) => {
    try {
      const days = Number(req.query.days) || 30;
      const merged = new Map<string, { day: string; rule: string; count: number }>();

      for (const [, ctx] of projectManager.getAllContexts()) {
        const trend = ctx.db.prepare(
          `SELECT date(timestamp) as day, JSON_EXTRACT(data, '$.rule') as rule, COUNT(*) as count
           FROM events WHERE type = 'VIOLATION' AND timestamp >= datetime('now', ? || ' days')
           GROUP BY day, rule ORDER BY day ASC`
        ).all(`-${days}`) as Array<{ day: string; rule: string; count: number }>;
        for (const t of trend) {
          const key = `${t.day}:${t.rule}`;
          const existing = merged.get(key);
          if (existing) {
            existing.count += t.count;
          } else {
            merged.set(key, { ...t });
          }
        }
      }

      const result = [...merged.values()].sort((a, b) => a.day.localeCompare(b.day));
      res.json(result);
    } catch {
      res.status(500).json({ error: 'Failed to aggregate violation trends' });
    }
  });

  app.get('/api/orbital/aggregate/gates', (req, res) => {
    try {
      const scopeId = req.query.scope_id;
      const filterProjectId = req.query.project_id as string | undefined;
      const mergedGates = new Map<string, GateRow & { project_id: string }>();

      for (const [projectId, ctx] of projectManager.getAllContexts()) {
        if (filterProjectId && projectId !== filterProjectId) continue;
        const gates = scopeId
          ? ctx.gateService.getLatestForScope(Number(scopeId))
          : ctx.gateService.getLatestRun();
        for (const gate of gates) {
          const existing = mergedGates.get(gate.gate_name);
          if (!existing || gate.run_at > existing.run_at) {
            mergedGates.set(gate.gate_name, { ...gate, project_id: projectId });
          }
        }
      }

      res.json([...mergedGates.values()]);
    } catch {
      res.status(500).json({ error: 'Failed to aggregate gates' });
    }
  });

  app.get('/api/orbital/aggregate/gates/stats', (_req, res) => {
    try {
      const merged = new Map<string, { gate_name: string; total: number; passed: number; failed: number }>();

      for (const [, ctx] of projectManager.getAllContexts()) {
        const stats = ctx.gateService.getStats();
        for (const s of stats) {
          const existing = merged.get(s.gate_name);
          if (existing) {
            existing.total += s.total;
            existing.passed += s.passed;
            existing.failed += s.failed;
          } else {
            merged.set(s.gate_name, { ...s });
          }
        }
      }

      res.json([...merged.values()]);
    } catch {
      res.status(500).json({ error: 'Failed to aggregate gate stats' });
    }
  });

  // ─── Aggregate: Git & GitHub ───────────────────────────────

  app.get('/api/orbital/aggregate/git/overview', async (_req, res) => {
    try {
      const projects = projectManager.getProjectList();
      const results = await Promise.allSettled(
        projects.filter(p => p.enabled && p.status === 'active').map(async (proj) => {
          const ctx = projectManager.getContext(proj.id);
          if (!ctx) throw new Error('Project offline');
          const config = ctx.workflowEngine.getConfig();
          const overview = await ctx.gitService.getOverview(config.branchingMode ?? 'trunk');
          return {
            projectId: proj.id,
            projectName: proj.name,
            projectColor: proj.color,
            status: 'ok' as const,
            overview,
          };
        }),
      );

      const overviews = results.map((r, i) => {
        if (r.status === 'fulfilled') return r.value;
        const proj = projects.filter(p => p.enabled && p.status === 'active')[i];
        return {
          projectId: proj.id,
          projectName: proj.name,
          projectColor: proj.color,
          status: 'error' as const,
          error: String((r as PromiseRejectedResult).reason),
        };
      });

      res.json(overviews);
    } catch {
      res.status(500).json({ error: 'Failed to aggregate git overviews' });
    }
  });

  app.get('/api/orbital/aggregate/git/commits', async (req, res) => {
    try {
      const limit = Number(req.query.limit) || 50;
      const projects = projectManager.getProjectList().filter(p => p.enabled && p.status === 'active');

      const results = await Promise.allSettled(
        projects.map(async (proj) => {
          const ctx = projectManager.getContext(proj.id);
          if (!ctx) return [];
          const commits = await ctx.gitService.getCommits({ limit });
          return commits.map(c => ({
            ...c,
            project_id: proj.id,
            projectName: proj.name,
            projectColor: proj.color,
          }));
        }),
      );

      const allCommits: Array<Record<string, unknown>> = [];
      for (const r of results) {
        if (r.status === 'fulfilled') allCommits.push(...r.value);
      }
      allCommits.sort((a, b) => String(b.date).localeCompare(String(a.date)));
      res.json(allCommits.slice(0, limit));
    } catch {
      res.status(500).json({ error: 'Failed to aggregate commits' });
    }
  });

  app.get('/api/orbital/aggregate/github/prs', async (_req, res) => {
    try {
      const projects = projectManager.getProjectList().filter(p => p.enabled && p.status === 'active');

      const results = await Promise.allSettled(
        projects.map(async (proj) => {
          const ctx = projectManager.getContext(proj.id);
          if (!ctx) return [];
          const prs = await ctx.githubService.getOpenPRs();
          return prs.map(pr => ({
            ...pr,
            project_id: proj.id,
            projectName: proj.name,
            projectColor: proj.color,
          }));
        }),
      );

      const allPrs: Array<Record<string, unknown>> = [];
      for (const r of results) {
        if (r.status === 'fulfilled') allPrs.push(...r.value);
      }
      allPrs.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
      res.json(allPrs);
    } catch {
      res.status(500).json({ error: 'Failed to aggregate PRs' });
    }
  });

  app.get('/api/orbital/aggregate/git/health', async (_req, res) => {
    try {
      const projects = projectManager.getProjectList().filter(p => p.enabled && p.status === 'active');

      const results = await Promise.allSettled(
        projects.map(async (proj) => {
          const ctx = projectManager.getContext(proj.id);
          if (!ctx) throw new Error('offline');
          const branches = await ctx.gitService.getBranches();
          const config = ctx.workflowEngine.getConfig();
          const listsWithBranch = config.lists.filter(l => l.gitBranch).sort((a, b) => a.order - b.order);
          const driftPairs: Array<{ from: string; to: string }> = [];
          for (let i = 0; i < listsWithBranch.length - 1; i++) {
            driftPairs.push({ from: listsWithBranch[i].gitBranch!, to: listsWithBranch[i + 1].gitBranch! });
          }
          const drift = driftPairs.length > 0 ? await ctx.gitService.getDrift(driftPairs) : [];
          const maxDrift = Math.max(0, ...drift.map(d => d.count));
          const staleBranches = branches.filter(b => b.isStale && !b.isRemote);

          return {
            projectId: proj.id,
            projectName: proj.name,
            projectColor: proj.color,
            branchCount: branches.filter(b => !b.isRemote).length,
            staleBranchCount: staleBranches.length,
            featureBranchCount: branches.filter(b => !b.isRemote && /(?:feat|fix|scope)[/-]/.test(b.name)).length,
            maxDriftSeverity: maxDrift === 0 ? 'clean' : maxDrift <= 5 ? 'low' : maxDrift <= 20 ? 'moderate' : 'high',
          };
        }),
      );

      const health: Array<Record<string, unknown>> = [];
      for (const r of results) {
        if (r.status === 'fulfilled') health.push(r.value);
      }
      res.json(health);
    } catch {
      res.status(500).json({ error: 'Failed to aggregate branch health' });
    }
  });

  app.get('/api/orbital/aggregate/git/activity', async (req, res) => {
    try {
      const days = Number(req.query.days) || 30;
      const projects = projectManager.getProjectList().filter(p => p.enabled && p.status === 'active');

      const results = await Promise.allSettled(
        projects.map(async (proj) => {
          const ctx = projectManager.getContext(proj.id);
          if (!ctx) return { projectId: proj.id, series: [] };
          const series = await ctx.gitService.getActivitySeries(days);
          return { projectId: proj.id, projectName: proj.name, projectColor: proj.color, series };
        }),
      );

      const activity: Array<Record<string, unknown>> = [];
      for (const r of results) {
        if (r.status === 'fulfilled') activity.push(r.value);
      }
      res.json(activity);
    } catch {
      res.status(500).json({ error: 'Failed to aggregate activity' });
    }
  });

  app.get('/api/orbital/aggregate/scopes/:id/readiness', (req, res) => {
    const scopeId = Number(req.params.id);
    const projectId = req.query.project_id as string | undefined;

    for (const [pid, ctx] of projectManager.getAllContexts()) {
      if (projectId && pid !== projectId) continue;
      const scope = ctx.scopeService.getById(scopeId);
      if (scope) {
        const readiness = ctx.readinessService.getReadiness(scopeId);
        if (readiness) {
          res.json(readiness);
          return;
        }
      }
    }
    res.status(404).json({ error: 'Scope not found in any project' });
  });

  app.get('/api/orbital/aggregate/dispatch/active-scopes', (_req, res) => {
    const allActive: Array<{ scope_id: number; project_id: string }> = [];
    const seenActive = new Set<string>();
    const allAbandoned: Array<{ scope_id: number; project_id: string; from_status: string | null; abandoned_at: string }> = [];
    const seenAbandoned = new Set<string>();

    for (const [projectId, ctx] of projectManager.getAllContexts()) {
      const activeIds = getActiveScopeIds(ctx.db, ctx.scopeService, ctx.workflowEngine);
      for (const id of activeIds) {
        const key = `${projectId}::${id}`;
        if (!seenActive.has(key)) {
          seenActive.add(key);
          allActive.push({ scope_id: id, project_id: projectId });
        }
      }

      const abandoned = getAbandonedScopeIds(ctx.db, ctx.scopeService, ctx.workflowEngine, activeIds);
      for (const entry of abandoned) {
        const key = `${projectId}::${entry.scope_id}`;
        if (!seenAbandoned.has(key)) {
          seenAbandoned.add(key);
          allAbandoned.push({ ...entry, project_id: projectId });
        }
      }
    }

    res.json({ scope_ids: allActive, abandoned_scopes: allAbandoned });
  });

  app.get('/api/orbital/aggregate/dispatch/active', (req, res) => {
    const scopeId = Number(req.query.scope_id);
    if (isNaN(scopeId) || scopeId <= 0) {
      res.status(400).json({ error: 'Valid scope_id query param required' });
      return;
    }

    for (const [, ctx] of projectManager.getAllContexts()) {
      const scope = ctx.scopeService.getById(scopeId);
      if (!scope) continue;

      const active = ctx.db.prepare(
        `SELECT id, timestamp, JSON_EXTRACT(data, '$.command') as command
         FROM events
         WHERE type = 'DISPATCH' AND scope_id = ? AND JSON_EXTRACT(data, '$.resolved') IS NULL
         ORDER BY timestamp DESC LIMIT 1`
      ).get(scopeId) as { id: string; timestamp: string; command: string } | undefined;

      res.json({ active: active ?? null });
      return;
    }

    res.json({ active: null });
  });

  // ─── Aggregate: Config Primitives (Global) ────────────────
  // In aggregate mode, config reads/writes target ~/.orbital/primitives/
  // Writes propagate to all synced (non-overridden) projects via SyncService.

  const globalConfigService = new ConfigService(GLOBAL_PRIMITIVES_DIR);

  app.get('/api/orbital/aggregate/config/:type/tree', (req, res) => {
    const type = req.params.type;
    if (!isValidPrimitiveType(type)) {
      res.status(400).json({ success: false, error: `Invalid type "${type}". Must be one of: agents, skills, hooks` });
      return;
    }
    try {
      const basePath = path.join(GLOBAL_PRIMITIVES_DIR, type);
      const tree = globalConfigService.scanDirectory(basePath);
      res.json({ success: true, data: tree });
    } catch {
      res.status(500).json({ success: false, error: 'Failed to read global config tree' });
    }
  });

  app.get('/api/orbital/aggregate/config/:type/file', (req, res) => {
    const type = req.params.type;
    if (!isValidPrimitiveType(type)) {
      res.status(400).json({ success: false, error: `Invalid type "${type}". Must be one of: agents, skills, hooks` });
      return;
    }
    const filePath = req.query.path as string | undefined;
    if (!filePath) { res.status(400).json({ success: false, error: 'path query parameter is required' }); return; }

    try {
      const basePath = path.join(GLOBAL_PRIMITIVES_DIR, type);
      const content = globalConfigService.readFile(basePath, filePath);
      res.json({ success: true, data: { path: filePath, content } });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const status = msg.includes('traversal') ? 403 : msg.includes('ENOENT') || msg.includes('not found') ? 404 : 500;
      res.status(status).json({ success: false, error: msg });
    }
  });

  app.put('/api/orbital/aggregate/config/:type/file', (req, res) => {
    const type = req.params.type;
    if (!isValidPrimitiveType(type)) {
      res.status(400).json({ success: false, error: `Invalid type "${type}". Must be one of: agents, skills, hooks` });
      return;
    }
    const { path: filePath, content } = req.body as { path?: string; content?: string };
    if (!filePath || content === undefined) {
      res.status(400).json({ success: false, error: 'path and content are required' });
      return;
    }

    try {
      const basePath = path.join(GLOBAL_PRIMITIVES_DIR, type);
      globalConfigService.writeFile(basePath, filePath, content);
      // Propagate to all synced projects
      const relativePath = path.join(type, filePath);
      const result = syncService.propagateGlobalChange(relativePath);
      io.emit(`config:${type}:changed`, { action: 'updated', path: filePath, global: true });
      res.json({ success: true, propagation: result });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const status = msg.includes('traversal') ? 403 : msg.includes('not found') ? 404 : 500;
      res.status(status).json({ success: false, error: msg });
    }
  });

  // ─── Static File Serving ─────────────────────────────────

  const __selfDir = path.dirname(fileURLToPath(import.meta.url));
  const distDir = path.resolve(__selfDir, '../dist');
  const hasBuiltFrontend = fs.existsSync(path.join(distDir, 'index.html'));
  if (hasBuiltFrontend) {
    app.use(express.static(distDir));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/') || req.path.startsWith('/socket.io')) return next();
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    app.get('/', (_req, res) => res.redirect(`http://localhost:4445`));
  }

  // ─── Socket.io ───────────────────────────────────────────

  io.on('connection', (socket) => {
    log.debug('Client connected', { socketId: socket.id });

    socket.on('subscribe', (payload: { projectId?: string; scope?: string }) => {
      if (payload.scope === 'all') {
        socket.join('all-projects');
      } else if (payload.projectId) {
        socket.join(`project:${payload.projectId}`);
      }
    });

    socket.on('unsubscribe', (payload: { projectId?: string; scope?: string }) => {
      if (payload.scope === 'all') {
        socket.leave('all-projects');
      } else if (payload.projectId) {
        socket.leave(`project:${payload.projectId}`);
      }
    });

    socket.on('disconnect', () => {
      log.debug('Client disconnected', { socketId: socket.id });
    });
  });

  // ─── Start Listening ─────────────────────────────────────

  const actualPort = await new Promise<number>((resolve, reject) => {
    let attempt = 0;
    const maxAttempts = 10;

    httpServer.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE' && attempt < maxAttempts) {
        attempt++;
        httpServer.listen(port + attempt);
      } else {
        reject(new Error(`Failed to start server: ${err.message}`));
      }
    });

    httpServer.on('listening', () => {
      const addr = httpServer.address();
      resolve(typeof addr === 'object' && addr ? addr.port : port);
    });

    httpServer.listen(port);
  });

  const projectList = projectManager.getProjectList();
  const projectLines = projectList.map(p =>
    `║  ${p.status === 'active' ? '●' : '○'} ${p.name.padEnd(20)} ${String(p.scopeCount).padStart(3)} scopes    ${p.status.padEnd(8)} ║`
  ).join('\n');

  // eslint-disable-next-line no-console
  console.log(`
╔══════════════════════════════════════════════════════╗
║         Orbital Command — Central Server             ║
║                                                      ║
║  >>> Open: http://localhost:${hasBuiltFrontend ? actualPort : 4445} <<<                 ║
║                                                      ║
╠══════════════════════════════════════════════════════╣
${projectLines}
╠══════════════════════════════════════════════════════╣
║  API:       http://localhost:${actualPort}/api/orbital/*       ║
║  Socket.io: ws://localhost:${actualPort}                      ║
║  Home:      ${ORBITAL_HOME.padEnd(39)} ║
╚══════════════════════════════════════════════════════╝
`);

  // ─── Graceful Shutdown ───────────────────────────────────

  let shuttingDown = false;
  async function shutdown(): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info('Shutting down central server');

    if (globalWatcher) await globalWatcher.close();
    await projectManager.shutdownAll();

    return new Promise<void>((resolve) => {
      const forceTimeout = setTimeout(resolve, 2000);
      io.close(() => {
        clearTimeout(forceTimeout);
        resolve();
      });
    });
  }

  return { app, io, projectManager, syncService, httpServer, shutdown };
}

// ─── Direct Execution (backward compat: tsx watch server/index.ts) ───

const isDirectRun = process.argv[1] && (
  process.argv[1].endsWith('server/index.ts') ||
  process.argv[1].endsWith('server/index.js') ||
  process.argv[1].endsWith('server')
);

if (isDirectRun) {
  startServer().then(({ shutdown }) => {
    process.on('SIGINT', async () => {
      await shutdown();
      process.exit(0);
    });
    process.on('SIGTERM', async () => {
      await shutdown();
      process.exit(0);
    });
  }).catch((err) => {
    createLogger('server').error('Failed to start server', { error: err.message });
    process.exit(1);
  });
}
