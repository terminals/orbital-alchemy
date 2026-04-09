import type Database from 'better-sqlite3';
import type { Emitter } from '../project-emitter.js';
import type { ScopeService } from './scope-service.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('sprint');

// ─── Types ──────────────────────────────────────────────────

export type { SprintStatus, SprintScopeStatus, GroupType } from '../../shared/api-types.js';
import type { SprintStatus, SprintScopeStatus, GroupType } from '../../shared/api-types.js';
export type GroupTargetColumn = 'backlog' | 'implementing' | 'review' | 'completed' | 'dev' | 'staging';

export interface BatchDispatchResult {
  commit_sha?: string;
  pr_url?: string;
  pr_number?: number;
  dispatched_at?: string;
}

interface SprintRow {
  id: number;
  name: string;
  status: SprintStatus;
  concurrency_cap: number;
  created_at: string;
  updated_at: string;
  dispatched_at: string | null;
  completed_at: string | null;
  dispatch_meta: string;
  target_column: GroupTargetColumn;
  group_type: GroupType;
  dispatch_result: string;
}

interface SprintScopeRow {
  sprint_id: number;
  scope_id: number;
  layer: number | null;
  dispatch_status: SprintScopeStatus;
  dispatched_at: string | null;
  completed_at: string | null;
  error: string | null;
}

interface UnmetDep {
  scope_id: number;
  title: string;
  status: string;
}

export interface AddScopesResult {
  added: number[];
  unmet_dependencies: Array<{ scope_id: number; missing: UnmetDep[] }>;
}

export interface SprintDetail {
  id: number;
  name: string;
  status: SprintStatus;
  concurrency_cap: number;
  group_type: GroupType;
  target_column: GroupTargetColumn;
  dispatch_result: BatchDispatchResult | null;
  scope_ids: number[];
  scopes: Array<{
    scope_id: number;
    title: string;
    scope_status: string;
    effort_estimate: string | null;
    layer: number | null;
    dispatch_status: SprintScopeStatus;
  }>;
  layers: number[][] | null;
  progress: { pending: number; in_progress: number; completed: number; failed: number; skipped: number };
  created_at: string;
  updated_at: string;
  dispatched_at: string | null;
  completed_at: string | null;
}

// ─── Service ────────────────────────────────────────────────

export class SprintService {
  constructor(
    private db: Database.Database,
    private io: Emitter,
    private scopeService: ScopeService,
  ) {}

  /** Create a new sprint or batch in assembling state */
  create(name: string, options?: { target_column?: GroupTargetColumn; group_type?: GroupType }): SprintDetail {
    const now = new Date().toISOString();
    const targetColumn = options?.target_column ?? 'backlog';
    const groupType = options?.group_type ?? 'sprint';
    const result = this.db.prepare(
      `INSERT INTO sprints (name, status, concurrency_cap, created_at, updated_at, target_column, group_type)
       VALUES (?, 'assembling', 5, ?, ?, ?, ?)`,
    ).run(name, now, now, targetColumn, groupType);

    const sprint = this.getById(Number(result.lastInsertRowid))!;
    log.info('Sprint created', { id: sprint.id, name, group_type: groupType, target_column: targetColumn });
    this.io.emit('sprint:created', sprint);
    return sprint;
  }

  /** Rename a sprint/batch (only while assembling) */
  rename(id: number, name: string): boolean {
    const result = this.db.prepare(
      `UPDATE sprints SET name = ?, updated_at = ? WHERE id = ? AND status = 'assembling'`,
    ).run(name, new Date().toISOString(), id);
    if (result.changes > 0) {
      this.emitUpdate(id);
      return true;
    }
    return false;
  }

  /** List sprints, optionally filtered by status and/or target column */
  getAll(status?: SprintStatus, targetColumn?: GroupTargetColumn): SprintDetail[] {
    let rows: SprintRow[];
    if (status && targetColumn) {
      rows = this.db.prepare('SELECT * FROM sprints WHERE status = ? AND target_column = ? ORDER BY created_at DESC')
        .all(status, targetColumn) as SprintRow[];
    } else if (status) {
      rows = this.db.prepare('SELECT * FROM sprints WHERE status = ? ORDER BY created_at DESC').all(status) as SprintRow[];
    } else if (targetColumn) {
      rows = this.db.prepare('SELECT * FROM sprints WHERE target_column = ? ORDER BY created_at DESC').all(targetColumn) as SprintRow[];
    } else {
      rows = this.db.prepare('SELECT * FROM sprints ORDER BY created_at DESC').all() as SprintRow[];
    }
    if (rows.length === 0) return [];

    // Batch-fetch all sprint_scopes in one query to avoid N+1
    const sprintIds = rows.map(r => r.id);
    const placeholders = sprintIds.map(() => '?').join(',');
    const allScopeRows = this.db.prepare(
      `SELECT sprint_id, scope_id, layer, dispatch_status FROM sprint_scopes
       WHERE sprint_id IN (${placeholders}) ORDER BY layer ASC, scope_id ASC`,
    ).all(...sprintIds) as Array<{ sprint_id: number; scope_id: number; layer: number | null; dispatch_status: SprintScopeStatus }>;

    // Group by sprint_id
    const scopesBySprintId = new Map<number, typeof allScopeRows>();
    for (const ss of allScopeRows) {
      let arr = scopesBySprintId.get(ss.sprint_id);
      if (!arr) { arr = []; scopesBySprintId.set(ss.sprint_id, arr); }
      arr.push(ss);
    }

    return rows.map((row) => this.buildDetailFromScopes(row, scopesBySprintId.get(row.id) ?? []));
  }

  /** Get full sprint detail by ID */
  getById(id: number): SprintDetail | null {
    const row = this.db.prepare('SELECT * FROM sprints WHERE id = ?').get(id) as SprintRow | undefined;
    if (!row) return null;
    return this.buildDetail(row);
  }

  /** Delete a sprint (only if assembling) */
  delete(id: number): boolean {
    const row = this.db.prepare('SELECT status FROM sprints WHERE id = ?').get(id) as { status: string } | undefined;
    if (!row || row.status !== 'assembling') return false;

    this.db.prepare('DELETE FROM sprint_scopes WHERE sprint_id = ?').run(id);
    this.db.prepare('DELETE FROM sprints WHERE id = ?').run(id);
    this.io.emit('sprint:deleted', { id });
    return true;
  }

  /** Add scopes to a sprint; returns which were added and any unmet dependencies */
  addScopes(sprintId: number, scopeIds: number[]): AddScopesResult | null {
    const sprint = this.db.prepare('SELECT * FROM sprints WHERE id = ?').get(sprintId) as SprintRow | undefined;
    if (!sprint || sprint.status !== 'assembling') return null;

    // Existing scope IDs already in this sprint
    const existingIds = new Set(
      (this.db.prepare('SELECT scope_id FROM sprint_scopes WHERE sprint_id = ?').all(sprintId) as Array<{ scope_id: number }>)
        .map((r) => r.scope_id),
    );

    const added: number[] = [];
    const unmet: Array<{ scope_id: number; missing: UnmetDep[] }> = [];

    const insert = this.db.prepare(
      `INSERT OR IGNORE INTO sprint_scopes (sprint_id, scope_id, dispatch_status)
       VALUES (?, ?, 'pending')`,
    );

    for (const scopeId of scopeIds) {
      if (existingIds.has(scopeId)) continue;

      // Check dependencies via cache
      const scope = this.scopeService.getById(scopeId);
      if (!scope) continue;

      // W-8: For batch groups, validate scope status matches target column
      if (sprint.group_type === 'batch' && scope.status !== sprint.target_column) {
        continue; // silently skip — frontend shows toast for rejected drops
      }

      const missing: UnmetDep[] = [];

      for (const depId of scope.blocked_by) {
        if (existingIds.has(depId) || scopeIds.includes(depId)) continue;
        // Check if dependency is already complete (dev or beyond)
        const dep = this.scopeService.getById(depId);
        if (!dep) continue;
        const completedStatuses = ['dev', 'staging', 'production'];
        if (!completedStatuses.includes(dep.status)) {
          missing.push({ scope_id: dep.id, title: dep.title, status: dep.status });
        }
      }

      if (missing.length > 0) {
        unmet.push({ scope_id: scopeId, missing });
      }

      insert.run(sprintId, scopeId);
      existingIds.add(scopeId);
      added.push(scopeId);
    }

    this.touchUpdatedAt(sprintId);
    this.emitUpdate(sprintId);
    return { added, unmet_dependencies: unmet };
  }

  /** Remove scopes from a sprint (assembling only) */
  removeScopes(sprintId: number, scopeIds: number[]): boolean {
    const sprint = this.db.prepare('SELECT status FROM sprints WHERE id = ?').get(sprintId) as { status: string } | undefined;
    if (!sprint || sprint.status !== 'assembling') return false;

    const remove = this.db.prepare('DELETE FROM sprint_scopes WHERE sprint_id = ? AND scope_id = ?');
    for (const scopeId of scopeIds) {
      remove.run(sprintId, scopeId);
    }

    this.touchUpdatedAt(sprintId);
    this.emitUpdate(sprintId);
    return true;
  }

  /** Update sprint status */
  updateStatus(id: number, status: SprintStatus): boolean {
    const now = new Date().toISOString();
    const extras: Record<string, string> = {};
    if (status === 'dispatched') extras.dispatched_at = now;
    if (status === 'completed' || status === 'failed' || status === 'cancelled') extras.completed_at = now;

    const setClauses = ['status = ?', 'updated_at = ?'];
    const params: unknown[] = [status, now];

    for (const [col, val] of Object.entries(extras)) {
      setClauses.push(`${col} = ?`);
      params.push(val);
    }
    params.push(id);

    const result = this.db.prepare(`UPDATE sprints SET ${setClauses.join(', ')} WHERE id = ?`).run(...params);
    if (result.changes > 0) {
      log.info('Sprint status updated', { id, status });
      this.emitUpdate(id);
      if (status === 'completed') {
        const detail = this.getById(id);
        if (detail) this.io.emit('sprint:completed', detail);
      }
    }
    return result.changes > 0;
  }

  /** Update a sprint scope's dispatch status */
  updateScopeStatus(sprintId: number, scopeId: number, status: SprintScopeStatus, error?: string): void {
    const now = new Date().toISOString();
    const extras: string[] = [];
    const params: unknown[] = [status];

    if (status === 'dispatched') {
      extras.push('dispatched_at = ?');
      params.push(now);
    }
    if (status === 'completed' || status === 'failed' || status === 'skipped') {
      extras.push('completed_at = ?');
      params.push(now);
    }
    if (error != null) {
      extras.push('error = ?');
      params.push(error);
    }

    const setClauses = ['dispatch_status = ?', ...extras];
    params.push(sprintId, scopeId);

    this.db.prepare(
      `UPDATE sprint_scopes SET ${setClauses.join(', ')} WHERE sprint_id = ? AND scope_id = ?`,
    ).run(...params);

    this.emitUpdate(sprintId);
  }

  /** Persist layer assignments for all scopes in a sprint */
  setLayers(sprintId: number, layers: number[][]): void {
    const update = this.db.prepare('UPDATE sprint_scopes SET layer = ? WHERE sprint_id = ? AND scope_id = ?');
    for (let i = 0; i < layers.length; i++) {
      for (const scopeId of layers[i]) {
        update.run(i, sprintId, scopeId);
      }
    }

    this.db.prepare('UPDATE sprints SET dispatch_meta = ?, updated_at = ? WHERE id = ?')
      .run(JSON.stringify({ layers }), new Date().toISOString(), sprintId);
  }

  /** Find the active sprint containing a given scope (for orchestrator callbacks) */
  findActiveSprintForScope(scopeId: number): { sprint_id: number } | null {
    return this.db.prepare(
      `SELECT ss.sprint_id FROM sprint_scopes ss
       JOIN sprints s ON s.id = ss.sprint_id
       WHERE ss.scope_id = ? AND s.status IN ('dispatched', 'in_progress')
       LIMIT 1`,
    ).get(scopeId) as { sprint_id: number } | null;
  }

  /** Find any active group (assembling/dispatched/in_progress) containing a scope.
   *  Used to guard against moving scopes that are part of an active batch/sprint. */
  getActiveGroupForScope(scopeId: number): { sprint_id: number; group_type: GroupType } | null {
    return this.db.prepare(
      `SELECT ss.sprint_id, s.group_type FROM sprint_scopes ss
       JOIN sprints s ON s.id = ss.sprint_id
       WHERE ss.scope_id = ? AND s.status IN ('assembling', 'dispatched', 'in_progress')
       LIMIT 1`,
    ).get(scopeId) as { sprint_id: number; group_type: GroupType } | null;
  }

  /** Force-remove a scope from a sprint regardless of sprint status.
   *  Used for cleanup when a scope's status diverges from the batch target. */
  forceRemoveScope(sprintId: number, scopeId: number): void {
    this.db.prepare('DELETE FROM sprint_scopes WHERE sprint_id = ? AND scope_id = ?')
      .run(sprintId, scopeId);
    this.touchUpdatedAt(sprintId);
    this.emitUpdate(sprintId);
  }

  /** Get all sprint scopes for a sprint */
  getSprintScopes(sprintId: number): SprintScopeRow[] {
    return this.db.prepare('SELECT * FROM sprint_scopes WHERE sprint_id = ?').all(sprintId) as SprintScopeRow[];
  }

  /** Store typed dispatch result (commit SHA, PR URL, etc.) for a batch */
  updateDispatchResult(id: number, result: BatchDispatchResult): void {
    this.db.prepare('UPDATE sprints SET dispatch_result = ?, updated_at = ? WHERE id = ?')
      .run(JSON.stringify(result), new Date().toISOString(), id);
    this.emitUpdate(id);
  }

  /** Check if there's an active (assembling/dispatched/in_progress) batch in the given column */
  findActiveBatchForColumn(targetColumn: GroupTargetColumn): SprintDetail | null {
    const row = this.db.prepare(
      `SELECT * FROM sprints WHERE group_type = 'batch' AND target_column = ? AND status IN ('assembling', 'dispatched', 'in_progress')
       ORDER BY created_at DESC LIMIT 1`,
    ).get(targetColumn) as SprintRow | undefined;
    if (!row) return null;
    return this.buildDetail(row);
  }

  // ─── Private Helpers ────────────────────────────────────────

  private buildDetail(row: SprintRow): SprintDetail {
    const ssRows = this.db.prepare(
      `SELECT scope_id, layer, dispatch_status FROM sprint_scopes
       WHERE sprint_id = ? ORDER BY layer ASC, scope_id ASC`,
    ).all(row.id) as Array<{ scope_id: number; layer: number | null; dispatch_status: SprintScopeStatus }>;
    return this.buildDetailFromScopes(row, ssRows);
  }

  private buildDetailFromScopes(
    row: SprintRow,
    ssRows: Array<{ scope_id: number; layer: number | null; dispatch_status: SprintScopeStatus }>,
  ): SprintDetail {
    const progress = { pending: 0, in_progress: 0, completed: 0, failed: 0, skipped: 0 };
    const scopes: SprintDetail['scopes'] = [];

    for (const ss of ssRows) {
      const scope = this.scopeService.getById(ss.scope_id);
      scopes.push({
        scope_id: ss.scope_id,
        title: scope?.title ?? `Scope ${ss.scope_id}`,
        scope_status: scope?.status ?? 'unknown',
        effort_estimate: scope?.effort_estimate ?? null,
        layer: ss.layer,
        dispatch_status: ss.dispatch_status,
      });

      const key = ss.dispatch_status === 'dispatched' || ss.dispatch_status === 'queued'
        ? 'in_progress' : ss.dispatch_status;
      if (key in progress) progress[key as keyof typeof progress]++;
      else progress.pending++;
    }

    let layers: number[][] | null = null;
    try {
      const meta = JSON.parse(row.dispatch_meta || '{}');
      if (meta.layers) layers = meta.layers;
    } catch { /* ignore */ }

    let dispatchResult: BatchDispatchResult | null = null;
    try {
      const parsed = JSON.parse(row.dispatch_result || '{}');
      if (Object.keys(parsed).length > 0) dispatchResult = parsed;
    } catch { /* ignore */ }

    return {
      id: row.id,
      name: row.name,
      status: row.status,
      concurrency_cap: row.concurrency_cap,
      group_type: row.group_type ?? 'sprint',
      target_column: row.target_column ?? 'backlog',
      dispatch_result: dispatchResult,
      scope_ids: ssRows.map((ss) => ss.scope_id),
      scopes,
      layers,
      progress,
      created_at: row.created_at,
      updated_at: row.updated_at,
      dispatched_at: row.dispatched_at,
      completed_at: row.completed_at,
    };
  }

  private touchUpdatedAt(id: number): void {
    this.db.prepare('UPDATE sprints SET updated_at = ? WHERE id = ?').run(new Date().toISOString(), id);
  }

  private emitUpdate(id: number): void {
    const detail = this.getById(id);
    if (detail) this.io.emit('sprint:updated', detail);
  }
}
