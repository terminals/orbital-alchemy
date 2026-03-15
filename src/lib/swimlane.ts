import type { Scope, ScopeStatus } from '@/types';
import type { SwimGroupField } from '@/types';
import {
  PRIORITY_OPTIONS,
  CATEGORY_OPTIONS,
  EFFORT_BUCKETS,
  DEPENDENCY_OPTIONS,
} from '@/types';
import { getScopeFieldValues } from '@/lib/scope-fields';
import { sortScopes } from '@/hooks/useBoardSettings';
import type { SortField, SortDirection } from '@/hooks/useBoardSettings';

// ─── Types ──────────────────────────────────────────────────

export interface SwimLane {
  value: string;
  label: string;
  color: string;
  count: number;
  cells: Record<ScopeStatus, Scope[]>;
}

// ─── Lane accent colors ─────────────────────────────────────

const PRIORITY_LANE_COLOR: Record<string, string> = {
  critical: 'bg-ask-red',
  high: 'bg-warning-amber',
  medium: 'bg-accent-blue',
  low: 'bg-muted-foreground/30',
};

const CATEGORY_LANE_COLOR: Record<string, string> = {
  trading: 'bg-category-trading',
  funding: 'bg-category-funding',
  blockchain: 'bg-category-blockchain',
  security: 'bg-category-security',
  frontend: 'bg-category-frontend',
  platform: 'bg-category-platform',
  devex: 'bg-category-devex',
};

const DEP_LANE_LABEL: Record<string, string> = {
  'has-blockers': 'Has blockers',
  'blocks-others': 'Blocks others',
  'no-deps': 'No dependencies',
};

// ─── Known ordering per field ───────────────────────────────

const KNOWN_ORDER: Record<SwimGroupField, readonly string[]> = {
  priority: PRIORITY_OPTIONS,
  category: CATEGORY_OPTIONS,
  effort: EFFORT_BUCKETS,
  dependencies: DEPENDENCY_OPTIONS,
  tags: [], // tags are fully dynamic
};

function laneColor(field: SwimGroupField, value: string): string {
  if (field === 'priority') return PRIORITY_LANE_COLOR[value] ?? 'bg-muted-foreground/30';
  if (field === 'category') return CATEGORY_LANE_COLOR[value] ?? 'bg-primary/40';
  return 'bg-primary/40';
}

function laneLabel(field: SwimGroupField, value: string): string {
  if (field === 'dependencies') return DEP_LANE_LABEL[value] ?? value;
  return value;
}

// ─── Empty cells factory ────────────────────────────────────

function emptyCells(): Record<ScopeStatus, Scope[]> {
  return {
    icebox: [],
    planning: [],
    backlog: [],
    implementing: [],
    review: [],
    completed: [],
    dev: [],
    staging: [],
    production: [],
  };
}

// ─── Main computation ───────────────────────────────────────

export function computeSwimLanes(
  scopes: Scope[],
  groupField: SwimGroupField,
  sortField: SortField,
  sortDirection: SortDirection,
): SwimLane[] {
  // Collect all values and map scopes to lanes
  const laneMap = new Map<string, Record<ScopeStatus, Scope[]>>();
  const laneScopeCounts = new Map<string, number>();

  for (const scope of scopes) {
    const values = getScopeFieldValues(scope, groupField);
    const targets = values.length > 0 ? values : ['Unset'];

    for (const val of targets) {
      if (!laneMap.has(val)) {
        laneMap.set(val, emptyCells());
        laneScopeCounts.set(val, 0);
      }
      const cells = laneMap.get(val)!;
      const status = scope.status as ScopeStatus;
      if (cells[status]) {
        cells[status].push(scope);
      } else {
        cells.planning.push(scope);
      }
      laneScopeCounts.set(val, (laneScopeCounts.get(val) ?? 0) + 1);
    }
  }

  // Sort scopes within each cell
  for (const cells of laneMap.values()) {
    for (const status of Object.keys(cells) as ScopeStatus[]) {
      cells[status] = sortScopes(cells[status], sortField, sortDirection);
    }
  }

  // Build ordered lane list: known values first, then dynamic alphabetically, "Unset" last
  const known = KNOWN_ORDER[groupField];
  const allValues = [...laneMap.keys()];

  const orderedValues: string[] = [];

  // Known values in their defined order
  for (const v of known) {
    if (laneMap.has(v)) orderedValues.push(v);
  }

  // Dynamic values (not in known list, not "Unset") sorted alphabetically
  const dynamic = allValues
    .filter((v) => v !== 'Unset' && !known.includes(v))
    .sort();
  orderedValues.push(...dynamic);

  // "Unset" always last
  if (laneMap.has('Unset')) orderedValues.push('Unset');

  return orderedValues.map((value) => ({
    value,
    label: value === 'Unset' ? 'Unset' : laneLabel(groupField, value),
    color: value === 'Unset' ? 'bg-muted-foreground/20' : laneColor(groupField, value),
    count: laneScopeCounts.get(value) ?? 0,
    cells: laneMap.get(value)!,
  }));
}
