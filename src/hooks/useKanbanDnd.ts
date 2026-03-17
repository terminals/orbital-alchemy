import { useState, useCallback, useRef, useEffect } from 'react';
import type { DragStartEvent, DragOverEvent, DragEndEvent } from '@dnd-kit/core';
import type { Scope, Sprint } from '@/types';
import type { WorkflowEdge } from '../../shared/workflow-config';
import { useWorkflow } from './useWorkflow';
import type { AddScopesResult } from '@/hooks/useSprints';

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
}

interface UseKanbanDndOptions {
  scopes: Scope[];
  sprints: Sprint[];
  onAddToSprint: (sprintId: number, scopeIds: number[]) => Promise<AddScopesResult | null>;
  onRemoveFromSprint: (sprintId: number, scopeIds: number[]) => Promise<boolean>;
}

async function checkActiveDispatch(scopeId: number): Promise<boolean> {
  try {
    const res = await fetch(`/api/orbital/dispatch/active?scope_id=${scopeId}`);
    if (!res.ok) return false;
    const { active } = await res.json();
    return active != null;
  } catch {
    return false;
  }
}

/** Parse a drag ID to determine its type */
function parseDragId(id: string | number): { type: 'scope'; scopeId: number } | { type: 'sprint'; sprintId: number } | { type: 'column'; status: string } | { type: 'sprint-drop'; sprintId: number } | null {
  const s = String(id);
  if (s.startsWith('sprint-drop-')) return { type: 'sprint-drop', sprintId: parseInt(s.slice(12)) };
  if (s.startsWith('sprint-')) return { type: 'sprint', sprintId: parseInt(s.slice(7)) };
  if (typeof id === 'number' || /^\d+$/.test(s)) return { type: 'scope', scopeId: Number(id) };
  // Swimlane cell: swim::{laneValue}::{status} → treat as column drop target
  if (s.startsWith('swim::')) {
    const lastSep = s.lastIndexOf('::');
    return { type: 'column', status: s.slice(lastSep + 2) };
  }
  // Assume column status ID
  return { type: 'column', status: s };
}

export function useKanbanDnd({ scopes, sprints, onAddToSprint }: UseKanbanDndOptions) {
  const { engine } = useWorkflow();
  const [state, setState] = useState<KanbanDndState>({
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
  });

  // Refs to avoid stale closures in async DnD callbacks
  const activeScopeRef = useRef<Scope | null>(null);
  const activeSprintRef = useRef<Sprint | null>(null);

  useEffect(() => {
    activeScopeRef.current = state.activeScope;
    activeSprintRef.current = state.activeSprint;
  }, [state.activeScope, state.activeSprint]);

  const onDragStart = useCallback((event: DragStartEvent) => {
    const parsed = parseDragId(event.active.id);
    if (!parsed) return;

    if (parsed.type === 'scope') {
      const scope = scopes.find((s) => s.id === parsed.scopeId);
      if (scope) {
        setState((prev) => ({
          ...prev,
          activeScope: scope,
          activeSprint: null,
          overId: null,
          overIsValid: false,
          overSprintId: null,
          error: null,
        }));
      }
    } else if (parsed.type === 'sprint') {
      const sprint = sprints.find((s) => s.id === parsed.sprintId);
      if (sprint) {
        setState((prev) => ({
          ...prev,
          activeScope: null,
          activeSprint: sprint,
          overId: null,
          overIsValid: false,
          overSprintId: null,
          error: null,
        }));
      }
    }
  }, [scopes, sprints]);

  const onDragOver = useCallback((event: DragOverEvent) => {
    const over = event.over?.id;
    if (!over) {
      setState((prev) => ({ ...prev, overId: null, overIsValid: false, overSprintId: null }));
      return;
    }

    const parsed = parseDragId(over);
    if (!parsed) return;

    const currentSprint = activeSprintRef.current;
    const currentScope = activeScopeRef.current;

    // Sprint container hovering over a column
    if (currentSprint) {
      if (parsed.type === 'column' && parsed.status === 'implementing') {
        setState((prev) => ({ ...prev, overId: 'implementing', overIsValid: true, overSprintId: null }));
      } else {
        setState((prev) => ({ ...prev, overId: null, overIsValid: false, overSprintId: null }));
      }
      return;
    }

    // Scope card hovering
    if (currentScope) {
      if (parsed.type === 'sprint-drop') {
        // Scope over a sprint/batch container — valid if scope status matches target_column (B-4)
        const targetSprint = sprints.find((s) => s.id === parsed.sprintId);
        const valid = targetSprint?.status === 'assembling'
          && currentScope.status === targetSprint.target_column;
        setState((prev) => ({
          ...prev,
          overId: null,
          overIsValid: !!valid,
          overSprintId: parsed.sprintId,
        }));
      } else if (parsed.type === 'column') {
        const valid = engine.isValidTransition(currentScope.status, parsed.status);
        setState((prev) => ({ ...prev, overId: parsed.status, overIsValid: valid, overSprintId: null }));
      } else {
        setState((prev) => ({ ...prev, overId: null, overIsValid: false, overSprintId: null }));
      }
    }
  }, [sprints, engine]);

  const onDragEnd = useCallback(async (event: DragEndEvent) => {
    const over = event.over?.id;
    const scope = activeScopeRef.current;
    const sprint = activeSprintRef.current;

    // Reset drag state
    setState((prev) => ({
      ...prev,
      activeScope: null,
      activeSprint: null,
      overId: null,
      overIsValid: false,
      overSprintId: null,
    }));

    if (!over) return;
    const parsed = parseDragId(over);
    if (!parsed) return;

    // ── Sprint dropped on Implementing column → open preflight modal ──
    if (sprint && parsed.type === 'column' && parsed.status === 'implementing') {
      setState((prev) => ({
        ...prev,
        pendingSprintDispatch: sprint,
      }));
      return;
    }

    // ── Scope dropped on sprint/batch container → add to group ──
    if (scope && parsed.type === 'sprint-drop') {
      const targetGroup = sprints.find((s) => s.id === parsed.sprintId);
      // W-14: Reject drop with error toast if scope status doesn't match target_column
      if (targetGroup && scope.status !== targetGroup.target_column) {
        setState((prev) => ({
          ...prev,
          error: `Cannot add ${scope.status} scope to ${targetGroup.target_column} ${targetGroup.group_type} — scope status must match ${targetGroup.group_type} column`,
        }));
        return;
      }
      const result = await onAddToSprint(parsed.sprintId, [scope.id]);
      if (result && result.unmet_dependencies.length > 0) {
        setState((prev) => ({
          ...prev,
          pendingUnmetDeps: result.unmet_dependencies,
          pendingDepSprintId: parsed.sprintId,
        }));
      }
      return;
    }

    // ── Scope dropped on column → existing transition logic ──
    if (scope && parsed.type === 'column') {
      if (scope.status === parsed.status) return;

      const edge = engine.findEdge(scope.status, parsed.status);
      if (!edge) return;

      const hasActiveSession = edge.command != null
        ? await checkActiveDispatch(scope.id)
        : false;

      if (edge.confirmLevel === 'full') {
        setState((prev) => ({
          ...prev,
          pending: { scope, transition: edge, hasActiveSession },
          showModal: true,
          showPopover: false,
        }));
      } else {
        setState((prev) => ({
          ...prev,
          pending: { scope, transition: edge, hasActiveSession },
          showPopover: true,
          showModal: false,
        }));
      }
    }
  }, [onAddToSprint, engine, sprints]);

  const confirmTransition = useCallback(async () => {
    const { pending } = state;
    if (!pending) return;

    setState((prev) => ({ ...prev, dispatching: true, error: null }));

    const { scope, transition } = pending;
    const command = engine.buildCommand(transition, scope.id);

    try {
      if (command) {
        const res = await fetch('/api/orbital/dispatch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            scope_id: scope.id,
            command,
            // skipServerTransition: let the launched command handle status changes
            transition: transition.skipServerTransition
              ? undefined
              : { from: transition.from, to: transition.to },

          }),
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({ error: 'Request failed' }));
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }
      } else {
        // Idea promotion: entry point → next status — server moves file + launches terminal
        const entryPointId = engine.getEntryPoint().id;
        const isIdeaPromotion = scope.status === entryPointId && transition.direction === 'forward';

        if (isIdeaPromotion && !transition.command) {
          const res = await fetch(`/api/orbital/ideas/${scope.id}/promote`, { method: 'POST' });
          if (!res.ok) {
            const body = await res.json().catch(() => ({ error: 'Request failed' }));
            throw new Error(body.error ?? `HTTP ${res.status}`);
          }
        } else {
          const res = await fetch(`/api/orbital/scopes/${scope.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: transition.to }),
          });

          if (!res.ok) {
            const body = await res.json().catch(() => ({ error: 'Request failed' }));
            throw new Error(body.error ?? `Failed to update scope status: HTTP ${res.status}`);
          }
        }
      }

      setState((prev) => ({
        ...prev,
        pending: null,
        showModal: false,
        showPopover: false,
        dispatching: false,
      }));
    } catch (err) {
      setState((prev) => ({
        ...prev,
        dispatching: false,
        error: err instanceof Error ? err.message : 'Dispatch failed',
      }));
    }
  }, [state, engine]);

  const cancelTransition = useCallback(() => {
    setState((prev) => ({
      ...prev,
      pending: null,
      showModal: false,
      showPopover: false,
      dispatching: false,
      error: null,
    }));
  }, []);

  const dismissError = useCallback(() => {
    setState((prev) => ({ ...prev, error: null }));
  }, []);

  const openModalFromPopover = useCallback(() => {
    setState((prev) => ({
      ...prev,
      showPopover: false,
      showModal: true,
    }));
  }, []);

  const openIdeaForm = useCallback(() => {
    setState((prev) => ({ ...prev, showIdeaForm: true }));
  }, []);

  const closeIdeaForm = useCallback(() => {
    setState((prev) => ({ ...prev, showIdeaForm: false }));
  }, []);

  const submitIdea = useCallback(async (title: string, description: string) => {
    setState((prev) => ({ ...prev, dispatching: true, error: null }));
    try {
      const res = await fetch('/api/orbital/ideas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      setState((prev) => ({ ...prev, dispatching: false, showIdeaForm: false }));
    } catch (err) {
      setState((prev) => ({
        ...prev,
        dispatching: false,
        error: err instanceof Error ? err.message : 'Failed to create idea',
      }));
    }
  }, []);

  const dismissSprintDispatch = useCallback(() => {
    setState((prev) => ({ ...prev, pendingSprintDispatch: null }));
  }, []);

  const dismissUnmetDeps = useCallback(() => {
    setState((prev) => ({ ...prev, pendingUnmetDeps: null, pendingDepSprintId: null }));
  }, []);

  const resolveUnmetDeps = useCallback(async (scopeIds: number[]) => {
    if (state.pendingDepSprintId != null) {
      await onAddToSprint(state.pendingDepSprintId, scopeIds);
    }
    setState((prev) => ({ ...prev, pendingUnmetDeps: null, pendingDepSprintId: null }));
  }, [state.pendingDepSprintId, onAddToSprint]);

  /** Allow external callers (e.g. bulk add) to surface unmet deps in the shared dialog */
  const showUnmetDeps = useCallback((sprintId: number, deps: AddScopesResult['unmet_dependencies']) => {
    setState((prev) => ({ ...prev, pendingUnmetDeps: deps, pendingDepSprintId: sprintId }));
  }, []);

  return {
    state,
    onDragStart,
    onDragOver,
    onDragEnd,
    confirmTransition,
    cancelTransition,
    dismissError,
    openModalFromPopover,
    openIdeaForm,
    closeIdeaForm,
    submitIdea,
    dismissSprintDispatch,
    dismissUnmetDeps,
    resolveUnmetDeps,
    showUnmetDeps,
  };
}
