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
import { ActiveDispatchContext, useActiveDispatchProvider } from '@/hooks/useActiveDispatches';
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
import { SprintPreflightModal } from '@/components/SprintPreflightModal';
import { BatchPreflightModal } from '@/components/BatchPreflightModal';
import { SprintDependencyDialog } from '@/components/SprintDependencyDialog';
import { ColumnHeaderActions } from '@/components/ColumnHeaderActions';
import { Badge } from '@/components/ui/badge';
import { sprintAwareCollision } from '@/lib/collisionDetection';
import { computeSwimLanes } from '@/lib/swimlane';
import type { Scope } from '@/types';

export function ScopeBoard() {
  const { scopes, loading } = useScopes();
  const { engine } = useWorkflow();
  const activeDispatchCtx = useActiveDispatchProvider();
  const { sortField, sortDirection, setSort, collapsed, toggleCollapse } = useBoardSettings();
  const { viewMode, setViewMode, groupField, setGroupField, collapsedLanes, toggleLaneCollapse } = useSwimlaneBoardSettings();
  const { display: cardDisplay, toggle: toggleCardDisplay, hiddenCount } = useCardDisplay();
  const [selectedScopeId, setSelectedScopeId] = useState<number | null>(null);
  const selectedScope = useMemo(() => scopes.find((s) => s.id === selectedScopeId) ?? null, [scopes, selectedScopeId]);
  const [selectedIdea, setSelectedIdea] = useState<Scope | null>(null);
  const [pendingBatchDispatch, setPendingBatchDispatch] = useState<number | null>(null);

  // Dynamic board columns from engine
  const boardColumns = useMemo(() => engine.getBoardColumns(), [engine]);

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
  const { highlightedScopeId, clearHighlight } = useStatusBarHighlight();

  // Merge search dimming with statusbar highlight dimming
  const mergedDimmedIds = useMemo(() => {
    if (highlightedScopeId == null) return search.dimmedIds;
    const dimmed = new Set<number>();
    for (const scope of search.displayScopes) {
      if (scope.id !== highlightedScopeId) dimmed.add(scope.id);
    }
    return dimmed;
  }, [highlightedScopeId, search.dimmedIds, search.displayScopes]);

  // Click anywhere to clear highlight
  useEffect(() => {
    if (highlightedScopeId == null) return;
    const timer = setTimeout(() => {
      document.addEventListener('click', clearHighlight, { once: true });
    }, 100);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('click', clearHighlight);
    };
  }, [highlightedScopeId, clearHighlight]);

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
  } = useKanbanDnd({
    scopes: search.displayScopes,
    sprints,
    onAddToSprint: addScopesToSprint,
    onRemoveFromSprint: removeScopesFromSprint,
  });

  // 8px activation constraint so clicks pass through to detail modal
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor),
  );
  const modifiers = useZoomModifier();

  // Build scope lookup from full set so sprint containers always resolve
  const scopeLookup = useMemo(() => {
    const map = new Map<number, Scope>();
    for (const scope of scopes) map.set(scope.id, scope);
    return map;
  }, [scopes]);

  const scopesByStatus = useMemo(() => {
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
  }, [search.displayScopes, sortField, sortDirection, boardColumns, engine]);

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
    return computeSwimLanes(search.displayScopes, groupField, sortField, sortDirection);
  }, [viewMode, search.displayScopes, groupField, sortField, sortDirection]);

  // Compute valid drop targets for the currently dragged item
  const validTargets = useMemo(() => {
    if (dndState.activeScope) {
      return new Set(engine.getValidTargets(dndState.activeScope.status));
    }
    if (dndState.activeSprint) {
      return new Set<string>(['implementing']);
    }
    return new Set<string>();
  }, [dndState.activeScope, dndState.activeSprint, engine]);

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

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <ActiveDispatchContext.Provider value={activeDispatchCtx}>
    <DndContext
      sensors={sensors}
      modifiers={modifiers}
      collisionDetection={sprintAwareCollision}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
    >
      <div className="flex flex-1 min-h-0 flex-col">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <LayoutDashboard className="h-4 w-4 text-primary" />
            <h1 className="text-xl font-light">Kanban</h1>
            <Badge variant="secondary" className="ml-2">
              {search.hasSearch
                ? `${search.matchCount} / ${scopes.length} scopes`
                : hasActiveFilters
                ? `${filteredScopes.length} / ${scopes.length} scopes`
                : `${scopes.length} scopes`}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
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

        {/* Filters + Search */}
        <ScopeFilterBar
          filters={filters}
          optionsWithCounts={optionsWithCounts}
          onToggle={toggleFilter}
          onClearField={clearField}
          onClearAll={clearAll}
          hasActiveFilters={hasActiveFilters}
          searchQuery={search.query}
          searchMode={search.mode}
          searchIsStale={search.isStale}
          onSearchChange={search.setQuery}
          onSearchModeChange={search.setMode}
        />

        {/* Board — Kanban or Swimlane */}
        {viewMode === 'swimlane' ? (
          <SwimlaneBoardView
            lanes={swimLanes}
            columns={boardColumns}
            collapsedColumns={collapsed}
            collapsedLanes={collapsedLanes}
            onToggleLane={toggleLaneCollapse}
            onToggleCollapse={toggleCollapse}
            onScopeClick={(scope) => scope.status === engine.getEntryPoint().id ? setSelectedIdea(scope) : setSelectedScopeId(scope.id)}
            cardDisplay={cardDisplay}
            dimmedIds={mergedDimmedIds}
            isDragActive={!!(dndState.activeScope || dndState.activeSprint)}
            validTargets={validTargets}
            sprints={sprints}
          />
        ) : (
          <div className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden">
            <div className="flex h-full w-max gap-2 pb-4">
              {boardColumns.map((col) => (
                <KanbanColumn
                  key={col.id}
                  id={col.id}
                  label={col.label}
                  color={col.color}
                  scopes={scopesByStatus[col.id] ?? []}
                  sprints={sprintsByColumn[col.id]}
                  scopeLookup={scopeLookup}
                  globalSprintScopeIds={globalSprintScopeIds}
                  onScopeClick={(scope) => scope.status === engine.getEntryPoint().id ? setSelectedIdea(scope) : setSelectedScopeId(scope.id)}
                  onDeleteSprint={deleteSprint}
                  onDispatchSprint={(id) => setPendingBatchDispatch(id)}
                  onRenameSprint={(id, name) => renameSprint(id, name)}
                  editingSprintId={editingSprintId}
                  onSprintEditingDone={() => setEditingSprintId(null)}
                  onAddAllToSprint={async (sprintId, scopeIds) => {
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
                  headerExtra={
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
          onConfirm={confirmTransition}
          onCancel={cancelTransition}
        />

        {/* Scope detail modal */}
        <ScopeDetailModal
          scope={selectedScope}
          open={!!selectedScope}
          onClose={() => setSelectedScopeId(null)}
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
          onDelete={async (id) => {
            try {
              const res = await fetch(`/api/orbital/ideas/${id}`, { method: 'DELETE' });
              if (!res.ok) throw new Error(`HTTP ${res.status}`);
              setSelectedIdea(null);
            } catch {
              setSelectedIdea(null);
            }
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
      </div>
    </DndContext>
    </ActiveDispatchContext.Provider>
  );
}
