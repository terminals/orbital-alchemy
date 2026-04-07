import type { Scope } from '@/types';
import type { WorkflowEngine } from '../../shared/workflow-engine';
import { WorkflowNormalizer, PHASE_COLUMNS, allEnginesMatch } from '../../shared/workflow-normalizer';
import type { Phase } from '../../shared/workflow-normalizer';

// ─── Types ──────────────────────────────────────────────────

export interface MetaColumn {
  /** Phase ID or list ID (when all workflows match) */
  id: string;
  label: string;
  color: string;
  /** The phase this column represents */
  phase: Phase;
}

export interface AllProjectsBoardState {
  /** Whether all projects share the same workflow */
  isUnified: boolean;
  /** Columns to render */
  columns: MetaColumn[];
  /** Scopes grouped by column ID */
  scopesByColumn: Record<string, Scope[]>;
}

// ─── Board Computation ──────────────────────────────────────

/** Phase colors (muted, used when showing normalized columns) */
const PHASE_COLOR: Record<Phase, string> = {
  queued: '210 50% 50%',
  active: '0 70% 55%',
  review: '45 80% 50%',
  shipped: '153 70% 45%',
};

/**
 * Compute the All Projects board state.
 *
 * Smart fallback:
 * - If all projects share the same workflow → show full columns (isUnified=true)
 * - If workflows differ → show 4 phase columns (isUnified=false)
 */
export function computeAllProjectsBoard(
  scopes: Scope[],
  projectEngines: Map<string, WorkflowEngine>,
): AllProjectsBoardState {
  const engines = [...projectEngines.values()];

  if (engines.length === 0) {
    return {
      isUnified: true,
      columns: [],
      scopesByColumn: {},
    };
  }

  // Check if all engines match
  const unified = allEnginesMatch(engines);

  if (unified) {
    // All same workflow — show full columns from the first engine
    const engine = engines[0];
    const boardColumns = engine.getBoardColumns();
    const columns: MetaColumn[] = boardColumns.map(col => ({
      id: col.id,
      label: col.label,
      color: col.color,
      phase: new WorkflowNormalizer(engine).getPhase(col.id),
    }));

    const scopesByColumn: Record<string, Scope[]> = {};
    for (const col of columns) scopesByColumn[col.id] = [];
    const entryPointId = engine.getEntryPoint().id;

    for (const scope of scopes) {
      const colId = scopesByColumn[scope.status] ? scope.status : entryPointId;
      scopesByColumn[colId]?.push(scope);
    }

    return { isUnified: true, columns, scopesByColumn };
  }

  // Different workflows — use phase normalization
  const normalizers = new Map<string, WorkflowNormalizer>();
  for (const [projectId, engine] of projectEngines) {
    normalizers.set(projectId, new WorkflowNormalizer(engine));
  }

  const columns: MetaColumn[] = PHASE_COLUMNS.map(pc => ({
    id: pc.phase,
    label: pc.label,
    color: PHASE_COLOR[pc.phase],
    phase: pc.phase,
  }));

  const scopesByColumn: Record<string, Scope[]> = {};
  for (const col of columns) scopesByColumn[col.id] = [];

  for (const scope of scopes) {
    const projectId = scope.project_id;
    if (!projectId) {
      scopesByColumn['queued']?.push(scope);
      continue;
    }

    const normalizer = normalizers.get(projectId);
    if (normalizer) {
      const phase = normalizer.getPhase(scope.status);
      scopesByColumn[phase]?.push(scope);
    } else {
      scopesByColumn['queued']?.push(scope);
    }
  }

  return { isUnified: false, columns, scopesByColumn };
}
