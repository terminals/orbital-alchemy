import type { Phase, WorkflowList, WorkflowEdge } from './workflow-config.js';
export type { Phase } from './workflow-config.js';
import type { WorkflowEngine } from './workflow-engine.js';

// ─── Phase Mapping ──────────────────────────────────────────

/** Infer a list's semantic phase from its properties. */
function inferPhase(list: WorkflowList, terminalStatuses: string[]): Phase {
  // Explicit phase takes priority
  if (list.phase) return list.phase;

  // Terminal statuses or lists with a git branch → shipped
  if (terminalStatuses.includes(list.id) || list.gitBranch) return 'shipped';

  // Entry points and planning group → queued
  if (list.isEntryPoint) return 'queued';
  if (list.group === 'planning') return 'queued';

  // Session key inference
  if (list.sessionKey) {
    if (list.sessionKey.toLowerCase().includes('implement')) return 'active';
    if (list.sessionKey.toLowerCase().includes('review') ||
        list.sessionKey.toLowerCase().includes('gate') ||
        list.sessionKey.toLowerCase().includes('commit') ||
        list.sessionKey.toLowerCase().includes('verify')) return 'review';
    if (list.sessionKey.toLowerCase().includes('push') ||
        list.sessionKey.toLowerCase().includes('deploy')) return 'shipped';
    if (list.sessionKey.toLowerCase().includes('create') ||
        list.sessionKey.toLowerCase().includes('scope')) return 'queued';
  }

  // Group-based inference
  if (list.group === 'development') {
    // Lists earlier in development → active, later → review
    return list.order <= 3 ? 'active' : 'review';
  }
  if (list.group === 'active') return 'active';
  if (list.group?.startsWith('deploy')) return 'shipped';
  if (list.group === 'main') return 'shipped';

  // Default: use order-based heuristic
  return 'queued';
}

// ─── Normalizer ─────────────────────────────────────────────

/** Phase column definition for the All Projects board. */
export interface PhaseColumn {
  phase: Phase;
  label: string;
  order: number;
}

/** The four normalized columns. */
export const PHASE_COLUMNS: readonly PhaseColumn[] = [
  { phase: 'queued', label: 'Queued', order: 0 },
  { phase: 'active', label: 'Active', order: 1 },
  { phase: 'review', label: 'Review', order: 2 },
  { phase: 'shipped', label: 'Shipped', order: 3 },
] as const;

/**
 * Maps workflow lists to semantic phases for the All Projects board.
 *
 * Each WorkflowEngine's lists get mapped to one of four phases.
 * When all projects share the same workflow, the board shows full columns.
 * When workflows differ, the board uses these normalized phases.
 */
export class WorkflowNormalizer {
  private phaseMap: Map<string, Phase>;

  constructor(private engine: WorkflowEngine) {
    this.phaseMap = new Map();
    const lists = engine.getLists();
    const terminalStatuses = engine.getConfig().terminalStatuses ?? [];

    for (const list of lists) {
      this.phaseMap.set(list.id, inferPhase(list, terminalStatuses));
    }
  }

  /** Get the phase for a list/status ID. */
  getPhase(listId: string): Phase {
    return this.phaseMap.get(listId) ?? 'queued';
  }

  /** Get all lists that map to a given phase. */
  getListsForPhase(phase: Phase): WorkflowList[] {
    return this.engine.getLists().filter(l => this.getPhase(l.id) === phase);
  }

  /** Get the full phase map. */
  getPhaseMap(): ReadonlyMap<string, Phase> {
    return this.phaseMap;
  }

  /**
   * Find valid workflow transitions from `currentListId` whose target
   * maps to `targetPhase`. Used for DnD in the All Projects phase view.
   */
  resolveNormalizedTransition(currentListId: string, targetPhase: Phase): WorkflowEdge[] {
    const config = this.engine.getConfig();
    return config.edges.filter(edge =>
      edge.from === currentListId && this.getPhase(edge.to) === targetPhase
    );
  }
}

/**
 * Check if all engines share the same workflow (same list IDs in same order).
 * When true, the All Projects board can show full columns instead of phases.
 */
export function allEnginesMatch(engines: WorkflowEngine[]): boolean {
  if (engines.length <= 1) return true;

  const firstLists = engines[0].getLists().map(l => l.id).join(',');
  return engines.every(e => e.getLists().map(l => l.id).join(',') === firstLists);
}
