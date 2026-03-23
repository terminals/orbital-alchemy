import type Database from 'better-sqlite3';
import type { Server } from 'socket.io';
import type { ScopeService } from '../services/scope-service.js';
import type { WorkflowEngine } from '../../shared/workflow-engine.js';
import { isSessionPidAlive } from './terminal-launcher.js';

interface DispatchRow {
  data: string;
  scope_id: number | null;
}

/** Mark a DISPATCH event as resolved and emit socket notification. */
export function resolveDispatchEvent(
  db: Database.Database,
  io: Server,
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
    console.error(`[Orbital] Failed to parse DISPATCH event ${eventId} data:`, e);
    return;
  }
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
  io: Server,
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
    console.error(`[Orbital] Failed to parse DISPATCH event ${eventId} data:`, e);
    return;
  }
  data.pid = pid;
  db.prepare('UPDATE events SET data = ? WHERE id = ?').run(JSON.stringify(data), eventId);
}

/** Resolve all unresolved DISPATCH events linked to a specific PID.
 *  Called when a SESSION_END event is received, indicating the Claude session
 *  process has exited and its dispatches should be cleared.
 *
 *  NOTE: Does NOT revert scope status. Skills like /scope-implement intentionally
 *  keep scopes at the transition target (e.g. "implementing") after completion.
 *  Reverting on session end was destroying completed work and deleting scope files. */
export function resolveDispatchesByPid(
  db: Database.Database,
  io: Server,
  pid: number,
): number {
  const rows = db.prepare(
    `SELECT id FROM events
     WHERE type = 'DISPATCH'
       AND JSON_EXTRACT(data, '$.resolved') IS NULL
       AND JSON_EXTRACT(data, '$.pid') = ?`,
  ).all(pid) as Array<{ id: string }>;

  for (const row of rows) {
    resolveDispatchEvent(db, io, row.id, 'abandoned');
  }

  return rows.length;
}

/** Resolve all unresolved DISPATCH events linked to a specific dispatch ID.
 *  Called when a SESSION_END event includes dispatch_id from ORBITAL_DISPATCH_ID env var.
 *  Defaults to 'abandoned' — successful completions emit AGENT_COMPLETED first
 *  which resolves via inferScopeStatus as 'completed'. */
export function resolveDispatchesByDispatchId(
  db: Database.Database,
  io: Server,
  dispatchId: string,
): number {
  const row = db.prepare(
    `SELECT id FROM events
     WHERE id = ? AND type = 'DISPATCH' AND JSON_EXTRACT(data, '$.resolved') IS NULL`,
  ).get(dispatchId) as { id: string } | undefined;

  if (!row) return 0;
  resolveDispatchEvent(db, io, row.id, 'abandoned');
  return 1;
}

/** Fallback age threshold for dispatches without a linked PID (30 minutes). */
const STALE_AGE_MS = 30 * 60 * 1000;

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

    let data: Record<string, unknown>;
    try {
      data = JSON.parse(row.data);
    } catch (e) {
      console.error(`[Orbital] Failed to parse DISPATCH event data for scope ${row.scope_id}:`, e);
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

  return [...active];
}

/** Resolve stale DISPATCH events. Three staleness criteria:
 *  1. Scope already in a terminal state (as defined by workflow config)
 *  2. Linked PID is no longer running (session ended/crashed)
 *  3. No linked PID and dispatch older than STALE_AGE_MS (fallback)
 *  Called once at startup and periodically to clean up unresolved dispatches.
 *
 *  NOTE: Does NOT revert scope status. Skills like /scope-implement intentionally
 *  keep scopes at the transition target after completion. Auto-reverting was
 *  destroying completed work and deleting scope files. Users can manually
 *  move scopes back from the dashboard if needed. */
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
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(row.data);
    } catch (e) {
      console.error(`[Orbital] Failed to parse DISPATCH event ${row.id} data:`, e);
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
      console.error(`[Orbital] Failed to parse DISPATCH event data for scope ${row.scope_id}:`, e);
      continue;
    }
    const transition = data.transition as Record<string, unknown> | null;
    const resolved = data.resolved as Record<string, unknown> | null;
    const fromStatus = transition?.from as string ?? null;
    const abandonedAt = resolved?.at as string ?? row.timestamp;

    result.push({ scope_id: row.scope_id, from_status: fromStatus, abandoned_at: abandonedAt });
  }

  return result;
}
