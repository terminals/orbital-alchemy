import type Database from 'better-sqlite3';
import type { Emitter } from '../project-emitter.js';
import type { SprintService } from './sprint-service.js';
import type { ScopeService } from './scope-service.js';
import { launchInCategorizedTerminal, escapeForAnsiC, shellQuote, snapshotSessionPids, discoverNewSession, isSessionPidAlive } from '../utils/terminal-launcher.js';
import { linkPidToDispatch, resolveDispatchEvent } from '../utils/dispatch-utils.js';
import type { WorkflowEngine } from '../../shared/workflow-engine.js';
import type { OrbitalConfig } from '../config.js';
import { buildClaudeFlags, buildEnvVarPrefix } from '../utils/flag-builder.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('batch');
const VALID_MERGE_MODES = ['push', 'pr'] as const;

// ─── Orchestrator ───────────────────────────────────────────

export class BatchOrchestrator {
  constructor(
    private db: Database.Database,
    private io: Emitter,
    private sprintService: SprintService,
    private scopeService: ScopeService,
    private engine: WorkflowEngine,
    private projectRoot: string,
    private config: OrbitalConfig,
  ) {}

  /** Dispatch a batch — validates constraints and routes to column-specific handler */
  async dispatch(batchId: number, mergeMode?: string): Promise<{ ok: boolean; error?: string }> {
    const batch = this.sprintService.getById(batchId);
    if (!batch) return { ok: false, error: 'Batch not found' };
    if (batch.group_type !== 'batch') return { ok: false, error: 'Not a batch group' };
    if (batch.status !== 'assembling') return { ok: false, error: `Batch status is '${batch.status}', expected 'assembling'` };
    if (batch.scope_ids.length === 0) return { ok: false, error: 'Batch has no scopes' };

    // W-4: One active batch per column
    const existingActive = this.sprintService.findActiveBatchForColumn(batch.target_column);
    if (existingActive && existingActive.id !== batchId) {
      return { ok: false, error: `Column '${batch.target_column}' already has an active batch (ID: ${existingActive.id})` };
    }

    const command = this.engine.getBatchCommand(batch.target_column);
    if (!command) return { ok: false, error: `No dispatch command for column '${batch.target_column}'` };

    // Mark batch as dispatched
    this.sprintService.updateStatus(batchId, 'dispatched');
    log.info('Batch dispatched', { id: batchId, target_column: batch.target_column, scope_ids: batch.scope_ids });

    // Build scope IDs env var prefix (W-1: prepend to command, not process.env)
    const scopeIdsStr = batch.scope_ids.join(',');
    const mergeModeStr = (VALID_MERGE_MODES as readonly string[]).includes(mergeMode ?? '') ? mergeMode! : 'push';

    // Record DISPATCH event
    const eventId = crypto.randomUUID();
    const eventData = {
      command,
      batch_id: batchId,
      scope_ids: batch.scope_ids,
      target_column: batch.target_column,
      batch: true,
      resolved: null,
    };
    this.db.prepare(
      `INSERT INTO events (id, type, scope_id, session_id, agent, data, timestamp)
       VALUES (?, 'DISPATCH', NULL, NULL, 'batch-orchestrator', ?, ?)`,
    ).run(eventId, JSON.stringify(eventData), new Date().toISOString());

    this.io.emit('event:new', {
      id: eventId, type: 'DISPATCH', scope_id: null,
      session_id: null, agent: 'batch-orchestrator',
      data: eventData, timestamp: new Date().toISOString(),
    });

    // Launch single CLI session with BATCH_SCOPE_IDS prepended to command
    const escaped = escapeForAnsiC(command);
    const flagsStr = buildClaudeFlags({ ...this.config.claude.dispatchFlags, printMode: true });
    const envPrefix = buildEnvVarPrefix(this.config.dispatch.envVars);
    const fullCmd = `cd '${shellQuote(this.projectRoot)}' && ${envPrefix}BATCH_SCOPE_IDS='${scopeIdsStr}' MERGE_MODE='${mergeModeStr}' claude ${flagsStr} $'${escaped}'`;
    const beforePids = snapshotSessionPids(this.projectRoot);

    try {
      await launchInCategorizedTerminal(command, fullCmd);

      // Store dispatch result timestamp
      this.sprintService.updateDispatchResult(batchId, {
        dispatched_at: new Date().toISOString(),
      });

      // Fire-and-forget: discover session PID and link to dispatch
      discoverNewSession(this.projectRoot, beforePids)
        .then((session) => {
          if (!session) return;
          linkPidToDispatch(this.db, eventId, session.pid);
          // Store PID on the batch for two-phase completion
          const currentResult = this.sprintService.getById(batchId)?.dispatch_result ?? {};
          this.sprintService.updateDispatchResult(batchId, {
            ...currentResult,
            dispatched_at: currentResult.dispatched_at ?? new Date().toISOString(),
          });
          // Store PID in event data for later liveness checking
          const row = this.db.prepare('SELECT data FROM events WHERE id = ?').get(eventId) as { data: string } | undefined;
          if (row) {
            const data = JSON.parse(row.data);
            data.pid = session.pid;
            this.db.prepare('UPDATE events SET data = ? WHERE id = ?').run(JSON.stringify(data), eventId);
          }
        })
        .catch(err => log.error('PID discovery failed', { error: err.message }));

      return { ok: true };
    } catch (err) {
      this.sprintService.updateStatus(batchId, 'failed');
      resolveDispatchEvent(this.db, this.io, eventId, 'failed', String(err));
      return { ok: false, error: `Failed to launch terminal: ${err instanceof Error ? err.message : String(err)}` };
    }
  }

  /** Called when a scope reaches a new status — check if it satisfies a batch,
   *  or remove the scope from the batch if its status diverged from the target. */
  onScopeStatusChanged(scopeId: number, newStatus: string): void {
    // Find any active batch containing this scope
    const match = this.sprintService.findActiveSprintForScope(scopeId);
    if (!match) return;

    const batch = this.sprintService.getById(match.sprint_id);
    if (!batch || batch.group_type !== 'batch') return;

    const expectedStatus = this.engine.getBatchTargetStatus(batch.target_column);
    if (newStatus === expectedStatus || this.engine.isTerminalStatus(newStatus)) {
      this.sprintService.updateScopeStatus(batch.id, scopeId, 'completed');

      // Check if all scopes have transitioned
      if (batch.status === 'dispatched') {
        this.sprintService.updateStatus(batch.id, 'in_progress');
      }
    } else if (newStatus !== batch.target_column) {
      // Scope diverged from batch target — remove it from the batch
      this.sprintService.forceRemoveScope(batch.id, scopeId);

      // If batch is now empty, mark it as failed
      const remaining = this.sprintService.getSprintScopes(batch.id);
      if (remaining.length === 0 && batch.status !== 'assembling') {
        this.sprintService.updateStatus(batch.id, 'failed');
      }
    }
  }

  /** Called when a dispatched session PID dies — second phase of two-phase completion.
   *  Reverts un-transitioned scopes to their pre-dispatch status. */
  onSessionPidDied(batchId: number): void {
    const batch = this.sprintService.getById(batchId);
    if (!batch || batch.group_type !== 'batch') return;
    if (batch.status !== 'dispatched' && batch.status !== 'in_progress') return;

    const scopes = this.sprintService.getSprintScopes(batchId);

    // If batch never reached 'in_progress', the session never started —
    // don't credit any scope regardless of their current workflow status
    if (batch.status === 'dispatched') {
      this.sprintService.updateStatus(batchId, 'failed');
      for (const ss of scopes) {
        this.sprintService.updateScopeStatus(batchId, ss.scope_id, 'failed', 'Session never started');
      }
      return;
    }

    const allTransitioned = scopes.every((ss) => ss.dispatch_status === 'completed');

    if (allTransitioned) {
      this.sprintService.updateStatus(batchId, 'completed');
    } else {
      const pending = scopes.filter((ss) => ss.dispatch_status !== 'completed').map((ss) => ss.scope_id);
      this.sprintService.updateStatus(batchId, 'failed');
      // Mark un-transitioned scopes as failed and revert their status
      for (const scopeId of pending) {
        this.sprintService.updateScopeStatus(batchId, scopeId, 'failed', 'Session exited before scope transitioned');
        // Revert scope to pre-dispatch status (the batch's source column)
        this.scopeService.updateStatus(scopeId, batch.target_column, 'rollback');
      }
    }
  }

  /**
   * Resolve stale batches — catches batches stuck due to lost PIDs, Orbital downtime, or
   * missing PID records. Unlike recoverActiveBatches (which focuses on PID polling),
   * this also resolves batches where no PID was ever recorded.
   */
  resolveStaleBatches(): number {
    const STALE_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes

    const active = this.db.prepare(
      `SELECT id FROM sprints WHERE group_type = 'batch' AND status IN ('dispatched', 'in_progress')`,
    ).all() as Array<{ id: number }>;

    if (active.length > 0) {
      log.debug('Checking stale batches', { activeCount: active.length });
    }

    let resolved = 0;

    for (const { id } of active) {
      const batch = this.sprintService.getById(id);
      if (!batch) continue;

      const scopes = this.sprintService.getSprintScopes(id);
      const expectedStatus = this.engine.getBatchTargetStatus(batch.target_column);

      // Phase 1: auto-complete scopes that reached or passed target status
      for (const ss of scopes) {
        if (ss.dispatch_status === 'pending' || ss.dispatch_status === 'dispatched') {
          const scope = this.scopeService.getById(ss.scope_id);
          if (scope && (scope.status === expectedStatus || this.engine.isTerminalStatus(scope.status))) {
            this.sprintService.updateScopeStatus(id, ss.scope_id, 'completed');
          }
        }
      }

      // Phase 2: check PID liveness (check both unresolved and resolved events —
      // SESSION_END may have resolved the dispatch event before we get here)
      const dispatchEvent = this.db.prepare(
        `SELECT data FROM events
         WHERE type = 'DISPATCH' AND JSON_EXTRACT(data, '$.batch_id') = ?
         ORDER BY timestamp DESC LIMIT 1`,
      ).get(id) as { data: string } | undefined;

      let pidDead = false;

      if (dispatchEvent) {
        let data: Record<string, unknown>;
        try {
          data = JSON.parse(dispatchEvent.data) as Record<string, unknown>;
        } catch {
          pidDead = true;
          // Fall through to resolution below
        }
        if (!pidDead) {
          // If the dispatch event is already resolved, the session is definitely done
          if (data!.resolved != null) {
            pidDead = true;
          } else if (typeof data!.pid === 'number') {
            pidDead = !isSessionPidAlive(data!.pid);
          } else {
            // No PID recorded — check if batch is old enough to consider stale
            const dispatchedAt = batch.dispatched_at ? new Date(batch.dispatched_at).getTime() : 0;
            pidDead = Date.now() - dispatchedAt > STALE_THRESHOLD_MS;
          }
        }
      } else {
        // No dispatch event at all — check age
        const dispatchedAt = batch.dispatched_at ? new Date(batch.dispatched_at).getTime() : 0;
        pidDead = Date.now() - dispatchedAt > STALE_THRESHOLD_MS;
      }

      if (pidDead) {
        this.onSessionPidDied(id);
        resolved++;
      }
    }

    return resolved;
  }

  /** Recover active batches after server restart (W-3) */
  async recoverActiveBatches(): Promise<void> {
    const active = this.db.prepare(
      `SELECT id FROM sprints WHERE group_type = 'batch' AND status IN ('dispatched', 'in_progress')`,
    ).all() as Array<{ id: number }>;

    if (active.length > 0) {
      log.debug('Recovering active batches', { count: active.length });
    }

    for (const { id } of active) {
      const batch = this.sprintService.getById(id);
      if (!batch) continue;

      const scopes = this.sprintService.getSprintScopes(id);
      const expectedStatus = this.engine.getBatchTargetStatus(batch.target_column);

      // Check if scopes reached or passed target status while server was down
      for (const ss of scopes) {
        if (ss.dispatch_status === 'pending' || ss.dispatch_status === 'dispatched') {
          const scope = this.scopeService.getById(ss.scope_id);
          if (scope && (scope.status === expectedStatus || this.engine.isTerminalStatus(scope.status))) {
            this.sprintService.updateScopeStatus(id, ss.scope_id, 'completed');
          }
        }
      }

      // Check if dispatch PID is still alive (include resolved events —
      // SESSION_END may have resolved the dispatch before server restart)
      const dispatchEvent = this.db.prepare(
        `SELECT data FROM events
         WHERE type = 'DISPATCH' AND JSON_EXTRACT(data, '$.batch_id') = ?
         ORDER BY timestamp DESC LIMIT 1`,
      ).get(id) as { data: string } | undefined;

      if (dispatchEvent) {
        const data = JSON.parse(dispatchEvent.data);
        if (data.resolved != null) {
          // Dispatch already resolved — session is done
          this.onSessionPidDied(id);
        } else if (typeof data.pid === 'number' && !isSessionPidAlive(data.pid)) {
          // PID is dead — trigger two-phase completion check
          this.onSessionPidDied(id);
        }
      }
    }
  }
}
