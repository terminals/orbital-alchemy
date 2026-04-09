import { Router } from 'express';
import { execFile } from 'child_process';
import path from 'path';
import { promisify } from 'util';
import type Database from 'better-sqlite3';
import type { Emitter } from '../project-emitter.js';
import type { EventService } from '../services/event-service.js';
import type { GateService } from '../services/gate-service.js';
import type { DeployService } from '../services/deploy-service.js';
import type { GitService } from '../services/git-service.js';
import type { WorkflowEngine } from '../../shared/workflow-engine.js';
import { getHookEnforcement } from '../../shared/workflow-config.js';
import { getClaudeSessions, getSessionStats, type SessionStats } from '../services/claude-session-service.js';
import { launchInTerminal } from '../utils/terminal-launcher.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('server');

const execFileAsync = promisify(execFile);

const JSON_FIELDS = ['tags', 'blocked_by', 'blocks', 'data', 'discoveries', 'next_steps', 'details'];

type Row = Record<string, unknown>;

function parseJsonFields(row: Row): Row {
  const parsed = { ...row };
  for (const field of JSON_FIELDS) {
    if (typeof parsed[field] === 'string') {
      try { parsed[field] = JSON.parse(parsed[field] as string); } catch { /* keep string */ }
    }
  }
  return parsed;
}

// ─── Route Factory ──────────────────────────────────────────

interface DataRouteDeps {
  db: Database.Database;
  io: Emitter;
  eventService: EventService;
  gateService: GateService;
  deployService: DeployService;
  gitService: GitService;
  engine: WorkflowEngine;
  projectRoot: string;
  inferScopeStatus: (type: string, scopeId: unknown, data: Record<string, unknown>) => void;
}

export function createDataRoutes({
  db, io, eventService, gateService, deployService, gitService, engine, projectRoot, inferScopeStatus,
}: DataRouteDeps): Router {
  const router = Router();

  // ─── Event Routes ──────────────────────────────────────────

  router.get('/events', (req, res) => {
    const limit = Number(req.query.limit) || 50;
    const type = req.query.type as string | undefined;
    const scopeId = req.query.scope_id ? Number(req.query.scope_id) : undefined;
    const events = eventService.getFiltered({ limit, type, scopeId }) as unknown as Row[];
    res.json(events.map(parseJsonFields));
  });

  router.post('/events', (req, res) => {
    const { id, type, scope_id, session_id, agent, data, timestamp } = req.body;

    if (!type || typeof type !== 'string') {
      res.status(400).json({ error: 'type must be a non-empty string' });
      return;
    }
    if (scope_id != null && (!Number.isInteger(scope_id) || scope_id <= 0)) {
      res.status(400).json({ error: 'scope_id must be a positive integer or null' });
      return;
    }

    const eventId = id || crypto.randomUUID();
    const ts = timestamp || new Date().toISOString();
    const eventData = data ?? {};

    db.prepare(
      `INSERT OR IGNORE INTO events (id, type, scope_id, session_id, agent, data, timestamp)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(eventId, type, scope_id ?? null, session_id ?? null, agent ?? null, JSON.stringify(eventData), ts);

    const event = { id: eventId, type, scope_id, session_id, agent, data: eventData, timestamp: ts };
    io.emit('event:new', event);

    inferScopeStatus(type, scope_id ?? eventData.scope_id, eventData);

    res.status(201).json(event);
  });

  // ─── Violations Summary ──────────────────────────────────

  router.get('/events/violations/summary', (_req, res) => {
    try {
      res.json(eventService.getViolationSummary());
    } catch (err) {
      log.error('Violations summary failed', { error: String(err) });
      res.status(500).json({ error: 'Failed to query violations summary' });
    }
  });

  // ─── Enforcement Rules ───────────────────────────────────────

  router.get('/enforcement/rules', (_req, res) => {
    try {
      const allHooks = engine.getAllHooks();
      const allEdges = engine.getAllEdges();

      // Build edge map: hookId → edges it's attached to
      const hookEdgeMap = new Map<string, Array<{ from: string; to: string; label: string }>>();
      for (const edge of allEdges) {
        for (const hookId of edge.hooks ?? []) {
          if (!hookEdgeMap.has(hookId)) hookEdgeMap.set(hookId, []);
          hookEdgeMap.get(hookId)!.push({ from: edge.from, to: edge.to, label: edge.label });
        }
      }

      const { violations: violationMap, overrides: overrideMap } = eventService.getViolationStatsByRule();

      // Build summary counts
      const summary = { guards: 0, gates: 0, lifecycle: 0, observers: 0 };
      for (const hook of allHooks) {
        if (hook.category === 'guard') summary.guards++;
        else if (hook.category === 'gate') summary.gates++;
        else if (hook.category === 'lifecycle') summary.lifecycle++;
        else if (hook.category === 'observer') summary.observers++;
      }

      const rules = allHooks.map((hook) => ({
        hook,
        enforcement: getHookEnforcement(hook),
        edges: hookEdgeMap.get(hook.id) ?? [],
        stats: {
          violations: violationMap.get(hook.id)?.count ?? 0,
          overrides: overrideMap.get(hook.id)?.count ?? 0,
          last_triggered: violationMap.get(hook.id)?.last_seen ?? null,
        },
      }));

      res.json({ summary, rules, totalEdges: allEdges.length });
    } catch (err) {
      log.error('Enforcement rules failed', { error: String(err) });
      res.status(500).json({ error: 'Failed to query enforcement rules' });
    }
  });

  // ─── Violation Trends ──────────────────────────────────────

  router.get('/events/violations/trend', (req, res) => {
    try {
      const days = Math.max(1, Math.min(365, Number(req.query.days) || 30));
      res.json(eventService.getViolationTrend(days));
    } catch (err) {
      log.error('Violation trends failed', { error: String(err) });
      res.status(500).json({ error: 'Failed to query violation trends' });
    }
  });

  // ─── Gate Routes ───────────────────────────────────────────

  router.get('/gates', (req, res) => {
    const scopeId = req.query.scope_id;
    if (scopeId) {
      res.json(gateService.getLatestForScope(Number(scopeId)));
    } else {
      res.json(gateService.getLatestRun());
    }
  });

  router.get('/gates/trend', (req, res) => {
    const limit = Number(req.query.limit) || 30;
    res.json(gateService.getTrend(limit));
  });

  router.get('/gates/stats', (_req, res) => {
    res.json(gateService.getStats());
  });

  router.post('/gates', (req, res) => {
    const { scope_id, gate_name, status, details, duration_ms, commit_sha } = req.body;

    const VALID_GATE_STATUSES = ['pass', 'fail', 'running', 'skipped'];
    if (!gate_name || typeof gate_name !== 'string') {
      res.status(400).json({ error: 'gate_name must be a non-empty string' });
      return;
    }
    if (status && !VALID_GATE_STATUSES.includes(status)) {
      res.status(400).json({ error: `status must be one of: ${VALID_GATE_STATUSES.join(', ')}` });
      return;
    }

    gateService.record({ scope_id, gate_name, status, details, duration_ms, commit_sha });
    res.status(201).json({ ok: true });
  });

  // ─── Deployment Routes ─────────────────────────────────────

  router.get('/deployments', (_req, res) => {
    res.json((deployService.getRecent() as unknown as Row[]).map(parseJsonFields));
  });

  router.get('/deployments/latest', (_req, res) => {
    res.json((deployService.getLatestPerEnv() as unknown as Row[]).map(parseJsonFields));
  });

  router.post('/deployments', (req, res) => {
    const VALID_ENVIRONMENTS = ['staging', 'production'];
    if (req.body.environment && !VALID_ENVIRONMENTS.includes(req.body.environment)) {
      res.status(400).json({ error: `environment must be one of: ${VALID_ENVIRONMENTS.join(', ')}` });
      return;
    }
    const id = deployService.record(req.body);
    res.status(201).json({ id });
  });

  router.patch('/deployments/:id', (req, res) => {
    const id = Number(req.params.id);
    const { status, details } = req.body;
    if (!status) {
      res.status(400).json({ error: 'status is required' });
      return;
    }
    deployService.updateStatus(id, status, details);
    res.json({ ok: true });
  });

  router.get('/pipeline/drift', async (_req, res) => {
    try {
      res.json(await gitService.getPipelineDrift());
    } catch (err) {
      res.status(500).json({ error: 'Failed to compute drift', details: String(err) });
    }
  });

  router.get('/deployments/frequency', (_req, res) => {
    try {
      res.json(eventService.getDeployFrequency());
    } catch (err) {
      log.error('Deploy frequency query failed', { error: String(err) });
      res.status(500).json({ error: 'Failed to query deployment frequency' });
    }
  });

  // ─── Session Routes ────────────────────────────────────────

  router.get('/sessions', (_req, res) => {
    const rows = (db.prepare('SELECT * FROM sessions ORDER BY started_at DESC').all() as Row[])
      .map(parseJsonFields);

    const seen = new Map<string, Record<string, unknown>>();
    const scopeMap = new Map<string, number[]>();
    const actionMap = new Map<string, string[]>();

    for (const row of rows) {
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

    res.json(results.slice(0, 50));
  });

  // ─── Scope Sessions ───────────────────────────────────────

  router.get('/scopes/:id/sessions', (req, res) => {
    const scopeId = Number(req.params.id);
    const sessions = db.prepare('SELECT * FROM sessions WHERE scope_id = ? ORDER BY started_at DESC')
      .all(scopeId) as Row[];
    res.json(sessions.map(parseJsonFields));
  });

  router.get('/sessions/:id/content', async (req, res) => {
    const session = db.prepare('SELECT * FROM sessions WHERE id = ?')
      .get(req.params.id) as Row | undefined;

    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    const parsed = parseJsonFields(session);
    let content = '';
    let meta: Record<string, unknown> | null = null;
    let stats: SessionStats | null = null;

    if (parsed.claude_session_id && typeof parsed.claude_session_id === 'string') {
      const claudeSessions = await getClaudeSessions(undefined, projectRoot);
      const match = claudeSessions.find(s => s.id === parsed.claude_session_id);
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
      stats = getSessionStats(parsed.claude_session_id as string, projectRoot);
    }

    if (!content) {
      const parts: string[] = [];
      if (parsed.summary) parts.push(`# ${parsed.summary}\n`);
      const discoveries = Array.isArray(parsed.discoveries) ? parsed.discoveries : [];
      if (discoveries.length > 0) {
        parts.push('## Completed\n');
        for (const d of discoveries) parts.push(`- ${d}`);
        parts.push('');
      }
      const nextSteps = Array.isArray(parsed.next_steps) ? parsed.next_steps : [];
      if (nextSteps.length > 0) {
        parts.push('## Next Steps\n');
        for (const n of nextSteps) parts.push(`- ${n}`);
      }
      content = parts.join('\n');
    }

    res.json({
      id: parsed.id,
      content,
      claude_session_id: parsed.claude_session_id ?? null,
      meta,
      stats,
    });
  });

  router.post('/sessions/:id/resume', async (req, res) => {
    const { claude_session_id } = req.body as { claude_session_id?: string };

    if (!claude_session_id || !/^[0-9a-f-]{36}$/i.test(claude_session_id)) {
      res.status(400).json({ error: 'Valid claude_session_id (UUID) required' });
      return;
    }

    const resumeCmd = `cd '${projectRoot}' && claude --dangerously-skip-permissions --resume '${claude_session_id}'`;

    try {
      await launchInTerminal(resumeCmd);
      res.json({ ok: true, session_id: claude_session_id });
    } catch (err) {
      res.status(500).json({ error: 'Failed to launch terminal', details: String(err) });
    }
  });


  // ─── Git Status ────────────────────────────────────────────
  router.get('/git/status', async (_req, res) => {
    try {
      const [branchResult, statusResult] = await Promise.all([
        execFileAsync('git', ['branch', '--show-current'], { cwd: projectRoot }),
        execFileAsync('git', ['status', '--porcelain'], { cwd: projectRoot }),
      ]);
      const branch = branchResult.stdout.trim();
      const dirty = statusResult.stdout.trim().length > 0;
      let detached = false;
      if (!branch) {
        detached = true;
      }
      res.json({ branch: branch || '(detached)', dirty, detached });
    } catch (err) {
      res.status(500).json({ error: 'Failed to get git status', details: String(err) });
    }
  });

  router.get('/worktrees', async (_req, res) => {
    try {
      const { stdout } = await execFileAsync('git', ['worktree', 'list', '--porcelain'], { cwd: projectRoot });
      const worktrees: Array<{ path: string; branch: string; head: string }> = [];
      let current: { path: string; branch: string; head: string } = { path: '', branch: '', head: '' };
      for (const line of stdout.split('\n')) {
        if (line.startsWith('worktree ')) {
          if (current.path) worktrees.push(current);
          current = { path: line.slice(9), branch: '', head: '' };
        } else if (line.startsWith('HEAD ')) {
          current.head = line.slice(5);
        } else if (line.startsWith('branch ')) {
          current.branch = line.slice(7);
        } else if (line === '') {
          if (current.path) worktrees.push(current);
          current = { path: '', branch: '', head: '' };
        }
      }
      if (current.path) worktrees.push(current);
      res.json(worktrees);
    } catch (err) {
      res.status(500).json({ error: 'Failed to list worktrees', details: String(err) });
    }
  });

  // ─── Open File ──────────────────────────────────────────────

  router.post('/open-file', (req, res) => {
    const filePath = (req.query.path as string) || '';
    if (!filePath || filePath.includes('..')) {
      res.status(400).json({ error: 'Invalid path' });
      return;
    }
    const absolute = path.resolve(projectRoot, filePath);
    const resolvedRoot = path.resolve(projectRoot) + path.sep;
    if (!absolute.startsWith(resolvedRoot)) {
      res.status(400).json({ error: 'Path escapes project root' });
      return;
    }
    execFile('open', [absolute], (err) => {
      if (err) {
        res.status(500).json({ error: 'Failed to open file' });
        return;
      }
      res.json({ ok: true });
    });
  });

  return router;
}
