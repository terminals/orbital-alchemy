import { Router } from 'express';
import type Database from 'better-sqlite3';
import type { Emitter } from '../project-emitter.js';
import type { ScopeService } from '../services/scope-service.js';
import { launchInCategorizedTerminal, escapeForAnsiC, shellQuote, buildSessionName, snapshotSessionPids, discoverNewSession, renameSession } from '../utils/terminal-launcher.js';
import { resolveDispatchEvent, resolveAbandonedDispatchesForScope, getActiveScopeIds, getAbandonedScopeIds, linkPidToDispatch } from '../utils/dispatch-utils.js';
import type { WorkflowEngine } from '../../shared/workflow-engine.js';
import type { OrbitalConfig } from '../config.js';
import { buildClaudeFlags, buildEnvVarPrefix } from '../utils/flag-builder.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('dispatch');

const DEFAULT_MAX_BATCH_SIZE = 20;

interface DispatchBody {
  scope_id?: number;
  command: string;
  prompt?: string;
  transition?: { from: string; to: string };
}

interface DispatchRouteDeps {
  db: Database.Database;
  io: Emitter;
  scopeService: ScopeService;
  projectRoot: string;
  engine: WorkflowEngine;
  config: OrbitalConfig;
}

export function createDispatchRoutes({ db, io, scopeService, projectRoot, engine, config }: DispatchRouteDeps): Router {
  const router = Router();

  router.get('/dispatch/active-scopes', (_req, res) => {
    const scope_ids = getActiveScopeIds(db, scopeService, engine);
    const abandoned_scopes = getAbandonedScopeIds(db, scopeService, engine, scope_ids);
    res.json({ scope_ids, abandoned_scopes });
  });

  router.get('/dispatch/active', (req, res) => {
    const scopeId = Number(req.query.scope_id);
    if (isNaN(scopeId) || scopeId <= 0) {
      res.status(400).json({ error: 'Valid scope_id query param required' });
      return;
    }
    const active = db.prepare(
      `SELECT id, timestamp, JSON_EXTRACT(data, '$.command') as command
       FROM events
       WHERE type = 'DISPATCH' AND scope_id = ? AND JSON_EXTRACT(data, '$.resolved') IS NULL
       ORDER BY timestamp DESC LIMIT 1`
    ).get(scopeId) as { id: string; timestamp: string; command: string } | undefined;

    res.json({ active: active ?? null });
  });

  router.post('/dispatch', async (req, res) => {
    const { scope_id, command, prompt, transition } = req.body as DispatchBody;

    if (!command || !engine.isAllowedCommand(command)) {
      res.status(400).json({ error: 'Command must start with /scope-, /git-, /test-, or /session-' });
      return;
    }

    // W-11: Validate prompt field against allowed command prefixes
    if (prompt && !engine.isAllowedCommand(prompt)) {
      res.status(400).json({ error: 'Prompt must start with /scope-, /git-, /test-, or /session-' });
      return;
    }

    // Active session guard
    if (scope_id != null) {
      const active = db.prepare(
        `SELECT id FROM events
         WHERE type = 'DISPATCH' AND scope_id = ? AND JSON_EXTRACT(data, '$.resolved') IS NULL
         ORDER BY timestamp DESC LIMIT 1`
      ).get(scope_id) as { id: string } | undefined;

      if (active) {
        res.status(409).json({ error: 'Active dispatch exists', dispatch_id: active.id });
        return;
      }
    }

    // Max concurrent dispatches guard
    const maxConcurrent = config.dispatch.maxConcurrent;
    if (maxConcurrent > 0) {
      const activeCount = (db.prepare(
        `SELECT COUNT(*) as count FROM events
         WHERE type = 'DISPATCH' AND JSON_EXTRACT(data, '$.resolved') IS NULL`
      ).get() as { count: number }).count;
      if (activeCount >= maxConcurrent) {
        res.status(429).json({ error: `Max concurrent dispatches reached (${maxConcurrent})` });
        return;
      }
    }

    // Update scope status if transition provided
    if (scope_id != null && transition?.to) {
      const result = scopeService.updateStatus(scope_id, transition.to, 'dispatch');
      if (!result.ok) {
        res.status(400).json({ error: result.error });
        return;
      }
    }

    // Record DISPATCH event
    const eventId = crypto.randomUUID();
    const eventData = { command, transition: transition ?? null, resolved: null };
    db.prepare(
      `INSERT INTO events (id, type, scope_id, session_id, agent, data, timestamp)
       VALUES (?, 'DISPATCH', ?, NULL, 'dashboard', ?, ?)`
    ).run(eventId, scope_id ?? null, JSON.stringify(eventData), new Date().toISOString());

    io.emit('event:new', {
      id: eventId, type: 'DISPATCH', scope_id: scope_id ?? null,
      session_id: null, agent: 'dashboard', data: eventData,
      timestamp: new Date().toISOString(),
    });

    // Build scope-aware session name before launch
    const scope = scope_id != null ? scopeService.getById(scope_id) : undefined;
    const sessionName = buildSessionName({ scopeId: scope_id ?? undefined, title: scope?.title, command });
    const beforePids = snapshotSessionPids(projectRoot);

    // Launch in iTerm — interactive TUI mode (no -p unless printMode) for full visibility
    const promptText = prompt ?? command;
    const escaped = escapeForAnsiC(promptText);
    const flagsStr = buildClaudeFlags(config.claude.dispatchFlags);
    const envPrefix = buildEnvVarPrefix(config.dispatch.envVars);
    const fullCmd = `cd '${shellQuote(projectRoot)}' && ${envPrefix}ORBITAL_DISPATCH_ID='${shellQuote(eventId)}' claude ${flagsStr} $'${escaped}'`;
    try {
      await launchInCategorizedTerminal(command, fullCmd, sessionName);
      res.json({ ok: true, dispatch_id: eventId, scope_id: scope_id ?? null });

      // Fire-and-forget: discover session PID, link to dispatch, and rename.
      // If discovery fails, SESSION_START event handler will link via ORBITAL_DISPATCH_ID.
      discoverNewSession(projectRoot, beforePids)
        .then((session) => {
          if (!session) {
            log.warn('PID discovery returned null — dispatch will rely on ORBITAL_DISPATCH_ID for linkage', { dispatch_id: eventId, scope_id });
            return;
          }
          linkPidToDispatch(db, eventId, session.pid);
          if (sessionName) renameSession(projectRoot, session.sessionId, sessionName);
        })
        .catch(err => log.warn('PID discovery failed — dispatch will rely on ORBITAL_DISPATCH_ID for linkage', { dispatch_id: eventId, error: err.message }));
    } catch (err) {
      if (scope_id != null && transition?.from) {
        scopeService.updateStatus(scope_id, transition.from, 'rollback');
      }
      resolveDispatchEvent(db, io, eventId, 'failed', String(err));
      res.status(500).json({ error: 'Failed to launch terminal', details: String(err) });
    }
  });

  router.post('/dispatch/:id/resolve', (req, res) => {
    const eventId = req.params.id;
    const row = db.prepare('SELECT id FROM events WHERE id = ? AND type = ?')
      .get(eventId, 'DISPATCH') as { id: string } | undefined;

    if (!row) {
      res.status(404).json({ error: 'Dispatch event not found' });
      return;
    }

    resolveDispatchEvent(db, io, eventId, 'completed');
    res.json({ ok: true, dispatch_id: eventId });
  });

  /** Recover an abandoned scope by reverting it to its pre-dispatch status. */
  router.post('/dispatch/recover/:scopeId', (req, res) => {
    try {
      const scopeId = Number(req.params.scopeId);
      if (isNaN(scopeId) || scopeId <= 0) {
        res.status(400).json({ error: 'Valid scopeId required' });
        return;
      }

      const { from_status } = req.body as { from_status?: string };
      if (!from_status) {
        res.status(400).json({ error: 'from_status is required' });
        return;
      }

      // Revert scope to its pre-dispatch status
      const result = scopeService.updateStatus(scopeId, from_status, 'rollback');
      if (!result.ok) {
        res.status(400).json({ error: result.error });
        return;
      }

      resolveAbandonedDispatchesForScope(db, io, scopeId);
      res.json({ ok: true, scope_id: scopeId, reverted_to: from_status });
    } catch (err) {
      log.error('Error recovering scope', { error: String(err) });
      res.status(500).json({ error: 'Internal server error', details: String(err) });
    }
  });

  /** Dismiss abandoned state without reverting scope status. */
  router.post('/dispatch/dismiss-abandoned/:scopeId', (req, res) => {
    try {
      const scopeId = Number(req.params.scopeId);
      if (isNaN(scopeId) || scopeId <= 0) {
        res.status(400).json({ error: 'Valid scopeId required' });
        return;
      }

      const dismissed = resolveAbandonedDispatchesForScope(db, io, scopeId);
      res.json({ ok: true, scope_id: scopeId, dismissed });
    } catch (err) {
      log.error('Error dismissing abandoned dispatches', { error: String(err) });
      res.status(500).json({ error: 'Internal server error', details: String(err) });
    }
  });

  router.post('/dispatch/batch', async (req, res) => {
    const { scope_ids, command, transition } = req.body as {
      scope_ids: number[];
      command: string;
      transition?: { from: string; to: string };
    };

    if (!command || !engine.isAllowedCommand(command)) {
      res.status(400).json({ error: 'Command must start with /scope-, /git-, /test-, or /session-' });
      return;
    }

    if (!Array.isArray(scope_ids) || scope_ids.length === 0) {
      res.status(400).json({ error: 'scope_ids must be a non-empty array' });
      return;
    }

    // W-12: Validate batch size and scope ID types
    const maxBatch = config.dispatch.maxBatchSize || DEFAULT_MAX_BATCH_SIZE;
    if (scope_ids.length > maxBatch) {
      res.status(400).json({ error: `Maximum batch size is ${maxBatch}` });
      return;
    }
    if (!scope_ids.every(id => Number.isInteger(id) && id > 0)) {
      res.status(400).json({ error: 'scope_ids must contain positive integers' });
      return;
    }

    // Update all scope statuses
    if (transition?.to) {
      for (const id of scope_ids) {
        const result = scopeService.updateStatus(id, transition.to, 'dispatch');
        if (!result.ok) {
          res.status(400).json({ error: `Scope ${id}: ${result.error}` });
          return;
        }
      }
    }

    // Record single DISPATCH event for the batch
    const eventId = crypto.randomUUID();
    const eventData = { command, transition: transition ?? null, scope_ids, batch: true, resolved: null };
    db.prepare(
      `INSERT INTO events (id, type, scope_id, session_id, agent, data, timestamp)
       VALUES (?, 'DISPATCH', NULL, NULL, 'dashboard', ?, ?)`
    ).run(eventId, JSON.stringify(eventData), new Date().toISOString());

    io.emit('event:new', {
      id: eventId, type: 'DISPATCH', scope_id: null,
      session_id: null, agent: 'dashboard', data: eventData,
      timestamp: new Date().toISOString(),
    });

    // Launch single CLI session with batch env vars
    const batchEscaped = escapeForAnsiC(command);
    const beforePids = snapshotSessionPids(projectRoot);
    const batchFlags = buildClaudeFlags(config.claude.dispatchFlags);
    const envPrefix = buildEnvVarPrefix(config.dispatch.envVars);
    const fullCmd = `cd '${shellQuote(projectRoot)}' && ${envPrefix}ORBITAL_DISPATCH_ID='${shellQuote(eventId)}' claude ${batchFlags} $'${batchEscaped}'`;
    try {
      await launchInCategorizedTerminal(command, fullCmd);
      res.json({ ok: true, dispatch_id: eventId, scope_ids });

      // Fire-and-forget: discover session PID and link to dispatch.
      // If discovery fails, SESSION_START event handler will link via ORBITAL_DISPATCH_ID.
      discoverNewSession(projectRoot, beforePids)
        .then((session) => {
          if (!session) {
            log.warn('Batch PID discovery returned null — dispatch will rely on ORBITAL_DISPATCH_ID for linkage', { dispatch_id: eventId });
            return;
          }
          linkPidToDispatch(db, eventId, session.pid);
        })
        .catch(err => log.warn('Batch PID discovery failed — dispatch will rely on ORBITAL_DISPATCH_ID for linkage', { dispatch_id: eventId, error: err.message }));
    } catch (err) {
      if (transition?.from) {
        for (const id of scope_ids) {
          scopeService.updateStatus(id, transition.from, 'rollback');
        }
      }
      resolveDispatchEvent(db, io, eventId, 'failed', String(err));
      res.status(500).json({ error: 'Failed to launch terminal', details: String(err) });
    }
  });

  return router;
}
