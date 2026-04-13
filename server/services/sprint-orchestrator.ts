import type Database from 'better-sqlite3';
import type { Emitter } from '../project-emitter.js';
import { SprintService } from './sprint-service.js';
import { ScopeService } from './scope-service.js';
import { launchInCategorizedTerminal, escapeForAnsiC, shellQuote, buildSessionName, snapshotSessionPids, discoverNewSession, renameSession } from '../utils/terminal-launcher.js';
import { resolveDispatchEvent, linkPidToDispatch } from '../utils/dispatch-utils.js';
import { buildClaudeFlags, buildEnvVarPrefix } from '../utils/flag-builder.js';
import type { WorkflowEngine } from '../../shared/workflow-engine.js';
import type { OrbitalConfig } from '../config.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('sprint');
const LAUNCH_STAGGER_MS = 2000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Orchestrator ───────────────────────────────────────────

export class SprintOrchestrator {
  constructor(
    private db: Database.Database,
    private io: Emitter,
    private sprintService: SprintService,
    private scopeService: ScopeService,
    private engine: WorkflowEngine,
    private projectRoot: string,
    private config: OrbitalConfig,
  ) {}

  /** Build execution layers using Kahn's topological sort */
  buildExecutionLayers(sprintScopeIds: number[]): { layers: number[][]; cycle: number[] } {
    const sprintSet = new Set(sprintScopeIds);

    // Load dependency info for each scope in the sprint
    const scopeDeps = new Map<number, number[]>();
    for (const id of sprintScopeIds) {
      const scope = this.scopeService.getById(id);
      if (!scope) continue;
      // Only keep deps that are WITHIN the sprint
      scopeDeps.set(id, scope.blocked_by.filter((d) => sprintSet.has(d)));
    }

    // Build in-degree map — in-degree = count of internal deps for each scope
    const inDegree = new Map<number, number>();
    for (const [id, deps] of scopeDeps) {
      inDegree.set(id, deps.length);
    }

    const layers: number[][] = [];
    const remaining = new Set(sprintScopeIds);

    while (remaining.size > 0) {
      // Find all nodes with in-degree 0
      const layer: number[] = [];
      for (const id of remaining) {
        if ((inDegree.get(id) ?? 0) === 0) {
          layer.push(id);
        }
      }

      if (layer.length === 0) {
        // Cycle detected — return remaining as cycle
        return { layers, cycle: [...remaining] };
      }

      // Remove this layer and decrement dependents
      for (const id of layer) {
        remaining.delete(id);
      }

      // Decrement in-degree for scopes that depended on this layer's scopes
      for (const id of remaining) {
        const deps = scopeDeps.get(id) ?? [];
        let newDeg = 0;
        for (const dep of deps) {
          if (remaining.has(dep)) newDeg++;
        }
        inDegree.set(id, newDeg);
      }

      layers.push(layer.sort((a, b) => a - b));
    }

    return { layers, cycle: [] };
  }

  /** Start sprint dispatch: build layers, persist, launch Layer 0 */
  async startSprint(sprintId: number): Promise<{ ok: boolean; error?: string; layers?: number[][] }> {
    const sprint = this.sprintService.getById(sprintId);
    if (!sprint) return { ok: false, error: 'Sprint not found' };
    if (sprint.status !== 'assembling') return { ok: false, error: `Sprint status is '${sprint.status}', expected 'assembling'` };
    if (sprint.scope_ids.length === 0) return { ok: false, error: 'Sprint has no scopes' };

    // Build dependency graph
    const { layers, cycle } = this.buildExecutionLayers(sprint.scope_ids);
    if (cycle.length > 0) {
      return { ok: false, error: `Dependency cycle detected among scopes: ${cycle.join(', ')}` };
    }

    // Persist layer assignments
    this.sprintService.setLayers(sprintId, layers);
    this.sprintService.updateStatus(sprintId, 'dispatched');

    log.info('Sprint started', { id: sprintId, layers: layers.length, scopes: sprint.scope_ids.length });

    // Dispatch Layer 0
    await this.dispatchLayer(sprintId, layers[0], sprint.concurrency_cap);

    return { ok: true, layers };
  }

  /** Called when a scope reaches 'dev' status — advance the sprint */
  async onScopeReachedDev(scopeId: number): Promise<void> {
    const match = this.sprintService.findActiveSprintForScope(scopeId);
    if (!match) return;

    // Batches are managed by BatchOrchestrator — don't dispatch individual scopes
    const sprintId = match.sprint_id;
    const sprint = this.sprintService.getById(sprintId);
    if (!sprint || sprint.group_type === 'batch') return;

    log.debug('Scope reached dev', { scopeId, sprintId });
    this.sprintService.updateScopeStatus(sprintId, scopeId, 'completed');

    // Ensure sprint is in 'in_progress' state
    if (sprint.status === 'dispatched') {
      this.sprintService.updateStatus(sprintId, 'in_progress');
    }

    // Check for newly unblocked scopes and dispatch them
    await this.dispatchUnblockedScopes(sprintId);
    this.checkSprintCompletion(sprintId);
  }

  /** Called when a scope fails during sprint execution */
  async onScopeFailed(scopeId: number, error?: string): Promise<void> {
    const match = this.sprintService.findActiveSprintForScope(scopeId);
    if (!match) return;

    const sprintId = match.sprint_id;
    this.sprintService.updateScopeStatus(sprintId, scopeId, 'failed', error);

    // Skip downstream dependents transitively
    this.skipDownstream(sprintId, scopeId);

    // Try dispatching other unblocked parallel paths
    await this.dispatchUnblockedScopes(sprintId);
    this.checkSprintCompletion(sprintId);
  }

  /** Cancel an active sprint */
  cancelSprint(sprintId: number): boolean {
    const sprint = this.sprintService.getById(sprintId);
    if (!sprint) return false;
    if (!['assembling', 'dispatched', 'in_progress'].includes(sprint.status)) return false;

    // Mark pending/queued scopes as skipped
    const scopes = this.sprintService.getSprintScopes(sprintId);
    for (const ss of scopes) {
      if (ss.dispatch_status === 'pending' || ss.dispatch_status === 'queued') {
        this.sprintService.updateScopeStatus(sprintId, ss.scope_id, 'skipped');
      }
    }

    this.sprintService.updateStatus(sprintId, 'cancelled');
    return true;
  }

  /** Recover active sprints after server restart */
  async recoverActiveSprints(): Promise<void> {
    const active = this.db.prepare(
      `SELECT id FROM sprints WHERE group_type = 'sprint' AND status IN ('dispatched', 'in_progress')`,
    ).all() as Array<{ id: number }>;

    if (active.length > 0) {
      log.info('Recovering active sprints', { count: active.length });
    }

    for (const { id } of active) {
      // Check if any scopes completed while server was down
      const scopes = this.sprintService.getSprintScopes(id);
      for (const ss of scopes) {
        if (ss.dispatch_status === 'dispatched' || ss.dispatch_status === 'in_progress') {
          // Check actual scope status
          const scope = this.scopeService.getById(ss.scope_id);
          if (scope && this.engine.getStatusOrder(scope.status) >= this.engine.getStatusOrder('dev')) {
            this.sprintService.updateScopeStatus(id, ss.scope_id, 'completed');
          }
        }
      }

      await this.dispatchUnblockedScopes(id);
      this.checkSprintCompletion(id);
    }
  }

  /** Get execution graph data for visualization */
  getExecutionGraph(sprintId: number): { layers: number[][]; edges: Array<{ from: number; to: number }> } | null {
    const sprint = this.sprintService.getById(sprintId);
    if (!sprint) return null;

    const layers = sprint.layers ?? this.buildExecutionLayers(sprint.scope_ids).layers;
    const sprintSet = new Set(sprint.scope_ids);
    const edges: Array<{ from: number; to: number }> = [];

    for (const scopeId of sprint.scope_ids) {
      const scope = this.scopeService.getById(scopeId);
      if (!scope) continue;
      for (const dep of scope.blocked_by) {
        if (sprintSet.has(dep)) {
          edges.push({ from: dep, to: scopeId });
        }
      }
    }

    return { layers, edges };
  }

  // ─── Private Helpers ────────────────────────────────────────

  private async dispatchLayer(sprintId: number, scopeIds: number[], concurrencyCap: number): Promise<void> {
    const toDispatch = scopeIds.slice(0, concurrencyCap);

    for (let i = 0; i < toDispatch.length; i++) {
      const scopeId = toDispatch[i];

      // Capture current status before optimistic update (for rollback)
      const currentScope = this.scopeService.getById(scopeId);
      const previousStatus = currentScope?.status ?? 'implementing';

      // Resolve command and target status from workflow engine
      const sprint = this.sprintService.getById(sprintId);
      const targetColumn = sprint?.target_column ?? 'backlog';
      const edgeCommand = this.engine.getBatchCommand(targetColumn);
      const targetStatus = this.engine.getBatchTargetStatus(targetColumn);

      // Record DISPATCH event
      const eventId = crypto.randomUUID();
      const command = edgeCommand ?? `/scope-implement ${scopeId}`;
      this.db.prepare(
        `INSERT INTO events (id, type, scope_id, session_id, agent, data, timestamp)
         VALUES (?, 'DISPATCH', ?, NULL, 'sprint-orchestrator', ?, ?)`,
      ).run(eventId, scopeId, JSON.stringify({ command, sprint_id: sprintId, resolved: null }), new Date().toISOString());

      this.io.emit('event:new', {
        id: eventId, type: 'DISPATCH', scope_id: scopeId,
        session_id: null, agent: 'sprint-orchestrator',
        data: { command, sprint_id: sprintId, resolved: null },
        timestamp: new Date().toISOString(),
      });

      // Update scope + sprint_scope status
      if (targetStatus) {
        this.scopeService.updateStatus(scopeId, targetStatus, 'dispatch');
      }
      this.sprintService.updateScopeStatus(sprintId, scopeId, 'dispatched');

      // Build scope-aware session name and snapshot PIDs
      const scopeRow = this.scopeService.getById(scopeId);
      const sessionName = buildSessionName({ scopeId, title: scopeRow?.title, command });
      const beforePids = snapshotSessionPids(this.projectRoot);

      // Launch in iTerm — interactive TUI mode for full visibility
      const escaped = escapeForAnsiC(command);
      const flagsStr = buildClaudeFlags(this.config.claude.dispatchFlags);
      const envPrefix = buildEnvVarPrefix(this.config.dispatch.envVars);
      const fullCmd = `cd '${shellQuote(this.projectRoot)}' && ${envPrefix}ORBITAL_DISPATCH_ID='${shellQuote(eventId)}' claude ${flagsStr} $'${escaped}'`;
      try {
        await launchInCategorizedTerminal(command, fullCmd, sessionName);

        // Fire-and-forget: discover session PID, link to dispatch, and rename
        discoverNewSession(this.projectRoot, beforePids)
          .then((session) => {
            if (!session) return;
            linkPidToDispatch(this.db, eventId, session.pid);
            if (sessionName) renameSession(this.projectRoot, session.sessionId, sessionName);
          })
          .catch(err => log.error('PID discovery failed', { error: err.message }));
      } catch (err) {
        // Rollback scope status to previous value
        this.scopeService.updateStatus(scopeId, previousStatus, 'rollback');
        this.sprintService.updateScopeStatus(sprintId, scopeId, 'failed', `Launch failed: ${err}`);
        resolveDispatchEvent(this.db, this.io, eventId, 'failed', `Launch failed: ${err}`);
      }

      // Stagger launches to prevent AppleScript race conditions
      if (i < toDispatch.length - 1) {
        await sleep(LAUNCH_STAGGER_MS);
      }
    }
  }

  private async dispatchUnblockedScopes(sprintId: number): Promise<void> {
    const sprint = this.sprintService.getById(sprintId);
    if (!sprint) return;

    const scopes = this.sprintService.getSprintScopes(sprintId);
    const completedSet = new Set(
      scopes.filter((ss) => ss.dispatch_status === 'completed').map((ss) => ss.scope_id),
    );
    const activeCount = scopes.filter(
      (ss) => ss.dispatch_status === 'dispatched' || ss.dispatch_status === 'in_progress',
    ).length;
    const available = sprint.concurrency_cap - activeCount;
    if (available <= 0) return;

    // Find pending scopes whose internal deps are all completed
    const ready: number[] = [];
    for (const ss of scopes) {
      if (ss.dispatch_status !== 'pending') continue;

      const scope = this.scopeService.getById(ss.scope_id);
      if (!scope) continue;
      const internalDeps = scope.blocked_by.filter((d) => sprint.scope_ids.includes(d));
      const allMet = internalDeps.every((d) => completedSet.has(d));

      if (allMet) ready.push(ss.scope_id);
      if (ready.length >= available) break;
    }

    if (ready.length > 0) {
      await this.dispatchLayer(sprintId, ready, available);
    }
  }

  private skipDownstream(sprintId: number, failedScopeId: number): void {
    const scopes = this.sprintService.getSprintScopes(sprintId);
    const sprintScopeIds = scopes.map((ss) => ss.scope_id);

    // Build reverse dependency map: scope → scopes that depend on it
    const dependents = new Map<number, number[]>();
    for (const scopeId of sprintScopeIds) {
      const scope = this.scopeService.getById(scopeId);
      if (!scope) continue;
      for (const dep of scope.blocked_by) {
        if (!dependents.has(dep)) dependents.set(dep, []);
        dependents.get(dep)!.push(scopeId);
      }
    }

    // BFS to find all transitive dependents
    const toSkip = new Set<number>();
    const queue = [failedScopeId];
    while (queue.length > 0) {
      const current = queue.shift()!;
      const downstream = dependents.get(current) ?? [];
      for (const id of downstream) {
        if (!toSkip.has(id)) {
          toSkip.add(id);
          queue.push(id);
        }
      }
    }

    for (const scopeId of toSkip) {
      const ss = scopes.find((s) => s.scope_id === scopeId);
      if (ss && ss.dispatch_status === 'pending') {
        this.sprintService.updateScopeStatus(sprintId, scopeId, 'skipped', `Skipped: dependency ${failedScopeId} failed`);
      }
    }
  }

  private checkSprintCompletion(sprintId: number): void {
    const scopes = this.sprintService.getSprintScopes(sprintId);
    const allDone = scopes.every(
      (ss) => ss.dispatch_status === 'completed' || ss.dispatch_status === 'failed' || ss.dispatch_status === 'skipped',
    );

    if (!allDone) return;

    const anyFailed = scopes.some((ss) => ss.dispatch_status === 'failed');
    this.sprintService.updateStatus(sprintId, anyFailed ? 'failed' : 'completed');
  }
}
