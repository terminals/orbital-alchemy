import type Database from 'better-sqlite3';
import type { Emitter } from '../project-emitter.js';
import type { ScopeService } from '../services/scope-service.js';
import type { WorkflowEngine } from '../../shared/workflow-engine.js';
import { isSessionPidAlive } from './terminal-launcher.js';
import { createLogger } from './logger.js';

const log = createLogger('dispatch-utils');

interface DispatchRow {
  data: string;
  scope_id: number | null;
}

/** Mark a DISPATCH event as resolved and emit socket notification. */
export function resolveDispatchEvent(
  db: Database.Database,
  io: Emitter,
  eventId: string,
  outcome: 'completed' | 'failed' | 'abandoned',
  error?: string,
): void {
  const row = db.prepare('SELECT data, scope_id FROM events WHERE id = ?')
    .get(eventId) as DispatchRow | undefined;
  if (!row) return;

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(row.data);
  } catch (e) {
    log.error('Failed to parse DISPATCH event data', { eventId, error: String(e) });
    return;
  }
  data.resolved = { outcome, at: new Date().toISOString(), ...(error ? { error } : {}) };
  db.prepare('UPDATE events SET data = ? WHERE id = ?').run(JSON.stringify(data), eventId);

  io.emit('dispatch:resolved', {
    event_id: eventId,
    scope_id: row.scope_id,
    scope_ids: data.scope_ids ?? null,
    outcome,
  });
}

/** Auto-revert scope status when a dispatch is abandoned, if the forward edge
 *  has autoRevert=true and the scope is still at the dispatch target.
 *  Safe: only reverts if the scope hasn't been moved since the dispatch.
 *  Returns true if revert was successful. */
function autoRevertAbandonedScope(
  scopeService: ScopeService,
  engine: WorkflowEngine,
  scopeId: number,
  data: Record<string, unknown>,
): boolean {
  try {
    const transition = data.transition as { from: string; to: string } | null;
    if (!transition?.from || !transition?.to) return false;

    const scope = scopeService.getById(scopeId);
    // Only revert if scope is still at the dispatch target (hasn't been moved)
    if (!scope || scope.status !== transition.to) return false;

    const edge = engine.findEdge(transition.from, transition.to);
    if (!edge?.autoRevert) return false;

    const result = scopeService.updateStatus(scopeId, transition.from, 'rollback');
    if (!result.ok) return false;
    log.info('Auto-reverted abandoned dispatch', {
      scopeId, from: transition.to, to: transition.from,
    });
    return true;
  } catch (err) {
    log.error('Auto-revert failed', { scopeId, error: String(err) });
    return false;
  }
}

/** Attempt auto-revert for an abandoned dispatch and clear the abandoned state if successful.
 *  Loads the dispatch event data, tries auto-revert, and re-resolves as 'completed' if the
 *  scope was successfully reverted. Returns true if auto-revert + clear succeeded. */
export function tryAutoRevertAndClear(
  db: Database.Database,
  io: Emitter,
  scopeService: ScopeService,
  engine: WorkflowEngine,
  eventId: string,
): boolean {
  const row = db.prepare('SELECT data, scope_id FROM events WHERE id = ?')
    .get(eventId) as DispatchRow | undefined;
  if (!row || row.scope_id == null) return false;

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(row.data);
  } catch {
    return false;
  }

  const reverted = autoRevertAbandonedScope(scopeService, engine, row.scope_id, data);
  if (reverted) {
    // Clear the abandoned state so getAbandonedScopeIds won't return this scope
    resolveDispatchEvent(db, io, eventId, 'completed');
    log.info('Cleared abandoned dispatch after auto-revert', { eventId, scope_id: row.scope_id });
  }
  return reverted;
}

/** Resolve all unresolved DISPATCH events for a given scope */
export function resolveActiveDispatchesForScope(
  db: Database.Database,
  io: Emitter,
  scopeId: number,
  outcome: 'completed' | 'failed' | 'abandoned',
): void {
  const rows = db.prepare(
    `SELECT id FROM events
     WHERE type = 'DISPATCH' AND scope_id = ? AND JSON_EXTRACT(data, '$.resolved') IS NULL`,
  ).all(scopeId) as Array<{ id: string }>;

  for (const row of rows) {
    resolveDispatchEvent(db, io, row.id, outcome);
  }
}

/** Re-resolve abandoned DISPATCH events for a scope as completed.
 *  Used by both recover and dismiss-abandoned routes to clear abandoned state. */
export function resolveAbandonedDispatchesForScope(
  db: Database.Database,
  io: Emitter,
  scopeId: number,
): number {
  const rows = db.prepare(
    `SELECT id FROM events
     WHERE type = 'DISPATCH' AND scope_id = ?
       AND JSON_EXTRACT(data, '$.resolved.outcome') = 'abandoned'`,
  ).all(scopeId) as Array<{ id: string }>;

  for (const row of rows) {
    resolveDispatchEvent(db, io, row.id, 'completed');
  }

  return rows.length;
}

/** Store the PID of the Claude session working on a dispatch.
 *  Called after discoverNewSession finds the launched session, or when
 *  a SESSION_START event includes ORBITAL_DISPATCH_ID from the env var. */
export function linkPidToDispatch(
  db: Database.Database,
  eventId: string,
  pid: number,
): void {
  const row = db.prepare('SELECT data FROM events WHERE id = ?')
    .get(eventId) as { data: string } | undefined;
  if (!row) return;
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(row.data);
  } catch (e) {
    log.error('Failed to parse DISPATCH event data', { eventId, error: String(e) });
    return;
  }
  data.pid = pid;
  db.prepare('UPDATE events SET data = ? WHERE id = ?').run(JSON.stringify(data), eventId);
}

/** Resolve all unresolved DISPATCH events linked to a specific PID.
 *  Called when a SESSION_END event is received, indicating the Claude session
 *  process has exited and its dispatches should be cleared.
 *  Returns the resolved event IDs so callers can attempt auto-revert. */
export function resolveDispatchesByPid(
  db: Database.Database,
  io: Emitter,
  pid: number,
  outcome: 'completed' | 'abandoned' = 'abandoned',
): string[] {
  const rows = db.prepare(
    `SELECT id FROM events
     WHERE type = 'DISPATCH'
       AND JSON_EXTRACT(data, '$.resolved') IS NULL
       AND JSON_EXTRACT(data, '$.pid') = ?`,
  ).all(pid) as Array<{ id: string }>;

  for (const row of rows) {
    resolveDispatchEvent(db, io, row.id, outcome);
  }

  return rows.map(r => r.id);
}

/** Resolve all unresolved DISPATCH events linked to a specific dispatch ID.
 *  Called when a SESSION_END event includes dispatch_id from ORBITAL_DISPATCH_ID env var.
 *  Outcome depends on how the session ended: normal_exit → completed, otherwise → abandoned.
 *  Returns the resolved event IDs so callers can attempt auto-revert. */
export function resolveDispatchesByDispatchId(
  db: Database.Database,
  io: Emitter,
  dispatchId: string,
  outcome: 'completed' | 'abandoned' = 'abandoned',
): string[] {
  const row = db.prepare(
    `SELECT id FROM events
     WHERE id = ? AND type = 'DISPATCH' AND JSON_EXTRACT(data, '$.resolved') IS NULL`,
  ).get(dispatchId) as { id: string } | undefined;

  if (!row) return [];
  resolveDispatchEvent(db, io, row.id, outcome);
  return [row.id];
}

/** Default fallback age threshold for dispatches without a linked PID (10 minutes). */
const DEFAULT_STALE_AGE_MS = 10 * 60 * 1000;

/** Get all scope IDs that have actively running DISPATCH events.
 *  Uses PID liveness (process.kill(pid, 0)) when available, falls back to
 *  age-based heuristic for legacy dispatches without a linked PID. */
export function getActiveScopeIds(db: Database.Database, scopeService: ScopeService, engine: WorkflowEngine, staleTimeoutMinutes?: number): number[] {
  const rows = db.prepare(
    `SELECT scope_id, data FROM events
     WHERE type = 'DISPATCH'
       AND scope_id IS NOT NULL
       AND JSON_EXTRACT(data, '$.resolved') IS NULL`,
  ).all() as Array<{ scope_id: number; data: string }>;

  const staleMs = staleTimeoutMinutes != null ? staleTimeoutMinutes * 60 * 1000 : DEFAULT_STALE_AGE_MS;
  const cutoff = new Date(Date.now() - staleMs).toISOString();
  const active = new Set<number>();

  for (const row of rows) {
    if (active.has(row.scope_id)) continue;  // already confirmed active

    // Skip scopes in terminal states
    const scope = scopeService.getById(row.scope_id);
    if (scope && engine.isTerminalStatus(scope.status)) continue;

    let data: Record<string, unknown>;
    try {
      data = JSON.parse(row.data);
    } catch (e) {
      log.error('Failed to parse DISPATCH event data', { scope_id: row.scope_id, error: String(e) });
      continue;
    }
    if (typeof data.pid === 'number') {
      // Preferred: check if the Claude session process is still running
      if (isSessionPidAlive(data.pid)) {
        active.add(row.scope_id);
      }
    } else {
      // Fallback for legacy dispatches without PID: use age-based check
      const dispatch = db.prepare(
        `SELECT timestamp FROM events
         WHERE type = 'DISPATCH' AND scope_id = ? AND JSON_EXTRACT(data, '$.resolved') IS NULL
         ORDER BY timestamp DESC LIMIT 1`,
      ).get(row.scope_id) as { timestamp: string } | undefined;
      if (dispatch && dispatch.timestamp > cutoff) {
        active.add(row.scope_id);
      }
    }
  }

  // Also check batch dispatches (scope_id IS NULL, batch = true)
  const batchRows = db.prepare(
    `SELECT data FROM events
     WHERE type = 'DISPATCH'
       AND scope_id IS NULL
       AND JSON_EXTRACT(data, '$.batch') = 1
       AND JSON_EXTRACT(data, '$.resolved') IS NULL`,
  ).all() as Array<{ data: string }>;

  for (const batchRow of batchRows) {
    let batchData: Record<string, unknown>;
    try {
      batchData = JSON.parse(batchRow.data);
    } catch {
      log.warn('Skipping unparseable batch dispatch event data', { data: batchRow.data });
      continue;
    }

    const scopeIds = batchData.scope_ids as number[] | undefined;
    if (!Array.isArray(scopeIds)) continue;

    let batchAlive = false;
    if (typeof batchData.pid === 'number') {
      batchAlive = isSessionPidAlive(batchData.pid);
    } else {
      // No PID — consider active (stale cleanup will catch it)
      batchAlive = true;
    }

    if (batchAlive) {
      for (const id of scopeIds) {
        const scope = scopeService.getById(id);
        if (scope && !engine.isTerminalStatus(scope.status)) {
          active.add(id);
        }
      }
    }
  }

  return [...active];
}

/** Resolve stale DISPATCH events. Three staleness criteria:
 *  1. Scope already in a terminal state (as defined by workflow config)
 *  2. Linked PID is no longer running (session ended/crashed)
 *  3. No linked PID and dispatch older than STALE_AGE_MS (fallback)
 *  Called once at startup and periodically to clean up unresolved dispatches.
 *
 *  When a dispatch is abandoned, auto-reverts scope status if the forward edge
 *  has autoRevert=true AND the scope is still at the dispatch target. This allows
 *  safe recovery for edges like backlog→implementing where the session crashed
 *  before doing meaningful work. Edges without autoRevert leave the scope in place
 *  for manual recovery from the dashboard. */
export function resolveStaleDispatches(db: Database.Database, io: Emitter, scopeService: ScopeService, engine: WorkflowEngine, staleTimeoutMinutes?: number): number {
  const staleMs = staleTimeoutMinutes != null ? staleTimeoutMinutes * 60 * 1000 : DEFAULT_STALE_AGE_MS;
  const cutoff = new Date(Date.now() - staleMs).toISOString();

  // Single query on events only — split by cache status
  const rows = db.prepare(
    `SELECT id, scope_id, data, timestamp FROM events
     WHERE type = 'DISPATCH'
       AND scope_id IS NOT NULL
       AND JSON_EXTRACT(data, '$.resolved') IS NULL`,
  ).all() as Array<{ id: string; scope_id: number; data: string; timestamp: string }>;

  let resolved = 0;

  for (const row of rows) {
    const scope = scopeService.getById(row.scope_id);
    const scopeStatus = scope?.status;

    // Criterion 1: scope in terminal state
    if (scopeStatus && engine.isTerminalStatus(scopeStatus)) {
      resolveDispatchEvent(db, io, row.id, 'completed');
      resolved++;
      continue;
    }

    // Criteria 2+3: dead PID or old age
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(row.data);
    } catch (e) {
      log.error('Failed to parse DISPATCH event data', { eventId: row.id, error: String(e) });
      continue;
    }
    let isStale = false;

    if (typeof data.pid === 'number') {
      isStale = !isSessionPidAlive(data.pid);
    } else {
      isStale = row.timestamp <= cutoff;
    }

    if (isStale) {
      resolveDispatchEvent(db, io, row.id, 'abandoned');
      // Try auto-revert; if successful, clear the abandoned state
      tryAutoRevertAndClear(db, io, scopeService, engine, row.id);
      resolved++;
    }
  }

  // Second pass: batch dispatches (scope_id IS NULL, batch = true)
  const batchRows = db.prepare(
    `SELECT id, data, timestamp FROM events
     WHERE type = 'DISPATCH'
       AND scope_id IS NULL
       AND JSON_EXTRACT(data, '$.batch') = 1
       AND JSON_EXTRACT(data, '$.resolved') IS NULL`,
  ).all() as Array<{ id: string; data: string; timestamp: string }>;

  for (const batchRow of batchRows) {
    let batchData: Record<string, unknown>;
    try {
      batchData = JSON.parse(batchRow.data);
    } catch {
      log.warn('Skipping unparseable batch dispatch event data', { eventId: batchRow.id });
      continue;
    }

    const scopeIds = batchData.scope_ids as number[] | undefined;

    // Criterion 1: all batch scopes in terminal state
    if (Array.isArray(scopeIds) && scopeIds.length > 0) {
      const allTerminal = scopeIds.every(id => {
        const scope = scopeService.getById(id);
        return scope && engine.isTerminalStatus(scope.status);
      });
      if (allTerminal) {
        resolveDispatchEvent(db, io, batchRow.id, 'completed');
        resolved++;
        continue;
      }
    }

    // Criteria 2+3: dead PID or old age
    if (typeof batchData.pid === 'number') {
      if (!isSessionPidAlive(batchData.pid)) {
        resolveDispatchEvent(db, io, batchRow.id, 'abandoned');
        resolved++;
      }
    } else if (batchRow.timestamp <= cutoff) {
      resolveDispatchEvent(db, io, batchRow.id, 'abandoned');
      resolved++;
    }
  }

  return resolved;
}

/** Get scope IDs with recent abandoned dispatch outcomes.
 *  Returns an array of abandoned scope entries with scope_id, from_status, and abandoned_at.
 *  Only includes scopes that are NOT currently in a terminal state and
 *  do NOT have a newer active (unresolved) dispatch. */
export function getAbandonedScopeIds(
  db: Database.Database,
  scopeService: ScopeService,
  engine: WorkflowEngine,
  activeScopeIds?: number[],
): Array<{ scope_id: number; from_status: string | null; abandoned_at: string }> {
  const rows = db.prepare(
    `SELECT scope_id, data, timestamp FROM events
     WHERE type = 'DISPATCH'
       AND scope_id IS NOT NULL
       AND JSON_EXTRACT(data, '$.resolved.outcome') = 'abandoned'
     ORDER BY timestamp DESC`,
  ).all() as Array<{ scope_id: number; data: string; timestamp: string }>;

  // Get active scope IDs to exclude scopes with new dispatches
  const activeScopes = activeScopeIds ?? getActiveScopeIds(db, scopeService, engine);
  const activeSet = new Set(activeScopes);

  const seen = new Set<number>();
  const result: Array<{ scope_id: number; from_status: string | null; abandoned_at: string }> = [];

  for (const row of rows) {
    if (seen.has(row.scope_id)) continue;
    seen.add(row.scope_id);

    // Skip if scope has a new active dispatch
    if (activeSet.has(row.scope_id)) continue;

    // Skip if scope is in terminal state
    const scope = scopeService.getById(row.scope_id);
    if (!scope) continue;
    if (engine.isTerminalStatus(scope.status)) continue;

    let data: Record<string, unknown>;
    try {
      data = JSON.parse(row.data);
    } catch (e) {
      log.error('Failed to parse DISPATCH event data', { scope_id: row.scope_id, error: String(e) });
      continue;
    }
    const transition = data.transition as Record<string, unknown> | null;
    const resolved = data.resolved as Record<string, unknown> | null;
    const fromStatus = transition?.from as string ?? null;
    const abandonedAt = resolved?.at as string ?? row.timestamp;

    // Defense-in-depth: skip scopes already at their pre-dispatch status (already reverted)
    if (fromStatus && scope.status === fromStatus) continue;

    result.push({ scope_id: row.scope_id, from_status: fromStatus, abandoned_at: abandonedAt });
  }

  return result;
}
