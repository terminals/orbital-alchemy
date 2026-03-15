import { Router } from 'express';
import { spawn } from 'child_process';
import type Database from 'better-sqlite3';
import type { Server } from 'socket.io';
import type { ScopeService } from '../services/scope-service.js';
import { launchInTerminal, buildSessionName, snapshotSessionPids, discoverNewSession, renameSession } from '../utils/terminal-launcher.js';
import { resolveDispatchEvent, linkPidToDispatch } from '../utils/dispatch-utils.js';

interface ScopeRouteDeps {
  db: Database.Database;
  io: Server;
  scopeService: ScopeService;
  projectRoot: string;
}

export function createScopeRoutes({ db, io, scopeService, projectRoot }: ScopeRouteDeps): Router {
  const router = Router();

  // ─── Scope CRUD ──────────────────────────────────────────

  router.get('/scopes', (_req, res) => {
    res.json(scopeService.getAll());
  });

  /** Bulk update — must come before :id route to avoid matching "bulk" as an id */
  router.patch('/scopes/bulk/status', (req, res) => {
    const { scopes } = req.body as { scopes: Array<{ id: number; status: string }> };
    if (!Array.isArray(scopes)) {
      res.status(400).json({ error: 'Expected { scopes: [{id, status}] }' });
      return;
    }
    let updated = 0;
    for (const { id, status } of scopes) {
      const result = scopeService.updateStatus(id, status, 'bulk-sync');
      if (result.ok) updated++;
    }
    res.json({ updated, total: scopes.length });
  });

  router.get('/scopes/:id', (req, res) => {
    const scope = scopeService.getById(Number(req.params.id));
    if (!scope) {
      res.status(404).json({ error: 'Scope not found' });
      return;
    }
    res.json(scope);
  });

  router.patch('/scopes/:id', (req, res) => {
    const id = Number(req.params.id);
    const result = scopeService.updateScopeFrontmatter(id, req.body);
    if (!result.ok) {
      const code = result.code === 'NOT_FOUND' ? 404 : 400;
      res.status(code).json({ error: result.error, code: result.code });
      return;
    }
    const scope = scopeService.getById(id);
    res.json(scope ?? { ok: true });
  });

  // ─── Idea Routes ─────────────────────────────────────────

  router.post('/ideas', (req, res) => {
    const { title, description } = req.body as { title?: string; description?: string };
    if (!title?.trim()) {
      res.status(400).json({ error: 'title is required' });
      return;
    }
    const idea = scopeService.createIdeaFile(title.trim(), (description ?? '').trim());
    res.status(201).json(idea);
  });

  router.patch('/ideas/:id', (req, res) => {
    const id = Number(req.params.id);
    const { title, description } = req.body as { title?: string; description?: string };
    if (!title?.trim()) {
      res.status(400).json({ error: 'title is required' });
      return;
    }
    const updated = scopeService.updateIdeaFile(id, title.trim(), (description ?? '').trim());
    if (!updated) {
      res.status(404).json({ error: 'Idea not found' });
      return;
    }
    res.json({ ok: true });
  });

  router.delete('/ideas/:id', (req, res) => {
    const id = Number(req.params.id);
    const deleted = scopeService.deleteIdeaFile(id);
    if (!deleted) {
      res.status(404).json({ error: 'Idea not found' });
      return;
    }
    res.json({ ok: true });
  });

  router.post('/ideas/:id/promote', async (req, res) => {
    const ideaId = Number(req.params.id);
    const result = scopeService.promoteIdea(ideaId);
    if (!result) {
      res.status(404).json({ error: 'Idea not found' });
      return;
    }

    const scopeId = result.id;

    // Record DISPATCH event for audit trail
    const eventId = crypto.randomUUID();
    const eventData = {
      command: '/scope create',
      transition: { from: 'icebox', to: 'planning' },
      resolved: null,
    };
    db.prepare(
      `INSERT INTO events (id, type, scope_id, session_id, agent, data, timestamp)
       VALUES (?, 'DISPATCH', ?, NULL, 'dashboard', ?, ?)`
    ).run(eventId, scopeId, JSON.stringify(eventData), new Date().toISOString());

    io.emit('event:new', {
      id: eventId, type: 'DISPATCH', scope_id: scopeId,
      session_id: null, agent: 'dashboard', data: eventData,
      timestamp: new Date().toISOString(),
    });

    const paddedId = String(scopeId).padStart(3, '0');
    const fullCmd = `cd ${projectRoot} && claude --dangerously-skip-permissions '/scope create ${paddedId}'`;

    const promoteSessionName = buildSessionName({ scopeId, title: result.title, command: '/scope create' });
    const promoteBeforePids = snapshotSessionPids(projectRoot);

    try {
      await launchInTerminal(fullCmd);
      res.json({ ok: true, id: scopeId, filePath: result.filePath });

      discoverNewSession(projectRoot, promoteBeforePids)
        .then((session) => {
          if (!session) return;
          linkPidToDispatch(db, eventId, session.pid);
          if (promoteSessionName) renameSession(projectRoot, session.sessionId, promoteSessionName);
        })
        .catch(() => {});
    } catch (err) {
      resolveDispatchEvent(db, io, eventId, 'failed', String(err));
      res.status(500).json({ error: 'Failed to launch terminal', details: String(err) });
    }
  });

  // ─── Surprise Me (AI idea generation) ────────────────────

  let surpriseInProgress = false;

  router.post('/ideas/surprise', (_req, res) => {
    if (surpriseInProgress) {
      res.status(409).json({ error: 'Surprise generation already in progress' });
      return;
    }
    surpriseInProgress = true;

    const nextIdStart = scopeService.getNextIceboxId();
    const today = new Date().toISOString().split('T')[0];
    const idRange = Array.from({ length: 5 }, (_, i) => nextIdStart + i);

    const prompt = `You are analyzing a trading bot codebase to suggest feature ideas. Your ONLY job is to create markdown files.

Create exactly 3 idea files in the scopes/icebox/ directory. Each file must use this EXACT format:

File: scopes/icebox/{ID}-{kebab-slug}.md

---
id: {ID}
title: "{title}"
status: icebox
ghost: true
created: ${today}
updated: ${today}
blocked_by: []
blocks: []
tags: []
---

{2-3 sentence description of the feature, what problem it solves, and a rough approach.}

Use these IDs: ${idRange[0]}, ${idRange[1]}, ${idRange[2]}

Rules:
- Focus on practical improvements: performance, UX, security, developer experience, monitoring, or reliability
- Be specific and actionable — not vague architectural rewrites
- Keep descriptions concise (2-3 sentences max)
- Filenames must be {ID}-{kebab-case-slug}.md
- The ghost: true field is required in frontmatter
- Do NOT create any other files or make any other changes`;

    const child = spawn('claude', ['-p', prompt, '--output-format', 'text'], {
      cwd: projectRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, CLAUDE_CODE_ENTRYPOINT: 'orbital-surprise' },
    });

    child.unref();

    child.on('close', () => {
      surpriseInProgress = false;
      const eventId = crypto.randomUUID();
      io.emit('event:new', {
        id: eventId, type: 'AGENT_COMPLETED', scope_id: null,
        session_id: null, agent: 'surprise-me',
        data: { action: 'surprise-ideas-generated' },
        timestamp: new Date().toISOString(),
      });
    });

    child.on('error', () => {
      surpriseInProgress = false;
    });

    res.json({ ok: true, status: 'generating' });
  });

  router.post('/ideas/:id/approve', (req, res) => {
    const id = Number(req.params.id);
    const approved = scopeService.approveGhostIdea(id);
    if (!approved) {
      res.status(404).json({ error: 'Ghost idea not found' });
      return;
    }
    res.json({ ok: true });
  });

  router.get('/ideas/surprise/status', (_req, res) => {
    res.json({ generating: surpriseInProgress });
  });

  return router;
}
