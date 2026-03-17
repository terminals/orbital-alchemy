import type Database from 'better-sqlite3';
import type { Server } from 'socket.io';
import type { ScopeService } from '../services/scope-service.js';
import type { WorkflowEngine } from '../../shared/workflow-engine.js';
import { isSessionPidAlive } from './terminal-launcher.js';

interface DispatchRow {
  data: string;
  scope_id: number | null;
}

/** Mark a DISPATCH event as resolved and emit socket notification.
 *  Changed from original: queries scope_id alongside data, emits dispatch:resolved */
export function resolveDispatchEvent(
  db: Database.Database,
  io: Server,
  eventId: string,
  outcome: 'completed' | 'failed',
  error?: string,
): void {
  const row = db.prepare('SELECT data, scope_id FROM events WHERE id = ?')
    .get(eventId) as DispatchRow | undefined;
  if (!row) return;

  const data = JSON.parse(row.data);
  data.resolved = { outcome, at: new Date().toISOString(), ...(error ? { error } : {}) };
  db.prepare('UPDATE events SET data = ? WHERE id = ?').run(JSON.stringify(data), eventId);

  io.emit('dispatch:resolved', {
    event_id: eventId,
    scope_id: row.scope_id,
    outcome,
  });
}

/** Resolve all unresolved DISPATCH events for a given scope */
export function resolveActiveDispatchesForScope(
  db: Database.Database,
  io: Server,
  scopeId: number,
  outcome: 'completed' | 'failed',
): void {
  const rows = db.prepare(
    `SELECT id FROM events
     WHERE type = 'DISPATCH' AND scope_id = ? AND JSON_EXTRACT(data, '$.resolved') IS NULL`,
  ).all(scopeId) as Array<{ id: string }>;

  for (const row of rows) {
    resolveDispatchEvent(db, io, row.id, outcome);
  }
}

/** Store the PID of the Claude session working on a dispatch.
 *  Called after discoverNewSession finds the launched session. */
export function linkPidToDispatch(
  db: Database.Database,
  eventId: string,
  pid: number,
): void {
  const row = db.prepare('SELECT data FROM events WHERE id = ?')
    .get(eventId) as { data: string } | undefined;
  if (!row) return;
  const data = JSON.parse(row.data);
  data.pid = pid;
  db.prepare('UPDATE events SET data = ? WHERE id = ?').run(JSON.stringify(data), eventId);
}

/** Resolve all unresolved DISPATCH events linked to a specific PID.
 *  Called when a SESSION_END event is received, indicating the Claude session
 *  process has exited and its dispatches should be cleared.
 *  If a scopeService is provided, reverts scopes that didn't reach their target status. */
export function resolveDispatchesByPid(
  db: Database.Database,
  io: Server,
  pid: number,
  scopeService?: ScopeService,
): number {
  const rows = db.prepare(
    `SELECT id, scope_id, data FROM events
     WHERE type = 'DISPATCH'
       AND JSON_EXTRACT(data, '$.resolved') IS NULL
       AND JSON_EXTRACT(data, '$.pid') = ?`,
  ).all(pid) as Array<{ id: string; scope_id: number | null; data: string }>;

  for (const row of rows) {
    resolveDispatchEvent(db, io, row.id, 'completed');

    // Revert scope to pre-dispatch status if it didn't move beyond the transition target
    if (scopeService && row.scope_id != null) {
      const data = JSON.parse(row.data);
      const transition = data.transition as { from: string; to: string } | null;
      if (transition?.from) {
        const scope = scopeService.getById(row.scope_id);
        if (scope && scope.status === transition.to) {
          scopeService.updateStatus(row.scope_id, transition.from, 'rollback');
        }
      }
    }
  }

  return rows.length;
}

/** Fallback age threshold for dispatches without a linked PID (4 hours). */
const STALE_AGE_MS = 4 * 60 * 60 * 1000;

/** Get all scope IDs that have actively running DISPATCH events.
 *  Uses PID liveness (process.kill(pid, 0)) when available, falls back to
 *  age-based heuristic for legacy dispatches without a linked PID. */
export function getActiveScopeIds(db: Database.Database, scopeService: ScopeService, engine: WorkflowEngine): number[] {
  const rows = db.prepare(
    `SELECT scope_id, data FROM events
     WHERE type = 'DISPATCH'
       AND scope_id IS NOT NULL
       AND JSON_EXTRACT(data, '$.resolved') IS NULL`,
  ).all() as Array<{ scope_id: number; data: string }>;

  const cutoff = new Date(Date.now() - STALE_AGE_MS).toISOString();
  const active = new Set<number>();

  for (const row of rows) {
    if (active.has(row.scope_id)) continue;  // already confirmed active

    // Skip scopes in terminal states
    const scope = scopeService.getById(row.scope_id);
    if (scope && engine.isTerminalStatus(scope.status)) continue;

    const data = JSON.parse(row.data);
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

  return [...active];
}

/** Resolve stale DISPATCH events. Three staleness criteria:
 *  1. Scope already in a terminal state (completed/dev/staging/production)
 *  2. Linked PID is no longer running (session ended/crashed)
 *  3. No linked PID and dispatch older than STALE_AGE_MS (fallback)
 *  Called once at startup to clean up pre-existing unresolved dispatches.
 *  When a stale dispatch had a transition, reverts the scope to its pre-dispatch status. */
export function resolveStaleDispatches(db: Database.Database, io: Server, scopeService: ScopeService, engine: WorkflowEngine): number {
  const cutoff = new Date(Date.now() - STALE_AGE_MS).toISOString();

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
    const data = JSON.parse(row.data);
    let isStale = false;

    if (typeof data.pid === 'number') {
      isStale = !isSessionPidAlive(data.pid);
    } else {
      isStale = row.timestamp <= cutoff;
    }

    if (isStale) {
      resolveDispatchEvent(db, io, row.id, 'completed');
      resolved++;

      // Revert scope to pre-dispatch status if the session didn't complete the transition
      const transition = data.transition as { from: string; to: string } | null;
      if (transition?.from && scopeStatus === transition.to) {
        scopeService.updateStatus(row.scope_id, transition.from, 'rollback');
      }
    }
  }

  return resolved;
}
