import { useState, useMemo, useEffect, useCallback } from 'react';
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { LayoutDashboard, X } from 'lucide-react';
import { useScopes } from '@/hooks/useScopes';
import { useCardDisplay } from '@/hooks/useCardDisplay';
import { useScopeFilters } from '@/hooks/useScopeFilters';
import { useBoardSettings, sortScopes } from '@/hooks/useBoardSettings';
import { useSwimlaneBoardSettings } from '@/hooks/useSwimlaneBoardSettings';
import { useZoomModifier } from '@/hooks/useZoomModifier';
import { useKanbanDnd } from '@/hooks/useKanbanDnd';
import { useSprints } from '@/hooks/useSprints';
import { useSprintPreflight } from '@/hooks/useSprintPreflight';
import { useIdeaActions } from '@/hooks/useIdeaActions';
import { useSearch } from '@/hooks/useSearch';
import { useStatusBarHighlight } from '@/hooks/useStatusBarHighlight';
import { useWorkflow } from '@/hooks/useWorkflow';
import { KanbanColumn } from '@/components/KanbanColumn';
import { CardDisplayToggle } from '@/components/CardDisplayToggle';
import { ViewModeSelector } from '@/components/ViewModeSelector';
import { SwimlaneBoardView } from '@/components/SwimlaneBoardView';
import { DragOverlay } from '@/components/DragOverlay';
import { DispatchPopover } from '@/components/DispatchPopover';
import { DispatchModal } from '@/components/DispatchModal';
import { ScopeDetailModal } from '@/components/ScopeDetailModal';
import { IdeaFormDialog } from '@/components/IdeaFormDialog';
import { IdeaDetailModal } from '@/components/IdeaDetailModal';
import { ScopeFilterBar } from '@/components/ScopeFilterBar';
import { SearchInput } from '@/components/SearchInput';
import { SprintPreflightModal } from '@/components/SprintPreflightModal';

import { SprintDependencyDialog } from '@/components/SprintDependencyDialog';
import { ColumnHeaderActions } from '@/components/ColumnHeaderActions';
import { sprintAwareCollision } from '@/lib/collisionDetection';
import { computeSwimLanes } from '@/lib/swimlane';
import { computeAllProjectsBoard } from '@/lib/all-projects-board';
import { partitionByFavourites } from '@/lib/favourite-sort';
import { scopeKey } from '@/lib/scope-key';
import { sprintKey } from '@/lib/sprint-key';
import { WorkflowNormalizer } from '../../shared/workflow-normalizer';
import { ProjectTabBar } from '@/components/ProjectTabBar';
import { TransitionDisambiguationDialog } from '@/components/TransitionDisambiguationDialog';
import { useProjectUrl } from '@/hooks/useProjectUrl';
import { useProjects } from '@/hooks/useProjectContext';
import type { Scope, Project } from '@/types';

export function ScopeBoard() {
  const buildUrl = useProjectUrl();
  const { scopes, loading } = useScopes();
  const { engine } = useWorkflow();
  const { activeProjectId, projects, projectEngines, hasMultipleProjects } = useProjects();
  const { sortField, sortDirection, setSort, collapsed, toggleCollapse } = useBoardSettings();
  const { viewMode, setViewMode, groupField, setGroupField, collapsedLanes, toggleLaneCollapse } = useSwimlaneBoardSettings();
  const { display: cardDisplay, toggle: toggleCardDisplay, hiddenCount } = useCardDisplay();
  const [selectedScopeKey, setSelectedScopeKey] = useState<string | null>(null);
  const selectedScope = useMemo(() => scopes.find((s) => scopeKey(s) === selectedScopeKey) ?? null, [scopes, selectedScopeKey]);
  const [selectedIdea, setSelectedIdea] = useState<Scope | null>(null);

  // Dynamic board columns from engine
  const boardColumns = useMemo(() => engine.getBoardColumns(), [engine]);

  // All Projects: compute phase-normalized or unified board
  const isAllProjects = hasMultipleProjects && activeProjectId === null;
  const allProjectsBoard = useMemo(() => {
    if (!isAllProjects || projectEngines.size === 0) return null;
    return computeAllProjectsBoard(scopes, projectEngines);
  }, [isAllProjects, scopes, projectEngines]);

  // Effective columns: All Projects board columns or single-project columns
  const effectiveColumns = allProjectsBoard?.columns ?? boardColumns;

  // Project lookup for card/sprint project colors
  const projectLookup = useMemo(() => {
    const map = new Map<string, Project>();
    for (const p of projects) map.set(p.id, p);
    return map.size > 0 ? map : undefined;
  }, [projects]);

  const {
    sprints,
    createSprint,
    renameSprint,
    deleteSprint,
    addScopes: addScopesToSprint,
    removeScopes: removeScopesFromSprint,
    dispatchSprint,
    getGraph,
    moveSprintToProject,
  } = useSprints();

  const [editingSprintId, setEditingSprintId] = useState<string | null>(null);

  // Default project for creation in All Projects mode (first enabled project)
  const defaultProjectId = isAllProjects ? projects.find(p => p.enabled)?.id : undefined;

  const {
    filters,
    toggleFilter,
    clearField,
    clearAll,
    hasActiveFilters,
    filteredScopes,
    optionsWithCounts,
  } = useScopeFilters(scopes);

  const search = useSearch(filteredScopes);
  const { highlightedScopeKey, clearHighlight } = useStatusBarHighlight();

  // Merge search dimming with statusbar highlight dimming
  const mergedDimmedIds = useMemo(() => {
    if (highlightedScopeKey == null) return search.dimmedIds;
    const dimmed = new Set<string>();
    for (const scope of search.displayScopes) {
      if (scopeKey(scope) !== highlightedScopeKey) dimmed.add(scopeKey(scope));
    }
    return dimmed;
  }, [highlightedScopeKey, search.dimmedIds, search.displayScopes]);

  // Click anywhere to clear highlight
  useEffect(() => {
    if (highlightedScopeKey == null) return;
    const timer = setTimeout(() => {
      document.addEventListener('click', clearHighlight, { once: true });
    }, 100);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('click', clearHighlight);
    };
  }, [highlightedScopeKey, clearHighlight]);

  const {
    state: dndState,
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
  } = useKanbanDnd({
    scopes: search.displayScopes,
    sprints,
    onAddToSprint: addScopesToSprint,
    onRemoveFromSprint: removeScopesFromSprint,
    isPhaseView: isAllProjects && allProjectsBoard != null && !allProjectsBoard.isUnified,
    projectEngines: isAllProjects ? projectEngines : undefined,
    defaultProjectId,
  });

  // 8px activation constraint so clicks pass through to detail modal
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor),
  );
  const modifiers = useZoomModifier();

  // Build scope lookup keyed by composite scopeKey (project_id::id) so sprints
  // from different projects resolve to the correct scope in All Projects mode.
  const scopeLookup = useMemo(() => {
    const map = new Map<string, Scope>();
    for (const scope of scopes) map.set(scopeKey(scope), scope);
    return map;
  }, [scopes]);

  const scopesByStatus = useMemo(() => {
    // All Projects board has its own grouping logic
    if (allProjectsBoard) {
      const groups: Record<string, Scope[]> = {};
      for (const col of allProjectsBoard.columns) groups[col.id] = [];
      for (const [colId, colScopes] of Object.entries(allProjectsBoard.scopesByColumn)) {
        // Filter to display scopes (respects search/filters)
        const displayKeys = new Set(search.displayScopes.map(s => scopeKey(s)));
        groups[colId] = partitionByFavourites(sortScopes(
          colScopes.filter(s => displayKeys.has(scopeKey(s))),
          sortField,
          sortDirection,
        ));
      }
      return groups;
    }

    const groups: Record<string, Scope[]> = {};
    for (const col of boardColumns) groups[col.id] = [];

    const entryPointId = engine.getEntryPoint().id;
    for (const scope of search.displayScopes) {
      if (groups[scope.status]) {
        groups[scope.status].push(scope);
      } else {
        groups[entryPointId]?.push(scope);
      }
    }

    // Apply sort within each column
    for (const key of Object.keys(groups)) {
      groups[key] = partitionByFavourites(sortScopes(groups[key], sortField, sortDirection));
    }

    return groups;
  }, [search.displayScopes, sortField, sortDirection, boardColumns, engine, allProjectsBoard]);

  // Sprints/batches by column using target_column (W-6)
  const sprintsByColumn = useMemo(() => {
    const map: Record<string, typeof sprints> = {};
    for (const group of sprints) {
      // Assembling groups stay in their source column; dispatched/active/completed/failed
      // groups render in the destination column (same visual model as single-card moves)
      const col = group.status !== 'assembling'
        ? engine.getBatchTargetStatus(group.target_column) ?? group.target_column
        : group.target_column;
      (map[col] ??= []).push(group);
    }
    return map;
  }, [sprints, engine]);

  // Global set of scope composite keys in sprint/batch groups across ALL columns.
  // Uses scopeKey format (project_id::id) so scopes from different projects with
  // the same numeric ID don't collide in All Projects mode.
  const globalSprintScopeIds = useMemo(() => {
    const keys = new Set<string>();
    for (const group of sprints) {
      const pid = group.project_id ?? '';
      for (const id of group.scope_ids) {
        keys.add(pid ? `${pid}::${id}` : String(id));
      }
    }
    return keys;
  }, [sprints]);

  // Swimlane computation (only when in swimlane mode)
  const swimLanes = useMemo(() => {
    if (viewMode !== 'swimlane') return [];

    // Build phase resolver for All Projects non-unified mode
    let resolveColumnId: ((scope: Scope) => string) | undefined;
    if (isAllProjects && allProjectsBoard && !allProjectsBoard.isUnified) {
      const normalizers = new Map<string, WorkflowNormalizer>();
      for (const [pid, eng] of projectEngines) {
        normalizers.set(pid, new WorkflowNormalizer(eng));
      }
      resolveColumnId = (scope: Scope) => {
        const n = normalizers.get(scope.project_id ?? '');
        return n ? n.getPhase(scope.status) : 'queued';
      };
    }

    return computeSwimLanes(search.displayScopes, groupField, sortField, sortDirection, resolveColumnId, projectLookup);
  }, [viewMode, search.displayScopes, groupField, sortField, sortDirection, isAllProjects, allProjectsBoard, projectEngines, projectLookup]);

  // Compute valid drop targets for the currently dragged item
  const validTargets = useMemo(() => {
    if (dndState.activeScope) {
      // If scope is inside an assembling group, only its own column is valid (to remove it)
      const inGroup = sprints.some((s) =>
        s.status === 'assembling' && s.scope_ids.includes(dndState.activeScope!.id),
      );
      if (inGroup) {
        return new Set<string>([dndState.activeScope.status]);
      }
      // In All Projects phase view, resolve targets through the scope's project engine
      if (isAllProjects && allProjectsBoard && !allProjectsBoard.isUnified && dndState.activeScope.project_id) {
        const scopeEngine = projectEngines.get(dndState.activeScope.project_id);
        if (scopeEngine) {
          const directTargets = scopeEngine.getValidTargets(dndState.activeScope.status);
          // Map workflow targets to phase columns
          const normalizer = new WorkflowNormalizer(scopeEngine);
          const phases = new Set(directTargets.map(t => normalizer.getPhase(t)));
          return phases;
        }
      }
      return new Set(engine.getValidTargets(dndState.activeScope.status));
    }
    if (dndState.activeSprint) {
      const group = dndState.activeSprint;
      const effectiveCol = group.status !== 'assembling'
        ? engine.getBatchTargetStatus(group.target_column) ?? group.target_column
        : group.target_column;
      return new Set(engine.getValidTargets(effectiveCol));
    }
    return new Set<string>();
  }, [dndState.activeScope, dndState.activeSprint, engine, sprints, isAllProjects, allProjectsBoard, projectEngines]);

  // ─── Sprint Preflight ───────────────────────────────────
  const preflight = useSprintPreflight(
    dndState.pendingSprintDispatch,
    getGraph,
    dispatchSprint,
    dismissSprintDispatch,
  );

  // ─── Idea Actions ─────────────────────────────────────────
  const { surpriseLoading, handleSurprise, handleApproveGhost, handleRejectGhost } =
    useIdeaActions(closeIdeaForm, setSelectedIdea);

  const handleScopeClick = useCallback((scope: Scope) => {
    if (scope.status === engine.getEntryPoint().id) {
      setSelectedIdea(scope);
    } else {
      setSelectedScopeKey(scopeKey(scope));
    }
  }, [engine]);

  const handleAddAllToSprint = useCallback(async (sprintId: number, scopeIds: number[]) => {
    const result = await addScopesToSprint(sprintId, scopeIds);
    if (result && result.unmet_dependencies.length > 0) {
      showUnmetDeps(sprintId, result.unmet_dependencies);
    }
  }, [addScopesToSprint, showUnmetDeps]);

  const handleCreateGroup = useCallback(async (name: string, options: { target_column: string; group_type: 'sprint' | 'batch' }) => {
    const sprint = await createSprint(name, { ...options, projectId: defaultProjectId });
    if (sprint) setEditingSprintId(sprintKey(sprint));
    return sprint;
  }, [createSprint, defaultProjectId]);

  const handleProjectChange = useCallback(async (sprintId: number, newProjectId: string) => {
    const sprint = sprints.find(s => s.id === sprintId);
    if (!sprint?.project_id) return;
    await moveSprintToProject(sprintId, sprint.project_id, newProjectId);
  }, [sprints, moveSprintToProject]);

  if (loading && scopes.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      modifiers={modifiers}
      collisionDetection={sprintAwareCollision}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
    >
      <div className="flex flex-1 min-h-0 flex-col">
        {/* Project Tab Bar (multi-project only) */}
        <ProjectTabBar />

        {/* Header — single row */}
        <div className="mb-4 flex items-center gap-3">
          <LayoutDashboard className="h-4 w-4 text-primary shrink-0" />
          <h1 className="text-xl font-light shrink-0">Kanban</h1>

          <div className="ml-auto flex items-center gap-2 shrink-0">
            <SearchInput
              query={search.query}
              mode={search.mode}
              isStale={search.isStale}
              onQueryChange={search.setQuery}
              onModeChange={search.setMode}
            />
            <ScopeFilterBar
              filters={filters}
              optionsWithCounts={optionsWithCounts}
              onToggle={toggleFilter}
              onClearField={clearField}
              onClearAll={clearAll}
              hasActiveFilters={hasActiveFilters}
            />
            <ViewModeSelector
              viewMode={viewMode}
              groupField={groupField}
              onViewModeChange={setViewMode}
              onGroupFieldChange={setGroupField}
            />
            <CardDisplayToggle display={cardDisplay} onToggle={toggleCardDisplay} hiddenCount={hiddenCount} />
          </div>
        </div>

        {/* Error toast */}
        {dndState.error && (
          <div className="mb-3 flex items-center gap-2 rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
            <span className="flex-1">{dndState.error}</span>
            <button onClick={dismissError} className="shrink-0 hover:text-red-200 transition-colors">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Board — Kanban or Swimlane */}
        {viewMode === 'swimlane' ? (
          <SwimlaneBoardView
            lanes={swimLanes}
            columns={effectiveColumns}
            collapsedColumns={collapsed}
            collapsedLanes={collapsedLanes}
            onToggleLane={toggleLaneCollapse}
            onToggleCollapse={toggleCollapse}
            onScopeClick={handleScopeClick}
            cardDisplay={cardDisplay}
            dimmedIds={mergedDimmedIds}
            isDragActive={!!(dndState.activeScope || dndState.activeSprint)}
            validTargets={validTargets}
            sprints={sprints}
            projectLookup={projectLookup}
          />
        ) : (
          <div className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden" data-tour="kanban-board">
            <div className="flex h-full w-max gap-2 pb-4">
              {effectiveColumns.map((col) => (
                <KanbanColumn
                  key={col.id}
                  id={col.id}
                  label={col.label}
                  color={col.color}
                  scopes={scopesByStatus[col.id] ?? []}
                  sprints={sprintsByColumn[col.id]}
                  scopeLookup={scopeLookup}
                  globalSprintScopeIds={globalSprintScopeIds}
                  onScopeClick={handleScopeClick}
                  onDeleteSprint={deleteSprint}

                  onRenameSprint={(id, name) => renameSprint(id, name)}
                  editingSprintId={editingSprintId}
                  onSprintEditingDone={() => setEditingSprintId(null)}
                  onAddAllToSprint={handleAddAllToSprint}
                  isDragActive={!!(dndState.activeScope || dndState.activeSprint)}
                  isValidDrop={validTargets.has(col.id)}
                  sortField={sortField}
                  sortDirection={sortDirection}
                  onSetSort={setSort}
                  collapsed={collapsed.has(col.id)}
                  onToggleCollapse={() => toggleCollapse(col.id)}
                  cardDisplay={cardDisplay}
                  dimmedIds={mergedDimmedIds}
                  projectLookup={projectLookup}
                  onProjectChange={handleProjectChange}
                  headerExtra={isAllProjects && allProjectsBoard && !allProjectsBoard.isUnified ? undefined :
                    <ColumnHeaderActions
                      columnId={col.id}
                      dispatching={dndState.dispatching}
                      onOpenIdeaForm={openIdeaForm}
                      onCreateGroup={handleCreateGroup}
                    />
                  }
                />
              ))}
            </div>
          </div>
        )}

        {/* Drag overlay — floating preview */}
        <DragOverlay
          activeScope={dndState.activeScope}
          activeSprint={dndState.activeSprint}
          cardDisplay={cardDisplay}
          projectLookup={projectLookup}
          scopeLookup={scopeLookup}
        />

        {/* Quick confirm dialog */}
        <DispatchPopover
          open={dndState.showPopover}
          scope={dndState.pending?.scope ?? null}
          transition={dndState.pending?.transition ?? null}
          hasActiveSession={dndState.pending?.hasActiveSession ?? false}
          dispatching={dndState.dispatching}
          error={dndState.error}
          onConfirm={confirmTransition}
          onCancel={cancelTransition}
          onViewDetails={openModalFromPopover}
        />

        {/* Full confirm modal */}
        <DispatchModal
          open={dndState.showModal}
          scope={dndState.pending?.scope ?? null}
          transition={dndState.pending?.transition ?? null}
          hasActiveSession={dndState.pending?.hasActiveSession ?? false}
          dispatching={dndState.dispatching}
          error={dndState.error}
          onConfirm={confirmTransition}
          onCancel={cancelTransition}
        />

        {/* Scope detail modal */}
        <ScopeDetailModal
          scope={selectedScope}
          open={!!selectedScope}
          onClose={() => setSelectedScopeKey(null)}
        />

        {/* Idea form dialog */}
        <IdeaFormDialog
          open={dndState.showIdeaForm}
          loading={dndState.dispatching}
          onSubmit={submitIdea}
          onCancel={closeIdeaForm}
          onSurprise={handleSurprise}
          surpriseLoading={surpriseLoading}
        />

        {/* Idea detail modal */}
        <IdeaDetailModal
          scope={selectedIdea}
          open={!!selectedIdea}
          onClose={() => setSelectedIdea(null)}
          onDelete={(slug) => {
            setSelectedIdea(null);
            fetch(buildUrl(`/ideas/${slug}`), { method: 'DELETE' }).catch(() => {});
          }}
          onApprove={handleApproveGhost}
          onReject={handleRejectGhost}
        />

        {/* Sprint preflight modal */}
        <SprintPreflightModal
          open={preflight.showPreflight}
          sprint={preflight.pendingSprint}
          graph={preflight.graph}
          loading={preflight.loading}
          onConfirm={preflight.onConfirm}
          onCancel={preflight.onCancel}
        />


        {/* Unmet dependency dialog */}
        <SprintDependencyDialog
          open={dndState.pendingUnmetDeps != null}
          unmetDeps={dndState.pendingUnmetDeps ?? []}
          onAddAll={resolveUnmetDeps}
          onCancel={dismissUnmetDeps}
        />

        {/* Transition disambiguation dialog (All Projects phase view) */}
        <TransitionDisambiguationDialog
          open={dndState.pendingDisambiguation != null}
          edges={dndState.pendingDisambiguation?.edges ?? []}
          onSelect={selectDisambiguation}
          onCancel={dismissDisambiguation}
        />
      </div>
    </DndContext>
  );
}
