import type { Scope, Sprint } from '@/types';
import type { WorkflowEdge } from '../../shared/workflow-config';
import type { WorkflowEngine } from '../../shared/workflow-engine';
import type { AddScopesResult } from '@/hooks/useSprints';

// ─── Types ──────────────────────────────────────────────────

export interface PendingDispatch {
  scope: Scope;
  transition: WorkflowEdge;
  hasActiveSession: boolean;
}

export interface KanbanDndState {
  activeScope: Scope | null;
  activeSprint: Sprint | null;
  overId: string | null;
  overIsValid: boolean;
  overSprintId: number | null;
  pending: PendingDispatch | null;
  showModal: boolean;
  showPopover: boolean;
  showIdeaForm: boolean;
  dispatching: boolean;
  error: string | null;
  // Sprint-specific UI state
  pendingSprintDispatch: Sprint | null;
  pendingUnmetDeps: AddScopesResult['unmet_dependencies'] | null;
  pendingDepSprintId: number | null;
  // Phase view disambiguation
  pendingDisambiguation: { scope: Scope; edges: WorkflowEdge[] } | null;
}

export interface UseKanbanDndOptions {
  scopes: Scope[];
  sprints: Sprint[];
  onAddToSprint: (sprintId: number, scopeIds: number[]) => Promise<AddScopesResult | null>;
  onRemoveFromSprint: (sprintId: number, scopeIds: number[]) => Promise<boolean>;
  /** True when All Projects non-unified phase view is active */
  isPhaseView?: boolean;
  /** Per-project engines for phase view resolution */
  projectEngines?: Map<string, WorkflowEngine>;
}

export type ParsedDragId =
  | { type: 'scope'; scopeId: number; projectId?: string }
  | { type: 'sprint'; sprintId: number }
  | { type: 'column'; status: string }
  | { type: 'sprint-drop'; sprintId: number }
  | null;

// ─── Pure Functions ─────────────────────────────────────────

/** Check if a scope has an active dispatch session on the server */
export async function checkActiveDispatch(buildUrl: (path: string) => string, scopeId: number): Promise<boolean> {
  try {
    const res = await fetch(buildUrl(`/dispatch/active?scope_id=${scopeId}`));
    if (!res.ok) return false;
    const { active } = await res.json();
    return active != null;
  } catch {
    return false;
  }
}

/** Parse a drag ID to determine its type */
export function parseDragId(id: string | number): ParsedDragId {
  const s = String(id);
  if (s.startsWith('sprint-drop-')) return { type: 'sprint-drop', sprintId: parseInt(s.slice(12)) };
  if (s.startsWith('sprint-')) return { type: 'sprint', sprintId: parseInt(s.slice(7)) };
  if (typeof id === 'number' || /^-?\d+$/.test(s)) return { type: 'scope', scopeId: Number(id) };
  // Swimlane cell: swim::{laneValue}::{status} → treat as column drop target
  if (s.startsWith('swim::')) {
    const lastSep = s.lastIndexOf('::');
    return { type: 'column', status: s.slice(lastSep + 2) };
  }
  // Project-scoped scope ID: {projectId}::{scopeId} (from scopeKey())
  const scopeMatch = s.match(/^(.+?)::(-?\d+)$/);
  if (scopeMatch) {
    return { type: 'scope', scopeId: Number(scopeMatch[2]), projectId: scopeMatch[1] };
  }
  // Assume column status ID
  return { type: 'column', status: s };
}

export const INITIAL_STATE: KanbanDndState = {
  activeScope: null,
  activeSprint: null,
  overId: null,
  overIsValid: false,
  overSprintId: null,
  pending: null,
  showModal: false,
  showPopover: false,
  showIdeaForm: false,
  dispatching: false,
  error: null,
  pendingSprintDispatch: null,
  pendingUnmetDeps: null,
  pendingDepSprintId: null,
  pendingDisambiguation: null,
};
