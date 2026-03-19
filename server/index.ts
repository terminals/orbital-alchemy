import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import fs from 'fs';
import { getDatabase, closeDatabase } from './database.js';
import { getConfig } from './config.js';
import { ScopeCache } from './services/scope-cache.js';
import { ScopeService } from './services/scope-service.js';
import { EventService } from './services/event-service.js';
import { GateService } from './services/gate-service.js';
import { DeployService } from './services/deploy-service.js';
import { SprintService } from './services/sprint-service.js';
import { SprintOrchestrator } from './services/sprint-orchestrator.js';
import { BatchOrchestrator } from './services/batch-orchestrator.js';
import { ReadinessService } from './services/readiness-service.js';
import { startScopeWatcher } from './watchers/scope-watcher.js';
import { startEventWatcher } from './watchers/event-watcher.js';
import { ensureDynamicProfiles } from './utils/terminal-launcher.js';
import { syncClaudeSessionsToDB } from './services/claude-session-service.js';
import { resolveStaleDispatches, resolveActiveDispatchesForScope, resolveDispatchesByPid } from './utils/dispatch-utils.js';
import { createScopeRoutes } from './routes/scope-routes.js';
import { createDataRoutes } from './routes/data-routes.js';
import { createDispatchRoutes } from './routes/dispatch-routes.js';
import { createSprintRoutes } from './routes/sprint-routes.js';
import { createWorkflowRoutes } from './routes/workflow-routes.js';
import { createConfigRoutes } from './routes/config-routes.js';
import { createGitRoutes } from './routes/git-routes.js';
import { WorkflowService } from './services/workflow-service.js';
import { GitService } from './services/git-service.js';
import { GitHubService } from './services/github-service.js';
import { WorkflowEngine } from '../shared/workflow-engine.js';
import defaultWorkflow from '../shared/default-workflow.json' with { type: 'json' };
import type { WorkflowConfig } from '../shared/workflow-config.js';

// Load configuration
const config = getConfig();

const workflowEngine = new WorkflowEngine(defaultWorkflow as WorkflowConfig);

// Generate shell manifest for bash hooks (config-driven lifecycle)
const MANIFEST_PATH = path.join(config.configDir, 'workflow-manifest.sh');
if (!fs.existsSync(config.configDir)) fs.mkdirSync(config.configDir, { recursive: true });
fs.writeFileSync(MANIFEST_PATH, workflowEngine.generateShellManifest(), 'utf-8');

const ICEBOX_DIR = path.join(config.scopesDir, 'icebox');
const DEFAULT_CONFIG_PATH = path.resolve(import.meta.dirname, '../shared/default-workflow.json');

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
const db = getDatabase();

// Initialize services
const scopeCache = new ScopeCache();
const scopeService = new ScopeService(scopeCache, io, config.scopesDir, workflowEngine);
const eventService = new EventService(db, io);
const gateService = new GateService(db, io);
const deployService = new DeployService(db, io);
const sprintService = new SprintService(db, io, scopeService);
const sprintOrchestrator = new SprintOrchestrator(db, io, sprintService, scopeService, workflowEngine);
const batchOrchestrator = new BatchOrchestrator(db, io, sprintService, scopeService, workflowEngine);
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

eventService.onIngest((eventType, scopeId, data) => {
  // Handle SESSION_END: resolve all dispatches linked to the exiting PID
  if (eventType === 'SESSION_END' && typeof data.pid === 'number') {
    const count = resolveDispatchesByPid(db, io, data.pid);
    if (count > 0) {
      // eslint-disable-next-line no-console
      console.log(`[Orbital] SESSION_END: resolved ${count} dispatch(es) for PID ${data.pid}`);
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

app.get('/', (_req, res) => res.redirect(`http://localhost:${config.clientPort}`));

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

app.use('/api/orbital', createScopeRoutes({ db, io, scopeService, readinessService, projectRoot: config.projectRoot, engine: workflowEngine }));
app.use('/api/orbital', createDataRoutes({ db, io, gateService, deployService, engine: workflowEngine, projectRoot: config.projectRoot, inferScopeStatus }));
app.use('/api/orbital', createDispatchRoutes({ db, io, scopeService, projectRoot: config.projectRoot, engine: workflowEngine }));
app.use('/api/orbital', createSprintRoutes({ sprintService, sprintOrchestrator, batchOrchestrator }));
app.use('/api/orbital', createWorkflowRoutes({ workflowService, projectRoot: config.projectRoot }));
app.use('/api/orbital', createConfigRoutes({ projectRoot: config.projectRoot, workflowService, io }));
app.use('/api/orbital', createGitRoutes({ gitService, githubService, engine: workflowEngine }));

// ─── Socket.io ──────────────────────────────────────────────

io.on('connection', (socket) => {
  // eslint-disable-next-line no-console
  console.log(`[Orbital] Client connected: ${socket.id}`);

  socket.on('disconnect', () => {
    // eslint-disable-next-line no-console
    console.log(`[Orbital] Client disconnected: ${socket.id}`);
  });
});

// ─── Event-Driven Status Inference ────────────────────────

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

// ─── Startup ───────────────────────────────────────────────

/**
 * Try to listen on the configured port. If EADDRINUSE, increment and retry
 * (up to 10 attempts), matching Vite's port-conflict behavior.
 */
function startListening(port: number, maxAttempts = 10): void {
  let attempt = 0;

  httpServer.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE' && attempt < maxAttempts) {
      attempt++;
      const nextPort = port + attempt;
      // eslint-disable-next-line no-console
      console.log(`[Orbital] Port ${port + attempt - 1} is in use, trying ${nextPort}...`);
      httpServer.listen(nextPort);
    } else {
      // eslint-disable-next-line no-console
      console.error(`[Orbital] Failed to start server:`, err.message);
      process.exit(1);
    }
  });

  httpServer.listen(port);
}

// Module-level references for graceful shutdown
let scopeWatcher: ReturnType<typeof startScopeWatcher>;
let eventWatcher: ReturnType<typeof startEventWatcher>;
let batchRecoveryInterval: ReturnType<typeof setInterval>;
let staleCleanupInterval: ReturnType<typeof setInterval>;
let sessionSyncInterval: ReturnType<typeof setInterval>;
let gitPollInterval: ReturnType<typeof setInterval>;

startListening(config.serverPort);

httpServer.on('listening', () => {
  const addr = httpServer.address();
  const actualPort = typeof addr === 'object' && addr ? addr.port : config.serverPort;
  // Sync scopes from filesystem on startup (populates in-memory cache)
  const scopeCount = scopeService.syncFromFilesystem();

  // Resolve stale dispatch events (terminal scopes + age-based)
  const staleResolved = resolveStaleDispatches(db, io, scopeService, workflowEngine);
  if (staleResolved > 0) {
    // eslint-disable-next-line no-console
    console.log(`[Orbital] Resolved ${staleResolved} stale dispatch events`);
  }

  // Write iTerm2 dispatch profiles (idempotent, fire-and-forget)
  ensureDynamicProfiles();

  // Start file watchers
  scopeWatcher = startScopeWatcher(config.scopesDir, scopeService);
  eventWatcher = startEventWatcher(config.eventsDir, eventService);
  // Recover any active sprints/batches from before server restart
  sprintOrchestrator.recoverActiveSprints().catch(err => console.error('[Orbital] Sprint recovery failed:', err.message));
  batchOrchestrator.recoverActiveBatches().catch(err => console.error('[Orbital] Batch recovery failed:', err.message));

  // Resolve stale batches on startup (catches stuck dispatches from previous runs)
  const staleBatchesResolved = batchOrchestrator.resolveStaleBatches();
  if (staleBatchesResolved > 0) {
    // eslint-disable-next-line no-console
    console.log(`[Orbital] Resolved ${staleBatchesResolved} stale batch(es)`);
  }

  // Poll active batch PIDs every 30s for two-phase completion (B-1)
  batchRecoveryInterval = setInterval(() => {
    batchOrchestrator.recoverActiveBatches().catch(err => console.error('[Orbital] Batch recovery failed:', err.message));
  }, 30_000);

  // Periodic stale dispatch + batch cleanup (crash recovery — catches SIGKILL'd sessions)
  staleCleanupInterval = setInterval(() => {
    const count = resolveStaleDispatches(db, io, scopeService, workflowEngine);
    if (count > 0) {
      // eslint-disable-next-line no-console
      console.log(`[Orbital] Periodic cleanup: resolved ${count} stale dispatch(es)`);
    }
    const batchCount = batchOrchestrator.resolveStaleBatches();
    if (batchCount > 0) {
      // eslint-disable-next-line no-console
      console.log(`[Orbital] Periodic cleanup: resolved ${batchCount} stale batch(es)`);
    }
  }, 2 * 60 * 1000);

  // Sync frontmatter-derived sessions into DB (non-blocking)
  syncClaudeSessionsToDB(db, scopeService).then((count) => {
    // eslint-disable-next-line no-console
    console.log(`[Orbital] Synced ${count} frontmatter sessions`);

    // Purge legacy pattern-matched rows (no action = old regex system)
    const purged = db.prepare(
      "DELETE FROM sessions WHERE action IS NULL AND id LIKE 'claude-%'"
    ).run();
    if (purged.changes > 0) {
      // eslint-disable-next-line no-console
      console.log(`[Orbital] Purged ${purged.changes} legacy pattern-matched session rows`);
    }
  }).catch(err => console.error('[Orbital] Session sync failed:', err.message));

  // Re-sync every 5 minutes so new sessions appear without restart
  sessionSyncInterval = setInterval(() => {
    syncClaudeSessionsToDB(db, scopeService)
      .then((count) => {
        if (count > 0) io.emit('session:updated', { type: 'resync', count });
      })
      .catch(err => console.error('[Orbital] Session resync failed:', err.message));
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
║  >>> Open: http://localhost:${config.clientPort} <<<                 ║
║                                                      ║
╠══════════════════════════════════════════════════════╣
║  Scopes:    ${String(scopeCount).padEnd(3)} loaded from filesystem          ║
║  API:       http://localhost:${actualPort}/api/orbital/*       ║
║  Socket.io: ws://localhost:${actualPort}                      ║
╚══════════════════════════════════════════════════════╝
`);
});

let shuttingDown = false;
function gracefulShutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  // eslint-disable-next-line no-console
  console.log('[Orbital] Shutting down...');
  scopeWatcher.close();
  eventWatcher.close();
  clearInterval(batchRecoveryInterval);
  clearInterval(staleCleanupInterval);
  clearInterval(sessionSyncInterval);
  clearInterval(gitPollInterval);
  io.close(() => {
    closeDatabase();
    process.exit(0);
  });
  // Force exit if server doesn't close within 2s
  setTimeout(() => {
    closeDatabase();
    process.exit(0);
  }, 2000);
}

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

export { app, io, db, workflowEngine };
