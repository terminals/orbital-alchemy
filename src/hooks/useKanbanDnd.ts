import { useState, useCallback, useRef, useEffect } from 'react';
import type { DragStartEvent, DragOverEvent, DragEndEvent } from '@dnd-kit/core';
import type { Scope, Sprint } from '@/types';
import type { WorkflowEdge, Phase } from '../../shared/workflow-config';
import { WorkflowNormalizer } from '../../shared/workflow-normalizer';
import { useWorkflow } from './useWorkflow';
import { useProjectUrl } from './useProjectUrl';
import { useProjects } from './useProjectContext';
import { useDispatchGuard } from './useDispatchGuard';
import { isITermError } from '@/lib/iterm-errors';
import {
  checkActiveDispatch,
  parseDragId,
  INITIAL_STATE,
} from './kanban-dnd-utils';
import type { UseKanbanDndOptions, KanbanDndState } from './kanban-dnd-utils';
import type { AddScopesResult } from '@/hooks/useSprints';

export type { PendingDispatch, KanbanDndState } from './kanban-dnd-utils';

export function useKanbanDnd({ scopes, sprints, onAddToSprint, onRemoveFromSprint, isPhaseView, projectEngines, defaultProjectId }: UseKanbanDndOptions & { defaultProjectId?: string }) {
  const { engine } = useWorkflow();
  const buildUrl = useProjectUrl();
  const { showITermModal } = useDispatchGuard();
  const { getApiBase, hasMultipleProjects } = useProjects();

  // Build URL routed to a specific scope's project (for mutations in All Projects view)
  const buildScopeUrl = useCallback((scope: Scope, path: string): string => {
    if (hasMultipleProjects && scope.project_id) {
      return `${getApiBase(scope.project_id)}${path}`;
    }
    return buildUrl(path);
  }, [buildUrl, getApiBase, hasMultipleProjects]);

  // Present a resolved edge to the user via modal or popover
  const presentEdge = useCallback(async (scope: Scope, edge: WorkflowEdge) => {
    const scopeUrl = (p: string) => buildScopeUrl(scope, p);
    // Slug-only icebox items have synthetic negative IDs and can't have
    // active dispatches — promotion goes through /ideas/{slug}/promote.
    const hasActiveSession = edge.command != null && scope.id > 0
      ? await checkActiveDispatch(scopeUrl, scope.id)
      : false;

    const isFullConfirm = edge.confirmLevel === 'full';
    setState((prev) => ({
      ...prev,
      pending: { scope, transition: edge, hasActiveSession },
      showModal: isFullConfirm,
      showPopover: !isFullConfirm,
      error: null,
    }));
  }, [buildScopeUrl]);

  const [state, setState] = useState<KanbanDndState>(INITIAL_STATE);

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
      const scope = scopes.find((s) => s.id === parsed.scopeId
        && (!parsed.projectId || s.project_id === parsed.projectId));
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

    // Sprint/batch container hovering over a column
    if (currentSprint) {
      if (parsed.type === 'column') {
        const effectiveCol = currentSprint.status !== 'assembling'
          ? engine.getBatchTargetStatus(currentSprint.target_column) ?? currentSprint.target_column
          : currentSprint.target_column;
        const valid = engine.isValidTransition(effectiveCol, parsed.status);
        setState((prev) => ({ ...prev, overId: valid ? parsed.status : null, overIsValid: valid, overSprintId: null }));
      } else {
        setState((prev) => ({ ...prev, overId: null, overIsValid: false, overSprintId: null }));
      }
      return;
    }

    // Scope card hovering
    if (currentScope) {
      // Check if this scope is inside an assembling group — if so, only allow same-column drop (remove)
      const inGroup = sprints.some((s) =>
        s.status === 'assembling' && s.scope_ids.includes(currentScope.id),
      );

      if (inGroup) {
        // Scopes in groups can only be dropped on their own column to remove them
        const valid = parsed.type === 'column' && parsed.status === currentScope.status;
        setState((prev) => ({ ...prev, overId: valid ? parsed.status : null, overIsValid: valid, overSprintId: null }));
      } else if (parsed.type === 'sprint-drop') {
        // Scope over a sprint/batch container — valid if scope status matches target_column
        // and scope belongs to the same project as the sprint (B-4)
        const targetSprint = sprints.find((s) => s.id === parsed.sprintId);
        const valid = targetSprint?.status === 'assembling'
          && currentScope.status === targetSprint.target_column
          && (!currentScope.project_id || !targetSprint.project_id || currentScope.project_id === targetSprint.project_id);
        setState((prev) => ({
          ...prev,
          overId: null,
          overIsValid: !!valid,
          overSprintId: parsed.sprintId,
        }));
      } else if (parsed.type === 'column') {
        let valid: boolean;
        if (isPhaseView && currentScope.project_id && projectEngines) {
          const scopeEngine = projectEngines.get(currentScope.project_id);
          if (scopeEngine) {
            const normalizer = new WorkflowNormalizer(scopeEngine);
            const edges = normalizer.resolveNormalizedTransition(currentScope.status, parsed.status as Phase);
            valid = edges.length > 0;
          } else {
            valid = false;
          }
        } else {
          valid = engine.isValidTransition(currentScope.status, parsed.status);
        }
        setState((prev) => ({ ...prev, overId: parsed.status, overIsValid: valid, overSprintId: null }));
      } else {
        setState((prev) => ({ ...prev, overId: null, overIsValid: false, overSprintId: null }));
      }
    }
  }, [sprints, engine, isPhaseView, projectEngines]);

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

    // ── Sprint/batch dropped on valid target column → open preflight modal ──
    if (sprint && parsed.type === 'column') {
      const effectiveCol = sprint.status !== 'assembling'
        ? engine.getBatchTargetStatus(sprint.target_column) ?? sprint.target_column
        : sprint.target_column;
      if (engine.isValidTransition(effectiveCol, parsed.status)) {
        setState((prev) => ({ ...prev, pendingSprintDispatch: sprint }));
        return;
      }
    }

    // ── Scope dropped on sprint/batch container → add to group ──
    if (scope && parsed.type === 'sprint-drop') {
      const targetGroup = sprints.find((s) => s.id === parsed.sprintId);
      // Reject drop if scope status doesn't match target_column or project doesn't match
      if (targetGroup && (scope.status !== targetGroup.target_column
        || (scope.project_id && targetGroup.project_id && scope.project_id !== targetGroup.project_id))) {
        setState((prev) => ({
          ...prev,
          error: scope.project_id !== targetGroup?.project_id
            ? `Cannot add scope from a different project to this ${targetGroup.group_type}`
            : `Cannot add ${scope.status} scope to ${targetGroup.target_column} ${targetGroup.group_type} — scope status must match ${targetGroup.group_type} column`,
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
      // Same column: if scope is in an assembling sprint/batch, remove it
      if (scope.status === parsed.status) {
        const group = sprints.find((s) =>
          s.status === 'assembling' && s.scope_ids.includes(scope.id),
        );
        if (group) {
          await onRemoveFromSprint(group.id, [scope.id]);
        }
        return;
      }

      let edge: WorkflowEdge | undefined;

      if (isPhaseView && scope.project_id && projectEngines) {
        const scopeEngine = projectEngines.get(scope.project_id);
        if (scopeEngine) {
          const normalizer = new WorkflowNormalizer(scopeEngine);
          const candidates = normalizer.resolveNormalizedTransition(scope.status, parsed.status as Phase);
          if (candidates.length > 1) {
            // Multiple edges map to this phase — let the user choose
            setState((prev) => ({
              ...prev,
              pendingDisambiguation: { scope, edges: candidates },
            }));
            return;
          }
          edge = candidates[0];
        }
      } else {
        edge = engine.findEdge(scope.status, parsed.status);
      }

      if (!edge) return;

      await presentEdge(scope, edge);
    }
  }, [onAddToSprint, onRemoveFromSprint, engine, sprints, presentEdge, isPhaseView, projectEngines]);

  const confirmTransition = useCallback(async () => {
    const { pending } = state;
    if (!pending) return;

    setState((prev) => ({ ...prev, dispatching: true, error: null }));

    const { scope, transition } = pending;

    // Use scope's project engine in phase view, else context engine
    const activeEngine = (isPhaseView && scope.project_id && projectEngines?.get(scope.project_id))
      || engine;
    const command = activeEngine.buildCommand(transition, scope.id);

    // Route mutations to the scope's project endpoint (critical for All Projects view)
    const url = (path: string) => buildScopeUrl(scope, path);

    try {
      // Idea promotion must be checked first: slug-only icebox files can't go through
      // the normal dispatch/patch paths (they lack numeric ID prefixes). The promote
      // endpoint handles ID assignment, file rename, and terminal launch in one step.
      const entryPointId = activeEngine.getEntryPoint().id;
      const isIdeaPromotion = scope.status === entryPointId && transition.direction === 'forward' && scope.slug;

      if (isIdeaPromotion) {
        const res = await fetch(url(`/ideas/${scope.slug}/promote`), { method: 'POST' });
        if (!res.ok) {
          const body = await res.json().catch(() => ({ error: 'Request failed' }));
          throw new Error(body.details ?? body.error ?? `HTTP ${res.status}`);
        }
      } else if (command) {
        const res = await fetch(url('/dispatch'), {
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
          throw new Error(body.details ?? body.error ?? `HTTP ${res.status}`);
        }
      } else {
        const res = await fetch(url(`/scopes/${scope.id}`), {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: transition.to }),
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({ error: 'Request failed' }));
          throw new Error(body.error ?? `Failed to update scope status: HTTP ${res.status}`);
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
      const msg = err instanceof Error ? err.message : 'Dispatch failed';
      const itermStatus = isITermError(msg);
      if (itermStatus) showITermModal(itermStatus);
      setState((prev) => ({
        ...prev,
        dispatching: false,
        showModal: itermStatus ? false : prev.showModal,
        showPopover: itermStatus ? false : prev.showPopover,
        error: itermStatus ? null : msg,
      }));
    }
  }, [state, engine, buildScopeUrl, isPhaseView, projectEngines, showITermModal]);

  const selectDisambiguation = useCallback(async (edge: WorkflowEdge) => {
    const disambiguation = state.pendingDisambiguation;
    if (!disambiguation) return;

    setState((prev) => ({ ...prev, pendingDisambiguation: null }));
    await presentEdge(disambiguation.scope, edge);
  }, [state.pendingDisambiguation, presentEdge]);

  const dismissDisambiguation = useCallback(() => {
    setState((prev) => ({ ...prev, pendingDisambiguation: null }));
  }, []);

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
      // In All Projects mode, route idea creation to the default project
      const url = defaultProjectId
        ? `${getApiBase(defaultProjectId)}/ideas`
        : buildUrl('/ideas');
      const res = await fetch(url, {
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
  }, [buildUrl, defaultProjectId, getApiBase]);

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
    selectDisambiguation,
    dismissDisambiguation,
  };
}
