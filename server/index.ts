import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import type { GateRow } from './services/gate-service.js';
import { launchInTerminal } from './utils/terminal-launcher.js';
import { buildClaudeFlags } from './utils/flag-builder.js';
import { DEFAULT_DISPATCH_FLAGS, DEFAULT_DISPATCH_CONFIG, validateDispatchFlags, validateDispatchConfig } from '../shared/api-types.js';
import type { DispatchFlags, DispatchConfig } from '../shared/api-types.js';
import { getClaudeSessions, getSessionStats } from './services/claude-session-service.js';
import { getActiveScopeIds, getAbandonedScopeIds } from './utils/dispatch-utils.js';
import { ConfigService, isValidPrimitiveType } from './services/config-service.js';
import { GLOBAL_PRIMITIVES_DIR } from './global-config.js';
import { createVersionRoutes } from './routes/version-routes.js';
import { WorkflowEngine } from '../shared/workflow-engine.js';
import { getHookEnforcement } from '../shared/workflow-config.js';
import { createLogger, setLogLevel } from './utils/logger.js';
import type { LogLevel } from './utils/logger.js';

import type http from 'http';

// ─── Central Server ─────────────────────────────────────────

import { ProjectManager } from './project-manager.js';
import { SyncService } from './services/sync-service.js';
import { startGlobalWatcher } from './watchers/global-watcher.js';
import { createSyncRoutes } from './routes/sync-routes.js';
import { seedGlobalPrimitives, runUpdate } from './init.js';
import { loadManifest, refreshFileStatuses, summarizeManifest } from './manifest.js';
import { getPackageVersion } from './utils/package-info.js';
import {
  ensureOrbitalHome,
  loadGlobalConfig,
  saveGlobalConfig,
  registerProject as registerProjectGlobal,
  ORBITAL_HOME,
} from './global-config.js';

export interface CentralServerOverrides {
  port?: number;
  clientPort?: number;
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
  const clientPort = overrides?.clientPort ?? (Number(process.env.ORBITAL_CLIENT_PORT) || 4445);

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

  // Seed global primitives if empty (lazy fallback for first launch)
  const globalPrimitivesEmpty = ['agents', 'skills', 'hooks'].every(t => {
    const dir = path.join(GLOBAL_PRIMITIVES_DIR, t);
    return !fs.existsSync(dir) || fs.readdirSync(dir).filter(f => !f.startsWith('.')).length === 0;
  });
  if (globalPrimitivesEmpty) {
    seedGlobalPrimitives();
    log.info('Seeded global primitives from package templates');
  }

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

    // Find the session's project root and config
    let matchedProjectRoot: string | undefined;
    let matchedConfig: import('./config.js').OrbitalConfig | undefined;
    for (const [, ctx] of projectManager.getAllContexts()) {
      const row = ctx.db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);
      if (row) {
        matchedProjectRoot = ctx.config.projectRoot;
        matchedConfig = ctx.config;
        break;
      }
    }

    if (!matchedProjectRoot || !matchedConfig) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    const flagsStr = buildClaudeFlags(matchedConfig.claude.dispatchFlags);
    const resumeCmd = `cd '${matchedProjectRoot}' && claude ${flagsStr} --resume '${claude_session_id}'`;
    try {
      await launchInTerminal(resumeCmd);
      res.json({ ok: true, session_id: claude_session_id });
    } catch (err) {
      log.error('Terminal launch failed', { error: String(err) });
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
    } catch (err) {
      log.error('Violations summary failed', { error: String(err) });
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
    } catch (err) {
      log.error('Enforcement rules failed', { error: String(err) });
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
    } catch (err) {
      log.error('Violation trends failed', { error: String(err) });
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
    } catch (err) {
      log.error('Gates aggregation failed', { error: String(err) });
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
    } catch (err) {
      log.error('Gate stats failed', { error: String(err) });
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
    } catch (err) {
      log.error('Git overviews failed', { error: String(err) });
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
    } catch (err) {
      log.error('Commits aggregation failed', { error: String(err) });
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
    } catch (err) {
      log.error('PRs aggregation failed', { error: String(err) });
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
    } catch (err) {
      log.error('Branch health failed', { error: String(err) });
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
    } catch (err) {
      log.error('Activity aggregation failed', { error: String(err) });
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

  // ─── Aggregate: Manifest Health ────────────────────────────

  app.get('/api/orbital/aggregate/manifest/status', (_req, res) => {
    try {
      const projects = projectManager.getProjectList().filter(p => p.enabled);
      const pkgVersion = getPackageVersion();

      const projectOverviews = projects.map((proj) => {
        const ctx = projectManager.getContext(proj.id);
        if (!ctx) {
          return {
            projectId: proj.id,
            projectName: proj.name,
            projectColor: proj.color,
            status: 'error' as const,
            manifest: null,
            error: 'Project offline',
          };
        }

        try {
          const manifest = loadManifest(ctx.config.projectRoot);
          if (!manifest) {
            return {
              projectId: proj.id,
              projectName: proj.name,
              projectColor: proj.color,
              status: 'no-manifest' as const,
              manifest: null,
            };
          }

          const claudeDir = path.join(ctx.config.projectRoot, '.claude');
          refreshFileStatuses(manifest, claudeDir);
          const summary = summarizeManifest(manifest);

          return {
            projectId: proj.id,
            projectName: proj.name,
            projectColor: proj.color,
            status: 'ok' as const,
            manifest: {
              exists: true,
              packageVersion: pkgVersion,
              installedVersion: manifest.packageVersion,
              needsUpdate: manifest.packageVersion !== pkgVersion,
              preset: manifest.preset,
              files: summary,
              lastUpdated: manifest.updatedAt,
            },
          };
        } catch (err) {
          return {
            projectId: proj.id,
            projectName: proj.name,
            projectColor: proj.color,
            status: 'error' as const,
            manifest: null,
            error: String(err),
          };
        }
      });

      const projectsUpToDate = projectOverviews.filter(p => p.status === 'ok' && !p.manifest?.needsUpdate).length;
      const projectsOutdated = projectOverviews.filter(p => p.status === 'ok' && p.manifest?.needsUpdate).length;
      const noManifest = projectOverviews.filter(p => p.status === 'no-manifest').length;
      const totalOutdated = projectOverviews.reduce((sum, p) => sum + (p.manifest?.files.outdated ?? 0), 0);
      const totalModified = projectOverviews.reduce((sum, p) => sum + (p.manifest?.files.modified ?? 0), 0);
      const totalPinned = projectOverviews.reduce((sum, p) => sum + (p.manifest?.files.pinned ?? 0), 0);
      const totalMissing = projectOverviews.reduce((sum, p) => sum + (p.manifest?.files.missing ?? 0), 0);
      const totalSynced = projectOverviews.reduce((sum, p) => sum + (p.manifest?.files.synced ?? 0), 0);
      const totalUserOwned = projectOverviews.reduce((sum, p) => sum + (p.manifest?.files.userOwned ?? 0), 0);

      res.json({
        total: projects.length,
        projectsUpToDate,
        projectsOutdated,
        noManifest,
        totalOutdated,
        totalModified,
        totalPinned,
        totalMissing,
        totalSynced,
        totalUserOwned,
        projects: projectOverviews,
      });
    } catch (err) {
      log.error('Manifest status failed', { error: String(err) });
      res.status(500).json({ error: 'Failed to aggregate manifest status' });
    }
  });

  app.post('/api/orbital/aggregate/manifest/update-all', (_req, res) => {
    try {
      const projects = projectManager.getProjectList().filter(p => p.enabled);
      const pkgVersion = getPackageVersion();
      const results: Array<{ projectId: string; success: boolean; error?: string }> = [];

      for (const proj of projects) {
        const ctx = projectManager.getContext(proj.id);
        if (!ctx) {
          results.push({ projectId: proj.id, success: false, error: 'Project offline' });
          continue;
        }

        const manifest = loadManifest(ctx.config.projectRoot);
        if (!manifest) continue; // uninitialized — skip

        // Refresh statuses and check if there's anything to update
        const claudeDir = path.join(ctx.config.projectRoot, '.claude');
        refreshFileStatuses(manifest, claudeDir);
        const manifestSummary = summarizeManifest(manifest);
        if (manifest.packageVersion === pkgVersion && manifestSummary.outdated === 0 && manifestSummary.missing === 0) {
          continue; // fully up to date
        }

        try {
          runUpdate(ctx.config.projectRoot, { dryRun: false });
          ctx.emitter.emit('manifest:changed', { action: 'updated' });
          results.push({ projectId: proj.id, success: true });
        } catch (err) {
          results.push({ projectId: proj.id, success: false, error: String(err) });
        }
      }

      res.json({ success: true, results });
    } catch (err) {
      log.error('Update all projects failed', { error: String(err) });
      res.status(500).json({ error: 'Failed to update all projects' });
    }
  });

  // ─── Global: Dispatch Config ────────────────────────────────
  // Dispatch settings are global — stored in ~/.orbital/config.json.
  // Changes propagate to all active projects' in-memory config.

  app.get('/api/orbital/aggregate/config/dispatch-flags', (_req, res) => {
    const global = loadGlobalConfig();
    res.json({ success: true, data: global.dispatchFlags ?? DEFAULT_DISPATCH_FLAGS });
  });

  app.put('/api/orbital/aggregate/config/dispatch-flags', (req, res) => {
    const updates = req.body as Partial<DispatchFlags>;
    const error = validateDispatchFlags(updates);
    if (error) { res.status(400).json({ success: false, error }); return; }
    const global = loadGlobalConfig();
    const merged: DispatchFlags = { ...(global.dispatchFlags ?? DEFAULT_DISPATCH_FLAGS), ...updates };
    global.dispatchFlags = merged;
    saveGlobalConfig(global);
    for (const [, ctx] of projectManager.getAllContexts()) {
      ctx.config.claude.dispatchFlags = merged;
    }
    res.json({ success: true, data: merged });
  });

  app.get('/api/orbital/aggregate/config/dispatch-settings', (_req, res) => {
    const global = loadGlobalConfig();
    res.json({
      success: true,
      data: { ...(global.dispatch ?? DEFAULT_DISPATCH_CONFIG), terminalAdapter: global.terminalAdapter ?? 'auto' },
    });
  });

  app.put('/api/orbital/aggregate/config/dispatch-settings', (req, res) => {
    const { terminalAdapter, ...dispatchUpdates } = req.body as Partial<DispatchConfig> & { terminalAdapter?: string };
    const error = validateDispatchConfig({ ...dispatchUpdates, terminalAdapter });
    if (error) { res.status(400).json({ success: false, error }); return; }
    const global = loadGlobalConfig();
    const mergedDispatch: DispatchConfig = { ...(global.dispatch ?? DEFAULT_DISPATCH_CONFIG), ...dispatchUpdates };
    global.dispatch = mergedDispatch;
    if (terminalAdapter) global.terminalAdapter = terminalAdapter;
    saveGlobalConfig(global);
    for (const [, ctx] of projectManager.getAllContexts()) {
      ctx.config.dispatch = mergedDispatch;
      if (terminalAdapter) ctx.config.terminal.adapter = terminalAdapter as typeof ctx.config.terminal.adapter;
    }
    res.json({ success: true, data: { ...mergedDispatch, terminalAdapter: global.terminalAdapter ?? 'auto' } });
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
    } catch (err) {
      log.error('Config tree read failed', { type, error: String(err) });
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
  const devMode = clientPort !== port;
  const hasBuiltFrontend = !devMode && fs.existsSync(path.join(distDir, 'index.html'));
  if (hasBuiltFrontend) {
    app.use(express.static(distDir));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/') || req.path.startsWith('/socket.io')) return next();
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    app.get('/', (_req, res) => res.redirect(`http://localhost:${clientPort}`));
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

  // ─── Error Handling Middleware ─────────────────────────────
  // Catches unhandled errors thrown from route handlers.

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    log.error('Unhandled route error', { error: err.message, stack: err.stack });
    if (!res.headersSent) {
      res.status(500).json({ ok: false, error: 'Internal server error' });
    }
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

  const dashboardPort = devMode ? clientPort : actualPort;

  // eslint-disable-next-line no-console
  console.log(`
╔══════════════════════════════════════════════════════╗
║         Orbital Command — Central Server             ║
║                                                      ║
║  >>> Open: http://localhost:${String(dashboardPort).padEnd(25)} <<<║
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
  const projectRoot = process.env.ORBITAL_PROJECT_ROOT || process.cwd();
  startCentralServer({
    port: Number(process.env.ORBITAL_SERVER_PORT) || 4444,
    autoRegisterPath: projectRoot,
  }).then(({ shutdown }) => {
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
