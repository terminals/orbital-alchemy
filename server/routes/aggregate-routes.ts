import { Router } from 'express';
import path from 'path';
import type { Server } from 'socket.io';
import type { GateRow } from '../services/gate-service.js';
import { launchInTerminal } from '../utils/terminal-launcher.js';
import { buildClaudeFlags } from '../utils/flag-builder.js';
import { DEFAULT_DISPATCH_FLAGS, DEFAULT_DISPATCH_CONFIG, validateDispatchFlags, validateDispatchConfig } from '../../shared/api-types.js';
import type { DispatchFlags, DispatchConfig } from '../../shared/api-types.js';
import { getClaudeSessions, getSessionStats } from '../services/claude-session-service.js';
import { getActiveScopeIds, getAbandonedScopeIds } from '../utils/dispatch-utils.js';
import { ConfigService, isValidPrimitiveType } from '../services/config-service.js';
import { GLOBAL_PRIMITIVES_DIR } from '../global-config.js';
import { WorkflowEngine } from '../../shared/workflow-engine.js';
import { getHookEnforcement } from '../../shared/workflow-config.js';
import type { CcHookParsed } from '../../shared/workflow-config.js';
import { parseCcHooks } from '../utils/cc-hooks-parser.js';
import { createLogger } from '../utils/logger.js';
import { parseJsonFields } from '../utils/json-fields.js';
import type { ProjectManager } from '../project-manager.js';
import type { SyncService } from '../services/sync-service.js';
import { loadManifest, refreshFileStatuses, summarizeManifest } from '../manifest.js';
import { getPackageVersion } from '../utils/package-info.js';
import { runUpdate } from '../init.js';
import {
  loadGlobalConfig,
  saveGlobalConfig,
} from '../global-config.js';

const log = createLogger('aggregate');

interface AggregateRouteDeps {
  projectManager: ProjectManager;
  io: Server;
  syncService: SyncService;
}

export function createAggregateRoutes({ projectManager, io, syncService }: AggregateRouteDeps): Router {
  const router = Router();

  // ─── Aggregate: Scopes & Events ──────────────────────────

  router.get('/aggregate/scopes', (_req, res) => {
    const allScopes: Array<Record<string, unknown>> = [];
    for (const [projectId, ctx] of projectManager.getAllContexts()) {
      for (const scope of ctx.scopeService.getAll()) {
        allScopes.push({ ...scope, project_id: projectId });
      }
    }
    res.json(allScopes);
  });

  router.get('/aggregate/sprints', (_req, res) => {
    const allSprints: Array<Record<string, unknown>> = [];
    for (const [projectId, ctx] of projectManager.getAllContexts()) {
      for (const sprint of ctx.sprintService.getAll()) {
        allSprints.push({ ...sprint, project_id: projectId });
      }
    }
    res.json(allSprints);
  });

  router.get('/aggregate/events', (req, res) => {
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
  router.get('/aggregate/sessions', (_req, res) => {
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

  router.get('/aggregate/sessions/:id/content', async (req, res) => {
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

  router.post('/aggregate/sessions/:id/resume', async (req, res) => {
    const sessionId = req.params.id;
    const { claude_session_id } = req.body as { claude_session_id?: string };

    if (!claude_session_id || !/^[0-9a-f-]{36}$/i.test(claude_session_id)) {
      res.status(400).json({ error: 'Valid claude_session_id (UUID) required' });
      return;
    }

    // Find the session's project root and config
    let matchedProjectRoot: string | undefined;
    let matchedConfig: import('../config.js').OrbitalConfig | undefined;
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

  router.get('/aggregate/events/violations/summary', (_req, res) => {
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

  router.get('/aggregate/enforcement/rules', (_req, res) => {
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

  // GET /aggregate/workflow/claude-hooks — union of CC hooks across all projects
  router.get('/aggregate/workflow/claude-hooks', (_req, res) => {
    try {
      const allHooks: CcHookParsed[] = [];
      for (const [, ctx] of projectManager.getAllContexts()) {
        const settingsPath = path.join(ctx.config.projectRoot, '.claude/settings.local.json');
        allHooks.push(...parseCcHooks(settingsPath));
      }
      res.json({ success: true, data: allHooks });
    } catch (err) {
      log.error('Aggregate claude-hooks failed', { error: String(err) });
      res.status(500).json({ success: false, error: String(err) });
    }
  });

  router.get('/aggregate/events/violations/trend', (req, res) => {
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

  router.get('/aggregate/gates', (req, res) => {
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

  router.get('/aggregate/gates/stats', (_req, res) => {
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

  router.get('/aggregate/git/overview', async (_req, res) => {
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

  router.get('/aggregate/git/commits', async (req, res) => {
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

  router.get('/aggregate/github/prs', async (_req, res) => {
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

  router.get('/aggregate/git/health', async (_req, res) => {
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

  router.get('/aggregate/git/activity', async (req, res) => {
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

  router.get('/aggregate/scopes/:id/readiness', (req, res) => {
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

  router.get('/aggregate/dispatch/active-scopes', (_req, res) => {
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

  router.get('/aggregate/dispatch/active', (req, res) => {
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

  router.get('/aggregate/manifest/status', (_req, res) => {
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

  router.post('/aggregate/manifest/update-all', (_req, res) => {
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

  router.get('/aggregate/config/dispatch-flags', (_req, res) => {
    const global = loadGlobalConfig();
    res.json({ success: true, data: global.dispatchFlags ?? DEFAULT_DISPATCH_FLAGS });
  });

  router.put('/aggregate/config/dispatch-flags', (req, res) => {
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

  router.get('/aggregate/config/dispatch-settings', (_req, res) => {
    const global = loadGlobalConfig();
    res.json({
      success: true,
      data: { ...(global.dispatch ?? DEFAULT_DISPATCH_CONFIG), terminalAdapter: global.terminalAdapter ?? 'auto' },
    });
  });

  router.put('/aggregate/config/dispatch-settings', (req, res) => {
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

  router.get('/aggregate/config/:type/tree', (req, res) => {
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

  router.get('/aggregate/config/:type/file', (req, res) => {
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

  router.put('/aggregate/config/:type/file', (req, res) => {
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

  return router;
}
