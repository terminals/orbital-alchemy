import type {
  WorkflowConfig, WorkflowList, WorkflowEdge, WorkflowHook,
  TransitionContext, TransitionResult, EdgeDirection,
  HookCategory, HookEnforcement,
} from './workflow-config.js';
import { getHookEnforcement } from './workflow-config.js';

// ─── WorkflowEngine ─────────────────────────────────────────
//
// Config-driven query layer over the WorkflowConfig JSON.
// Pure class — no I/O, no global state, no side effects.

export class WorkflowEngine {
  private config!: WorkflowConfig;
  private listMap!: Map<string, WorkflowList>;
  private edgeMap!: Map<string, WorkflowEdge>;
  private edgesByFrom!: Map<string, WorkflowEdge[]>;
  private statusOrder!: Map<string, number>;
  private hookMap!: Map<string, WorkflowHook>;
  private terminalStatuses!: Set<string>;
  private allowedPrefixes!: string[];

  constructor(config: WorkflowConfig) {
    this.init(config);
  }

  /**
   * Hot-reload the engine with a new config. All services holding a reference
   * to this engine instance will see the updated config immediately.
   */
  reload(config: WorkflowConfig): void {
    this.init(config);
  }

  private init(config: WorkflowConfig): void {
    this.config = config;

    if (!config.lists.length) throw new Error('WorkflowConfig must have at least 1 list');
    if (!config.edges.length) throw new Error('WorkflowConfig must have at least 1 edge');

    const entryPoints = config.lists.filter((l) => l.isEntryPoint);
    if (entryPoints.length !== 1) {
      throw new Error(`WorkflowConfig must have exactly 1 entry point, found ${entryPoints.length}`);
    }

    this.listMap = new Map(config.lists.map((l) => [l.id, l]));
    this.edgeMap = new Map(config.edges.map((e) => [`${e.from}:${e.to}`, e]));

    this.edgesByFrom = new Map<string, WorkflowEdge[]>();
    for (const edge of config.edges) {
      const existing = this.edgesByFrom.get(edge.from);
      if (existing) existing.push(edge);
      else this.edgesByFrom.set(edge.from, [edge]);
    }

    this.statusOrder = new Map(config.lists.map((l) => [l.id, l.order]));
    this.hookMap = new Map((config.hooks ?? []).map((h) => [h.id, h]));
    this.terminalStatuses = new Set(config.terminalStatuses ?? []);
    this.allowedPrefixes = config.allowedCommandPrefixes ?? [];
  }

  // ─── Config Access ──────────────────────────────────────────

  getConfig(): Readonly<WorkflowConfig> {
    return this.config;
  }

  getBranchingMode(): 'trunk' | 'worktree' {
    return this.config.branchingMode ?? 'trunk';
  }

  // ─── List Queries ───────────────────────────────────────────

  getLists(): WorkflowList[] {
    return [...this.config.lists].sort((a, b) => a.order - b.order);
  }

  getList(id: string): WorkflowList | undefined {
    return this.listMap.get(id);
  }

  getEntryPoint(): WorkflowList {
    return this.config.lists.find((l) => l.isEntryPoint)!;
  }

  getBatchLists(): WorkflowList[] {
    return this.config.lists.filter((l) => l.supportsBatch);
  }

  getSprintLists(): WorkflowList[] {
    return this.config.lists.filter((l) => l.supportsSprint);
  }

  getBoardColumns(): Array<{ id: string; label: string; color: string }> {
    return this.getLists().map((l) => ({ id: l.id, label: l.label, color: l.color }));
  }

  // ─── Edge Queries ───────────────────────────────────────────

  findEdge(from: string, to: string): WorkflowEdge | undefined {
    return this.edgeMap.get(`${from}:${to}`);
  }

  isValidTransition(from: string, to: string): boolean {
    return this.edgeMap.has(`${from}:${to}`);
  }

  getValidTargets(from: string): string[] {
    return (this.edgesByFrom.get(from) ?? []).map((e) => e.to);
  }

  getAllEdges(): readonly WorkflowEdge[] {
    return this.config.edges;
  }

  getEdgesByDirection(dir: EdgeDirection): WorkflowEdge[] {
    return this.config.edges.filter((e) => e.direction === dir);
  }

  // ─── Validation ─────────────────────────────────────────────

  validateTransition(from: string, to: string, context: TransitionContext): TransitionResult {
    if (!this.listMap.has(to)) {
      return { ok: false, error: `Invalid status: '${to}'`, code: 'INVALID_STATUS' };
    }

    // bulk-sync and rollback are trusted contexts — skip transition checks
    if (context === 'bulk-sync' || context === 'rollback') return { ok: true };

    // Same status is a no-op, always allowed
    if (from === to) return { ok: true };

    const edge = this.findEdge(from, to);
    if (!edge) {
      return { ok: false, error: `Transition '${from}' -> '${to}' is not allowed`, code: 'INVALID_TRANSITION' };
    }

    // patch context cannot trigger dispatch-only transitions
    if (context === 'patch' && edge.dispatchOnly) {
      return { ok: false, error: `Transition '${from}' -> '${to}' requires dispatch (use a skill command)`, code: 'DISPATCH_REQUIRED' };
    }

    return { ok: true };
  }

  isValidStatus(status: string): boolean {
    return this.listMap.has(status);
  }

  isTerminalStatus(status: string): boolean {
    return this.terminalStatuses.has(status);
  }

  // ─── Commands ───────────────────────────────────────────────

  buildCommand(edge: WorkflowEdge, scopeId: number): string | null {
    if (!edge.command) return null;
    return edge.command.replace('{id}', String(scopeId));
  }

  isAllowedCommand(cmd: string): boolean {
    return this.allowedPrefixes.some((prefix) => cmd.startsWith(prefix));
  }

  // ─── Batch / Sprint ─────────────────────────────────────────

  getBatchTargetStatus(column: string): string | undefined {
    const edges = this.edgesByFrom.get(column) ?? [];
    const edge = edges.find(
      (e) => (e.direction === 'forward' || e.direction === 'shortcut') && e.dispatchOnly,
    );
    return edge?.to;
  }

  getBatchCommand(column: string): string | undefined {
    const edges = this.edgesByFrom.get(column) ?? [];
    const edge = edges.find(
      (e) => (e.direction === 'forward' || e.direction === 'shortcut') && e.dispatchOnly,
    );
    if (!edge?.command) return undefined;
    // Strip {id} placeholder — batch consumers handle substitution themselves
    return edge.command.replace(' {id}', '').replace('{id}', '');
  }

  // ─── Event Inference ────────────────────────────────────────

  inferStatus(
    eventType: string,
    currentStatus: string,
    data: Record<string, unknown>,
  ): string | null | { dispatchResolution: true; resolution: string } {
    const rules = (this.config.eventInference ?? []).filter((r) => r.eventType === eventType);
    if (!rules.length) return null;

    // Check rules with conditions first (more specific), then without
    const withConditions = rules.filter((r) => r.conditions && Object.keys(r.conditions).length > 0);
    const withoutConditions = rules.filter((r) => !r.conditions || Object.keys(r.conditions).length === 0);

    const matchedRule = withConditions.find((r) => this.matchesConditions(r.conditions!, data))
      ?? withoutConditions[0]
      ?? null;

    if (!matchedRule) return null;

    // Handle dispatch resolution (e.g. AGENT_COMPLETED with outcome)
    if (matchedRule.conditions?.dispatchResolution === true) {
      const outcome = data.outcome as string;
      return { dispatchResolution: true, resolution: outcome === 'failure' ? 'failed' : 'completed' };
    }

    // Determine target status
    let newStatus: string;
    if (matchedRule.targetStatus === '' && matchedRule.dataField) {
      const rawValue = String(data[matchedRule.dataField] ?? '');
      if (matchedRule.dataMap) {
        newStatus = matchedRule.dataMap[rawValue] ?? matchedRule.dataMap['_default'] ?? '';
      } else {
        newStatus = rawValue;
      }
    } else {
      newStatus = matchedRule.targetStatus;
    }

    if (!newStatus) return null;

    // Forward-only guard: event inference must not regress scope status
    if (matchedRule.forwardOnly) {
      const currentOrder = this.statusOrder.get(currentStatus) ?? -1;
      const newOrder = this.statusOrder.get(newStatus) ?? -1;
      if (newOrder <= currentOrder) return null;
    }

    return newStatus;
  }

  private matchesConditions(conditions: Record<string, unknown>, data: Record<string, unknown>): boolean {
    for (const [key, expected] of Object.entries(conditions)) {
      // dispatchResolution is a flag, not a data check
      if (key === 'dispatchResolution') continue;

      const actual = data[key];
      if (Array.isArray(expected)) {
        if (!expected.includes(actual)) return false;
      } else {
        if (actual !== expected) return false;
      }
    }
    return true;
  }

  // ─── Git / Lifecycle ────────────────────────────────────────

  getListByGitBranch(branch: string): WorkflowList | undefined {
    return this.config.lists.find((l) => l.gitBranch === branch);
  }

  getGitBranch(listId: string): string | undefined {
    return this.listMap.get(listId)?.gitBranch;
  }

  getSessionKey(listId: string): string | undefined {
    return this.listMap.get(listId)?.sessionKey;
  }

  getActiveHooksForList(listId: string): string[] {
    return this.listMap.get(listId)?.activeHooks ?? [];
  }

  getAgentsForEdge(from: string, to: string): string[] {
    return this.findEdge(from, to)?.agents ?? [];
  }

  // ─── Status Order ───────────────────────────────────────────

  getStatusOrder(status: string): number {
    return this.statusOrder.get(status) ?? -1;
  }

  isForwardMovement(from: string, to: string): boolean {
    return this.getStatusOrder(to) > this.getStatusOrder(from);
  }

  // ─── Hooks ──────────────────────────────────────────────────

  getHooksForEdge(from: string, to: string): WorkflowHook[] {
    const edge = this.findEdge(from, to);
    if (!edge?.hooks?.length) return [];
    return edge.hooks
      .map((id) => this.hookMap.get(id))
      .filter((h): h is WorkflowHook => h !== undefined);
  }

  getAllHooks(): readonly WorkflowHook[] {
    return this.config.hooks ?? [];
  }

  getHookEnforcement(hook: WorkflowHook): HookEnforcement {
    return getHookEnforcement(hook);
  }

  getHooksByCategory(category: HookCategory): WorkflowHook[] {
    return (this.config.hooks ?? []).filter((h) => h.category === category);
  }

  // ─── Generation ─────────────────────────────────────────────

  generateCSSVariables(): string {
    return this.getLists()
      .map((l) => `--status-${l.id}: ${l.color};`)
      .join('\n');
  }

  generateShellManifest(): string {
    const lines: string[] = [];
    const sorted = this.getLists();

    // Header
    lines.push('#!/bin/bash');
    lines.push('# Auto-generated by WorkflowEngine — DO NOT EDIT');
    lines.push(`# Generated: ${new Date().toISOString()}`);
    lines.push(`# Workflow: "${this.config.name}" (version ${this.config.version})`);
    lines.push('');

    // Branching mode
    lines.push('# ─── Branching mode (trunk or worktree) ───');
    lines.push(`WORKFLOW_BRANCHING_MODE="${this.getBranchingMode()}"`);
    lines.push('');

    // Valid statuses
    lines.push('# ─── Valid statuses (space-separated) ───');
    lines.push(`WORKFLOW_STATUSES="${sorted.map((l) => l.id).join(' ')}"`);
    lines.push('');

    // Directory statuses
    lines.push('# ─── Statuses that have a scopes/ subdirectory ───');
    const dirStatuses = sorted.filter((l) => l.hasDirectory).map((l) => l.id);
    lines.push(`WORKFLOW_DIR_STATUSES="${dirStatuses.join(' ')}"`);
    lines.push('');

    // Terminal statuses
    lines.push('# ─── Terminal statuses ───');
    lines.push(`WORKFLOW_TERMINAL_STATUSES="${[...this.terminalStatuses].join(' ')}"`);
    lines.push('');

    // Entry point
    lines.push('# ─── Entry point status ───');
    lines.push(`WORKFLOW_ENTRY_STATUS="${this.getEntryPoint().id}"`);
    lines.push('');

    // Edges
    lines.push('# ─── Transition edges (from:to:sessionKey) ───');
    lines.push('WORKFLOW_EDGES=(');
    for (const edge of this.config.edges) {
      const targetList = this.listMap.get(edge.to);
      const sessionKey = targetList?.sessionKey ?? '';
      lines.push(`  "${edge.from}:${edge.to}:${sessionKey}"`);
    }
    lines.push(')');
    lines.push('');

    // Branch map
    lines.push('# ─── Branch-to-transition mapping (gitBranch:from:to:sessionKey) ───');
    lines.push('WORKFLOW_BRANCH_MAP=(');
    for (const edge of this.config.edges) {
      const targetList = this.listMap.get(edge.to);
      if (targetList?.gitBranch) {
        const sessionKey = targetList.sessionKey ?? '';
        lines.push(`  "${targetList.gitBranch}:${edge.from}:${edge.to}:${sessionKey}"`);
      }
    }
    lines.push(')');
    lines.push('');

    // Commit branch patterns
    lines.push('# ─── Commit session branch patterns (regex) ───');
    lines.push(`WORKFLOW_COMMIT_BRANCHES="${this.config.commitBranchPatterns ?? ''}"`);
    lines.push('');

    // Direction aliases (deployment edges: forward+dispatchOnly targeting deployment-group lists)
    lines.push('# ─── Backward-compat direction aliases (alias:from:to:sessionKey) ───');
    lines.push('WORKFLOW_DIRECTION_ALIASES=(');
    for (const edge of this.config.edges) {
      if (edge.direction !== 'forward' || !edge.dispatchOnly) continue;
      const targetList = this.listMap.get(edge.to);
      if (!targetList) continue;
      // Generate aliases for deployment-group targets (dev, staging, production)
      const group = targetList.group;
      if (group === 'deployment') {
        const sessionKey = targetList.sessionKey ?? '';
        lines.push(`  "to-${edge.to}:${edge.from}:${edge.to}:${sessionKey}"`);
      }
    }
    lines.push(')');
    lines.push('');

    // Helper functions
    lines.push('# ─── Helper functions ──────────────────────────────');
    lines.push('');
    lines.push('status_to_dir() {');
    lines.push('  local scope_status="$1"');
    lines.push('  for s in $WORKFLOW_DIR_STATUSES; do');
    lines.push('    [ "$s" = "$scope_status" ] && echo "$scope_status" && return 0');
    lines.push('  done');
    lines.push('  echo "$WORKFLOW_ENTRY_STATUS"');
    lines.push('}');
    lines.push('');
    lines.push('status_to_branch() {');
    lines.push('  local status="$1"');
    lines.push('  for entry in "${WORKFLOW_BRANCH_MAP[@]}"; do');
    lines.push('    IFS=\':\' read -r branch from to skey <<< "$entry"');
    lines.push('    [ "$to" = "$status" ] && echo "$branch" && return 0');
    lines.push('  done');
    lines.push('  echo ""');
    lines.push('}');
    lines.push('');
    lines.push('is_valid_status() {');
    lines.push('  local status="$1"');
    lines.push('  for s in $WORKFLOW_STATUSES; do');
    lines.push('    [ "$s" = "$status" ] && return 0');
    lines.push('  done');
    lines.push('  return 1');
    lines.push('}');

    return lines.join('\n') + '\n';
  }
}
export default WorkflowEngine;
