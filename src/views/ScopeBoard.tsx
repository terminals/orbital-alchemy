import { useState, useMemo, useEffect } from 'react';
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
import { BatchPreflightModal } from '@/components/BatchPreflightModal';
import { SprintDependencyDialog } from '@/components/SprintDependencyDialog';
import { ColumnHeaderActions } from '@/components/ColumnHeaderActions';
import { sprintAwareCollision } from '@/lib/collisionDetection';
import { computeSwimLanes } from '@/lib/swimlane';
import { computeAllProjectsBoard } from '@/lib/all-projects-board';
import { scopeKey } from '@/lib/scope-key';
import { WorkflowNormalizer } from '../../shared/workflow-normalizer';
import { ProjectTabBar } from '@/components/ProjectTabBar';
import { TransitionDisambiguationDialog } from '@/components/TransitionDisambiguationDialog';
import { useProjectUrl } from '@/hooks/useProjectUrl';
import { useProjects } from '@/hooks/useProjectContext';
import type { Scope, Project } from '@/types';

export function ScopeBoard() {
  const buildUrl = useProjectUrl();
  const { scopes, loading, refetch } = useScopes();
  const { engine } = useWorkflow();
  const { activeProjectId, projects, projectEngines, isMultiProject } = useProjects();
  const { sortField, sortDirection, setSort, collapsed, toggleCollapse } = useBoardSettings();
  const { viewMode, setViewMode, groupField, setGroupField, collapsedLanes, toggleLaneCollapse } = useSwimlaneBoardSettings();
  const { display: cardDisplay, toggle: toggleCardDisplay, hiddenCount } = useCardDisplay();
  const [selectedScopeKey, setSelectedScopeKey] = useState<string | null>(null);
  const selectedScope = useMemo(() => scopes.find((s) => scopeKey(s) === selectedScopeKey) ?? null, [scopes, selectedScopeKey]);
  const [selectedIdea, setSelectedIdea] = useState<Scope | null>(null);
  const [pendingBatchDispatch, setPendingBatchDispatch] = useState<number | null>(null);

  // Dynamic board columns from engine
  const boardColumns = useMemo(() => engine.getBoardColumns(), [engine]);

  // All Projects: compute phase-normalized or unified board
  const isAllProjects = isMultiProject && activeProjectId === null;
  const allProjectsBoard = useMemo(() => {
    if (!isAllProjects || projectEngines.size === 0) return null;
    return computeAllProjectsBoard(scopes, projectEngines);
  }, [isAllProjects, scopes, projectEngines]);

  // Effective columns: All Projects board columns or single-project columns
  const effectiveColumns = allProjectsBoard?.columns ?? boardColumns;

  // Project lookup for card badges
  const projectLookup = useMemo(() => {
    if (!isMultiProject) return undefined;
    const map = new Map<string, Project>();
    for (const p of projects) map.set(p.id, p);
    return map;
  }, [isMultiProject, projects]);

  const {
    sprints,
    createSprint,
    renameSprint,
    deleteSprint,
    addScopes: addScopesToSprint,
    removeScopes: removeScopesFromSprint,
    dispatchSprint,
    getGraph,
  } = useSprints();

  const [editingSprintId, setEditingSprintId] = useState<number | null>(null);

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
  });

  // 8px activation constraint so clicks pass through to detail modal
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor),
  );
  const modifiers = useZoomModifier();

  // Build scope lookup from full set so sprint containers always resolve
  // Uses numeric ID since sprints are per-project (not aggregated in All Projects)
  const scopeLookup = useMemo(() => {
    const map = new Map<number, Scope>();
    for (const scope of scopes) map.set(scope.id, scope);
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
        groups[colId] = sortScopes(
          colScopes.filter(s => displayKeys.has(scopeKey(s))),
          sortField,
          sortDirection,
        );
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
      groups[key] = sortScopes(groups[key], sortField, sortDirection);
    }

    return groups;
  }, [search.displayScopes, sortField, sortDirection, boardColumns, engine, allProjectsBoard]);

  // Sprints/batches by column using target_column (W-6)
  const sprintsByColumn = useMemo(() => {
    const map: Record<string, typeof sprints> = {};
    for (const group of sprints) {
      // Hide completed batches — failed batches stay visible for attention
      if (group.group_type === 'batch' && group.status === 'completed') continue;
      // Active sprints render in implementing; everything else uses target_column
      const col = group.group_type === 'sprint' && group.status !== 'assembling'
        ? 'implementing'
        : group.target_column;
      (map[col] ??= []).push(group);
    }
    return map;
  }, [sprints]);

  // Global set of scope IDs in active sprint/batch groups across ALL columns.
  // Used for cross-column deduplication so a scope never renders as both
  // a loose card in one column and inside a group container in another.
  const globalSprintScopeIds = useMemo(() => {
    const ids = new Set<number>();
    for (const group of sprints) {
      if (group.group_type === 'batch' && group.status === 'completed') continue;
      for (const scopeId of group.scope_ids) {
        ids.add(scopeId);
      }
    }
    return ids;
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

    return computeSwimLanes(search.displayScopes, groupField, sortField, sortDirection, resolveColumnId);
  }, [viewMode, search.displayScopes, groupField, sortField, sortDirection, isAllProjects, allProjectsBoard, projectEngines]);

  // Compute valid drop targets for the currently dragged item
  const validTargets = useMemo(() => {
    if (dndState.activeScope) {
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
      return new Set<string>(['implementing']);
    }
    return new Set<string>();
  }, [dndState.activeScope, dndState.activeSprint, engine, isAllProjects, allProjectsBoard, projectEngines]);

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
            onScopeClick={(scope) => scope.status === engine.getEntryPoint().id ? setSelectedIdea(scope) : setSelectedScopeKey(scopeKey(scope))}
            cardDisplay={cardDisplay}
            dimmedIds={mergedDimmedIds}
            isDragActive={!!(dndState.activeScope || dndState.activeSprint)}
            validTargets={validTargets}
            sprints={sprints}
          />
        ) : (
          <div className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden">
            <div className="flex h-full w-max gap-2 pb-4">
              {effectiveColumns.map((col) => (
                <KanbanColumn
                  key={col.id}
                  id={col.id}
                  label={col.label}
                  color={col.color}
                  scopes={scopesByStatus[col.id] ?? []}
                  sprints={isAllProjects ? undefined : sprintsByColumn[col.id]}
                  scopeLookup={scopeLookup}
                  globalSprintScopeIds={isAllProjects ? undefined : globalSprintScopeIds}
                  onScopeClick={(scope) => scope.status === engine.getEntryPoint().id ? setSelectedIdea(scope) : setSelectedScopeKey(scopeKey(scope))}
                  onDeleteSprint={isAllProjects ? undefined : deleteSprint}
                  onDispatchSprint={isAllProjects ? undefined : (id) => setPendingBatchDispatch(id)}
                  onRenameSprint={isAllProjects ? undefined : (id, name) => renameSprint(id, name)}
                  editingSprintId={isAllProjects ? undefined : editingSprintId}
                  onSprintEditingDone={isAllProjects ? undefined : () => setEditingSprintId(null)}
                  onAddAllToSprint={isAllProjects ? undefined : async (sprintId, scopeIds) => {
                    const result = await addScopesToSprint(sprintId, scopeIds);
                    if (result && result.unmet_dependencies.length > 0) {
                      showUnmetDeps(sprintId, result.unmet_dependencies);
                    }
                  }}
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
                  headerExtra={isAllProjects ? undefined :
                    <ColumnHeaderActions
                      columnId={col.id}
                      dispatching={dndState.dispatching}
                      onOpenIdeaForm={openIdeaForm}
                      onCreateGroup={async (name, options) => {
                        const sprint = await createSprint(name, options);
                        if (sprint) setEditingSprintId(sprint.id);
                        return sprint;
                      }}
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
          onDelete={async (slug) => {
            try {
              const res = await fetch(buildUrl(`/ideas/${slug}`), { method: 'DELETE' });
              if (!res.ok) throw new Error(`HTTP ${res.status}`);
            } catch {
              // keep going — modal closes either way
            }
            setSelectedIdea(null);
            refetch();
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

        {/* Batch preflight modal */}
        <BatchPreflightModal
          open={pendingBatchDispatch != null}
          batch={sprints.find((s) => s.id === pendingBatchDispatch) ?? null}
          onConfirm={() => {
            if (pendingBatchDispatch != null) dispatchSprint(pendingBatchDispatch);
            setPendingBatchDispatch(null);
          }}
          onCancel={() => setPendingBatchDispatch(null)}
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
