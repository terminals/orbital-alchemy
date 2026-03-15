import { Router } from 'express';
import { execFile } from 'child_process';
import { promisify } from 'util';
import type Database from 'better-sqlite3';
import type { Server } from 'socket.io';
import type { GateService } from '../services/gate-service.js';
import type { DeployService } from '../services/deploy-service.js';
import { getClaudeSessions } from '../services/claude-session-service.js';
import { launchInTerminal } from '../utils/terminal-launcher.js';

const execFileAsync = promisify(execFile);

// ─── Types & Helpers ────────────────────────────────────────

interface DriftCommit { sha: string; message: string; author: string; date: string }
interface BranchHead { sha: string; date: string; message: string }
interface PipelineDriftData {
  devToStaging: { count: number; commits: DriftCommit[]; oldestDate: string | null };
  stagingToMain: { count: number; commits: DriftCommit[]; oldestDate: string | null };
  heads: { dev: BranchHead; staging: BranchHead; main: BranchHead };
}

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

function parseDriftCommits(raw: string): DriftCommit[] {
  if (!raw) return [];
  return raw.split('\n').map((line) => {
    const [sha, date, message, author] = line.split('|');
    return { sha, date, message: message ?? '', author: author ?? '' };
  });
}

function parseHead(raw: string): BranchHead {
  const [sha, date, message] = raw.split('|');
  return { sha: sha ?? '', date: date ?? '', message: message ?? '' };
}

// ─── Route Factory ──────────────────────────────────────────

interface DataRouteDeps {
  db: Database.Database;
  io: Server;
  gateService: GateService;
  deployService: DeployService;
  projectRoot: string;
  inferScopeStatus: (type: string, scopeId: unknown, data: Record<string, unknown>) => void;
}

export function createDataRoutes({
  db, io, gateService, deployService, projectRoot, inferScopeStatus,
}: DataRouteDeps): Router {
  const router = Router();

  // ─── Pipeline Drift (cached) ─────────────────────────────

  let driftCache: { data: PipelineDriftData; ts: number } | null = null;
  const DRIFT_CACHE_MS = 60_000;

  async function gitLog(args: string[]): Promise<string> {
    const { stdout } = await execFileAsync('git', args, { cwd: projectRoot });
    return stdout.trim();
  }

  async function computeDrift(): Promise<PipelineDriftData> {
    if (driftCache && Date.now() - driftCache.ts < DRIFT_CACHE_MS) return driftCache.data;

    const [devToStagingRaw, stagingToMainRaw, devHead, stagingHead, mainHead] =
      await Promise.all([
        gitLog(['log', 'origin/dev', '--not', 'origin/staging', '--reverse', '--format=%H|%aI|%s|%an']),
        gitLog(['log', 'origin/staging', '--not', 'origin/main', '--reverse', '--format=%H|%aI|%s|%an']),
        gitLog(['log', 'origin/dev', '-1', '--format=%H|%aI|%s']),
        gitLog(['log', 'origin/staging', '-1', '--format=%H|%aI|%s']),
        gitLog(['log', 'origin/main', '-1', '--format=%H|%aI|%s']),
      ]);

    const devToStaging = parseDriftCommits(devToStagingRaw);
    const stagingToMain = parseDriftCommits(stagingToMainRaw);

    const data: PipelineDriftData = {
      devToStaging: {
        count: devToStaging.length,
        commits: devToStaging,
        oldestDate: devToStaging[0]?.date ?? null,
      },
      stagingToMain: {
        count: stagingToMain.length,
        commits: stagingToMain,
        oldestDate: stagingToMain[0]?.date ?? null,
      },
      heads: {
        dev: parseHead(devHead),
        staging: parseHead(stagingHead),
        main: parseHead(mainHead),
      },
    };

    driftCache = { data, ts: Date.now() };
    return data;
  }

  // ─── Event Routes ──────────────────────────────────────────

  router.get('/events', (req, res) => {
    const limit = Number(req.query.limit) || 50;
    const type = req.query.type as string | undefined;

    const events = (type
      ? db.prepare('SELECT * FROM events WHERE type = ? ORDER BY timestamp DESC LIMIT ?').all(type, limit)
      : db.prepare('SELECT * FROM events ORDER BY timestamp DESC LIMIT ?').all(limit)
    ) as Row[];
    res.json(events.map(parseJsonFields));
  });

  router.post('/events', (req, res) => {
    const { id, type, scope_id, session_id, agent, data, timestamp } = req.body;
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
      const byRule = db.prepare(
        `SELECT JSON_EXTRACT(data, '$.rule') as rule, COUNT(*) as count, MAX(timestamp) as last_seen
         FROM events WHERE type = 'VIOLATION' GROUP BY rule ORDER BY count DESC`
      ).all();
      const byFile = db.prepare(
        `SELECT JSON_EXTRACT(data, '$.file') as file, COUNT(*) as count FROM events
         WHERE type = 'VIOLATION' AND JSON_EXTRACT(data, '$.file') IS NOT NULL AND JSON_EXTRACT(data, '$.file') != ''
         GROUP BY file ORDER BY count DESC LIMIT 20`
      ).all();
      const overrides = db.prepare(
        `SELECT JSON_EXTRACT(data, '$.rule') as rule, JSON_EXTRACT(data, '$.reason') as reason, timestamp as date
         FROM events WHERE type = 'OVERRIDE' ORDER BY timestamp DESC LIMIT 50`
      ).all();
      const totalViolations = db.prepare(`SELECT COUNT(*) as count FROM events WHERE type = 'VIOLATION'`).get() as { count: number };
      const totalOverrides = db.prepare(`SELECT COUNT(*) as count FROM events WHERE type = 'OVERRIDE'`).get() as { count: number };
      res.json({ byRule, byFile, overrides, totalViolations: totalViolations.count, totalOverrides: totalOverrides.count });
    } catch {
      res.status(500).json({ error: 'Failed to query violations summary' });
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
    gateService.record({ scope_id, gate_name, status, details, duration_ms, commit_sha });
    res.status(201).json({ ok: true });
  });

  // ─── Deployment Routes ─────────────────────────────────────

  router.get('/deployments', (_req, res) => {
    res.json((deployService.getRecent() as Row[]).map(parseJsonFields));
  });

  router.get('/deployments/latest', (_req, res) => {
    res.json((deployService.getLatestPerEnv() as Row[]).map(parseJsonFields));
  });

  router.post('/deployments', (req, res) => {
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
      const drift = await computeDrift();
      res.json(drift);
    } catch (err) {
      res.status(500).json({ error: 'Failed to compute drift', details: String(err) });
    }
  });

  router.get('/deployments/frequency', (_req, res) => {
    try {
      const rows = db.prepare(
        `SELECT environment, strftime('%Y-W%W', started_at) as week, COUNT(*) as count
         FROM deployments WHERE started_at > datetime('now', '-56 days') GROUP BY environment, week ORDER BY week ASC`
      ).all() as Array<{ environment: string; week: string; count: number }>;
      const weekMap = new Map<string, { week: string; staging: number; production: number }>();
      for (const row of rows) {
        if (!weekMap.has(row.week)) weekMap.set(row.week, { week: row.week, staging: 0, production: 0 });
        const entry = weekMap.get(row.week)!;
        if (row.environment === 'staging') entry.staging = row.count;
        if (row.environment === 'production') entry.production = row.count;
      }
      res.json([...weekMap.values()]);
    } catch {
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

    if (parsed.claude_session_id && typeof parsed.claude_session_id === 'string') {
      const claudeSessions = await getClaudeSessions();
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
    });
  });

  router.post('/sessions/:id/resume', async (req, res) => {
    const { claude_session_id } = req.body as { claude_session_id?: string };

    if (!claude_session_id || !/^[0-9a-f-]{36}$/i.test(claude_session_id)) {
      res.status(400).json({ error: 'Valid claude_session_id (UUID) required' });
      return;
    }

    const resumeCmd = `cd ${projectRoot} && claude --dangerously-skip-permissions --resume ${claude_session_id}`;

    try {
      await launchInTerminal(resumeCmd);
      res.json({ ok: true, session_id: claude_session_id });
    } catch (err) {
      res.status(500).json({ error: 'Failed to launch terminal', details: String(err) });
    }
  });

  return router;
}
