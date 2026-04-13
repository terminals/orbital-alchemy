import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import type Database from 'better-sqlite3';
import type { FSWatcher } from 'chokidar';
import { openProjectDatabase } from './database.js';
import { loadConfig } from './config.js';
import type { OrbitalConfig } from './config.js';
import { ProjectEmitter } from './project-emitter.js';
import { ScopeCache } from './services/scope-cache.js';
import { ScopeService } from './services/scope-service.js';
import { EventService } from './services/event-service.js';
import { GateService } from './services/gate-service.js';
import { DeployService } from './services/deploy-service.js';
import { SprintService } from './services/sprint-service.js';
import { SprintOrchestrator } from './services/sprint-orchestrator.js';
import { BatchOrchestrator } from './services/batch-orchestrator.js';
import { ReadinessService } from './services/readiness-service.js';
import { WorkflowService } from './services/workflow-service.js';
import { GitService } from './services/git-service.js';
import { GitHubService } from './services/github-service.js';
import { WorkflowEngine } from '../shared/workflow-engine.js';
import type { WorkflowConfig } from '../shared/workflow-config.js';
import defaultWorkflow from '../shared/default-workflow.json' with { type: 'json' };
import { startScopeWatcher } from './watchers/scope-watcher.js';
import { startEventWatcher } from './watchers/event-watcher.js';
import { resolveStaleDispatches, resolveActiveDispatchesForScope, resolveDispatchesByPid, resolveDispatchesByDispatchId, linkPidToDispatch, tryAutoRevertAndClear } from './utils/dispatch-utils.js';
import { syncClaudeSessionsToDB } from './services/claude-session-service.js';
import { ensureDynamicProfiles } from './utils/terminal-launcher.js';
import { createLogger } from './utils/logger.js';

const log = createLogger('project-context');

// ─── Types ──────────────────────────────────────────────────

export type ProjectStatus = 'active' | 'error' | 'offline';

interface TelemetryEnabled {
  enabled: boolean;
  uploadChangedSessions(): Promise<unknown>;
}

export interface ProjectContext {
  /** Project slug ID (derived from directory name) */
  id: string;
  /** Loaded project config */
  config: OrbitalConfig;
  /** Per-project SQLite database */
  db: Database.Database;
  /** Per-project workflow engine */
  workflowEngine: WorkflowEngine;
  /** Project-scoped socket emitter */
  emitter: ProjectEmitter;

  // Services
  scopeCache: ScopeCache;
  scopeService: ScopeService;
  eventService: EventService;
  gateService: GateService;
  deployService: DeployService;
  sprintService: SprintService;
  sprintOrchestrator: SprintOrchestrator;
  batchOrchestrator: BatchOrchestrator;
  readinessService: ReadinessService;
  workflowService: WorkflowService;
  gitService: GitService;
  githubService: GitHubService;
  telemetryService: TelemetryEnabled | null;
  telemetryRouter: import('express').Router | null;

  // Watchers
  scopeWatcher: FSWatcher;
  eventWatcher: FSWatcher;

  // Intervals (cleanup, sync, polling)
  intervals: ReturnType<typeof setInterval>[];

  // Status
  status: ProjectStatus;
  error?: string;

  // Lifecycle
  shutdown(): Promise<void>;
}

// ─── Factory ────────────────────────────────────────────────

/** Resolve the path to the bundled default workflow JSON. */
function getDefaultConfigPath(): string {
  const __selfDir = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(__selfDir, '../shared/default-workflow.json');
}

/**
 * Create a fully wired ProjectContext for a single project.
 *
 * Create a fully wired context for a single project. Each ProjectContext has its own
 * database, services, watchers, and intervals.
 */
export async function createProjectContext(
  projectId: string,
  projectRoot: string,
  emitter: ProjectEmitter,
): Promise<ProjectContext> {
  // Load project config
  const config = loadConfig(projectRoot);

  // Initialize database
  const db = openProjectDatabase(config.dbDir);

  // Initialize workflow engine
  const workflowEngine = new WorkflowEngine(defaultWorkflow as WorkflowConfig);

  // Generate shell manifest for bash hooks
  if (!fs.existsSync(config.configDir)) fs.mkdirSync(config.configDir, { recursive: true });
  const manifestPath = path.join(config.configDir, 'workflow-manifest.sh');
  fs.writeFileSync(manifestPath, workflowEngine.generateShellManifest(), 'utf-8');

  // Ensure icebox directory exists
  const iceboxDir = path.join(config.scopesDir, 'icebox');
  if (!fs.existsSync(iceboxDir)) fs.mkdirSync(iceboxDir, { recursive: true });

  // Initialize services
  const scopeCache = new ScopeCache();
  const scopeService = new ScopeService(scopeCache, emitter, config.scopesDir, workflowEngine);
  const eventService = new EventService(db, emitter);
  const gateService = new GateService(db, emitter);
  const deployService = new DeployService(db, emitter);
  const sprintService = new SprintService(db, emitter, scopeService);
  const sprintOrchestrator = new SprintOrchestrator(db, emitter, sprintService, scopeService, workflowEngine, config.projectRoot, config);
  const batchOrchestrator = new BatchOrchestrator(db, emitter, sprintService, scopeService, workflowEngine, config.projectRoot, config);
  const readinessService = new ReadinessService(scopeService, gateService, workflowEngine, config.projectRoot);
  const workflowService = new WorkflowService(config.configDir, workflowEngine, config.scopesDir, getDefaultConfigPath());
  workflowService.setSocketServer(emitter);

  // Ensure engine reflects active config (may differ from bundled default)
  workflowEngine.reload(workflowService.getActive());
  const gitService = new GitService(config.projectRoot, scopeCache);
  const githubService = new GitHubService(config.projectRoot);

  let telemetryService: TelemetryEnabled | null = null;
  let telemetryRouter: import('express').Router | null = null;
  const telemetryMod = './services/telemetry-service.js';
  try {
    const mod = await import(telemetryMod);
    telemetryService = new mod.TelemetryService(db, config.telemetry, config.projectName, config.projectRoot);
    if (telemetryService?.enabled) {
      telemetryRouter = mod.createTelemetryRoutes({ telemetryService });
    }
  } catch { /* telemetry service not installed */ }

  // Wire active-group guard
  scopeService.setActiveGroupCheck((scopeId) => sprintService.getActiveGroupForScope(scopeId));

  // Wire event inference (Fix 8: diagnostic log lines match index.ts)
  eventService.onIngest((eventType, scopeId, data) => {
    if (eventType === 'SESSION_START' && typeof data.dispatch_id === 'string' && typeof data.pid === 'number') {
      linkPidToDispatch(db, data.dispatch_id, data.pid);
      log.debug('Linked PID to dispatch', { pid: data.pid, dispatch_id: data.dispatch_id });
      return;
    }
    if (eventType === 'SCOPE_GATE_LIFTED' && scopeId != null) {
      const id = Number(scopeId);
      if (!isNaN(id) && id > 0) {
        resolveActiveDispatchesForScope(db, emitter, id, 'completed');
        log.debug('Resolved dispatches for scope gate lift', { scope_id: id });
      }
      return;
    }
    if (eventType === 'SESSION_END') {
      const outcome = data.normal_exit === true ? 'completed' : 'abandoned';
      let resolvedIds: string[] = [];
      if (typeof data.dispatch_id === 'string') {
        resolvedIds = resolveDispatchesByDispatchId(db, emitter, data.dispatch_id, outcome);
      }
      if (resolvedIds.length === 0 && typeof data.pid === 'number') {
        resolvedIds = resolveDispatchesByPid(db, emitter, data.pid, outcome);
      }
      if (resolvedIds.length > 0) log.info('Session resolved', { count: resolvedIds.length, outcome });
      // For abandoned dispatches, immediately try auto-revert so the scope
      // returns to its pre-dispatch status without requiring user interaction
      if (outcome === 'abandoned') {
        for (const eventId of resolvedIds) {
          tryAutoRevertAndClear(db, emitter, scopeService, workflowEngine, eventId);
        }
      }
      if (resolvedIds.length > 0) batchOrchestrator.resolveStaleBatches();
      return;
    }
    // Status inference
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
  });

  // Wire status change callbacks
  scopeService.onStatusChange((scopeId, newStatus) => {
    if (workflowEngine.isTerminalStatus(newStatus)) sprintOrchestrator.onScopeReachedDev(scopeId);
    batchOrchestrator.onScopeStatusChanged(scopeId, newStatus);
  });
  scopeService.onStatusChange((scopeId, newStatus) => {
    if (workflowEngine.isTerminalStatus(newStatus)) {
      resolveActiveDispatchesForScope(db, emitter, scopeId, 'completed');
    }
  });

  // Load scopes from filesystem and reconcile directory mismatches
  const scopeCount = scopeService.syncFromFilesystem();
  const reconciled = scopeService.reconcileDirectories();
  if (reconciled > 0) log.info('Reconciled scope directories', { id: projectId, count: reconciled });

  // Start watchers
  const scopeWatcher = startScopeWatcher(config.scopesDir, scopeService);
  const eventWatcher = startEventWatcher(config.eventsDir, eventService);

  // Write iTerm2 dispatch profiles (Fix 2 + Fix 5: per-project prefix)
  ensureDynamicProfiles(workflowEngine, config.terminal.profilePrefix);

  // Recover active sprints/batches
  await sprintOrchestrator.recoverActiveSprints();
  await batchOrchestrator.recoverActiveBatches();

  // Resolve stale batches on startup (Fix 6: catches stuck dispatches from previous runs)
  const staleBatchesResolved = batchOrchestrator.resolveStaleBatches();
  if (staleBatchesResolved > 0) log.info('Resolved stale batches', { count: staleBatchesResolved });

  // Resolve stale dispatches
  resolveStaleDispatches(db, emitter, scopeService, workflowEngine, config.dispatch.staleTimeoutMinutes);

  // Initial session sync + legacy purge (Fix 7)
  syncClaudeSessionsToDB(db, scopeService, config.projectRoot).then((count) => {
    if (count > 0) log.info('Synced sessions', { id: projectId, count });
    const purged = db.prepare("DELETE FROM sessions WHERE action IS NULL AND id LIKE 'claude-%'").run();
    if (purged.changes > 0) log.info('Purged legacy session rows', { count: purged.changes });
    if (telemetryService?.enabled) {
      telemetryService.uploadChangedSessions().catch(() => {});
    }
  }).catch(err => log.error('Session sync failed', { error: err.message }));

  // Start periodic intervals
  const intervals: ReturnType<typeof setInterval>[] = [];

  // Fix 11: periodic batch recovery (two-phase completion B-1)
  intervals.push(setInterval(() => {
    batchOrchestrator.recoverActiveBatches().catch(err => log.error('Batch recovery failed', { error: err.message }));
  }, 30_000));

  intervals.push(setInterval(() => {
    batchOrchestrator.resolveStaleBatches();
  }, 30_000));

  intervals.push(setInterval(() => {
    resolveStaleDispatches(db, emitter, scopeService, workflowEngine, config.dispatch.staleTimeoutMinutes);
  }, 30_000));

  intervals.push(setInterval(async () => {
    const count = await syncClaudeSessionsToDB(db, scopeService, config.projectRoot);
    if (count > 0) emitter.emit('session:updated', { type: 'resync', count });
    if (telemetryService?.enabled) {
      telemetryService.uploadChangedSessions().catch(() => {});
    }
  }, 5 * 60_000));

  let lastGitHash = '';
  intervals.push(setInterval(async () => {
    try {
      const hash = await gitService.getStatusHash();
      if (lastGitHash && hash !== lastGitHash) {
        gitService.clearCache();
        emitter.emit('git:status:changed');
      }
      lastGitHash = hash;
    } catch { /* ok */ }
  }, 10_000));

  log.info('Project ready', { id: projectId, scopes: scopeCount });

  const ctx: ProjectContext = {
    id: projectId,
    config,
    db,
    workflowEngine,
    emitter,
    scopeCache,
    scopeService,
    eventService,
    gateService,
    deployService,
    sprintService,
    sprintOrchestrator,
    batchOrchestrator,
    readinessService,
    workflowService,
    gitService,
    githubService,
    telemetryService,
    telemetryRouter,
    scopeWatcher,
    eventWatcher,
    intervals,
    status: 'active',

    async shutdown() {
      log.info('Shutting down project context', { id: projectId });
      for (const interval of intervals) clearInterval(interval);
      intervals.length = 0;
      try { await scopeWatcher.close(); } catch (e) { log.error('Scope watcher close failed', { id: projectId, error: String(e) }); }
      try { await eventWatcher.close(); } catch (e) { log.error('Event watcher close failed', { id: projectId, error: String(e) }); }
      try { db.close(); } catch (e) { log.error('DB close failed', { id: projectId, error: String(e) }); }
      ctx.status = 'offline';
    },
  };

  return ctx;
}
