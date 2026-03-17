import { useDroppable } from '@dnd-kit/core';
import type { Scope, ScopeStatus, Sprint, CardDisplayConfig } from '@/types';
import type { SortField, SortDirection } from '@/hooks/useBoardSettings';
import { ScopeCard } from './ScopeCard';
import { SprintContainer } from './SprintContainer';
import { ColumnMenu } from './ColumnMenu';
import { useTheme } from '@/hooks/useTheme';
import { cn } from '@/lib/utils';

interface KanbanColumnProps {
  id: ScopeStatus;
  label: string;
  color: string;
  scopes: Scope[];
  /** Sprints to render in this column (assembling in Ready, active in Implementing) */
  sprints?: Sprint[];
  scopeLookup?: Map<number, Scope>;
  /** Global set of scope IDs in active groups across ALL columns (cross-column dedup) */
  globalSprintScopeIds?: Set<number>;
  onScopeClick?: (scope: Scope) => void;
  onDeleteSprint?: (id: number) => void;
  onDispatchSprint?: (id: number) => void;
  onRenameSprint?: (id: number, name: string) => void;
  /** ID of a sprint that was just created and should start with name editing */
  editingSprintId?: number | null;
  onSprintEditingDone?: () => void;
  isValidDrop?: boolean;
  isDragActive?: boolean;
  headerExtra?: React.ReactNode;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  sortField?: SortField;
  sortDirection?: SortDirection;
  onSetSort?: (field: SortField) => void;
  cardDisplay?: CardDisplayConfig;
  dimmedIds?: Set<number>;
  onAddAllToSprint?: (sprintId: number, scopeIds: number[]) => void;
}

export function KanbanColumn({
  id,
  label,
  color,
  scopes,
  sprints = [],
  scopeLookup = new Map(),
  globalSprintScopeIds,
  onScopeClick,
  onDeleteSprint,
  onDispatchSprint,
  onRenameSprint,
  editingSprintId,
  onSprintEditingDone,
  isValidDrop,
  isDragActive,
  headerExtra,
  collapsed,
  onToggleCollapse,
  sortField,
  sortDirection,
  onSetSort,
  cardDisplay,
  dimmedIds,
  onAddAllToSprint,
}: KanbanColumnProps) {
  const { neonGlass } = useTheme();
  const { setNodeRef, isOver } = useDroppable({ id });

  // Scopes that are in a sprint/batch should not appear as loose cards.
  // Use the global set (cross-column dedup) if available, otherwise fall back to local.
  const sprintScopeIds = globalSprintScopeIds ?? new Set(sprints.flatMap((s) => s.scope_ids));
  const looseScopes = scopes.filter((s) => !sprintScopeIds.has(s.id));
  const looseScopeIds = looseScopes.filter((s) => !s.is_ghost).map((s) => s.id);
  const totalCount = scopes.length;

  const showCollapsed = collapsed;

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex h-full flex-shrink-0 flex-col rounded border bg-card/50 overflow-hidden transition-[width] duration-300 ease-in-out',
        showCollapsed ? 'w-10 cursor-pointer items-center' : 'w-72',
        neonGlass && 'card-glass neon-border-blue',
        isDragActive && isOver && isValidDrop && 'ring-2 ring-green-500/60 border-green-500/40 bg-green-500/5',
        isDragActive && isOver && !isValidDrop && 'ring-2 ring-red-500/50 border-red-500/30 bg-red-500/5',
        isDragActive && !isOver && isValidDrop && 'border-green-500/20',
      )}
      onClick={showCollapsed ? onToggleCollapse : undefined}
    >
      {showCollapsed ? (
        <>
          {/* Menu at top */}
          <div className="flex items-center justify-center py-1.5" onClick={(e) => e.stopPropagation()}>
            {sortField && sortDirection && onSetSort && onToggleCollapse && (
              <ColumnMenu
                sortField={sortField}
                sortDirection={sortDirection}
                onSetSort={onSetSort}
                collapsed
                onToggleCollapse={onToggleCollapse}
              />
            )}
          </div>

          {/* Rotated label */}
          {/* Rotated label */}
          <div className="flex items-start justify-center overflow-hidden pt-2">
            <div className="flex items-center gap-2 [writing-mode:vertical-lr]">
              <div className={cn('h-2.5 w-2.5 rounded-full shrink-0', neonGlass && 'animate-glow-pulse')} style={{ backgroundColor: `hsl(${color})` }} />
              <span className="text-xxs uppercase tracking-wider font-normal text-muted-foreground whitespace-nowrap">
                {label}
              </span>
            </div>
          </div>

          {/* Count badge — upright, below label */}
          <span className="mt-2 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground">
            {totalCount}
          </span>
        </>
      ) : (
        <>
          {/* Column header — click to collapse */}
          <div className="flex items-center gap-2 border-b px-2.5 py-1.5 cursor-pointer" onClick={onToggleCollapse}>
            <div className={cn('h-2.5 w-2.5 rounded-full', neonGlass && 'animate-glow-pulse')} style={{ backgroundColor: `hsl(${color})` }} />
            <h2 className="text-xxs uppercase tracking-wider font-normal text-muted-foreground">{label}</h2>
            <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-xs font-normal text-muted-foreground">
              {totalCount}
            </span>
            {headerExtra && <span onClick={(e) => e.stopPropagation()}>{headerExtra}</span>}
            {sortField && sortDirection && onSetSort && onToggleCollapse && (
              <span onClick={(e) => e.stopPropagation()}>
                <ColumnMenu
                  sortField={sortField}
                  sortDirection={sortDirection}
                  onSetSort={onSetSort}
                  collapsed={false}
                  onToggleCollapse={onToggleCollapse}
                />
              </span>
            )}
          </div>

          {/* Cards */}
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            <div className="space-y-1.5">
              {sprints.map((sprint) => (
                <SprintContainer
                  key={`sprint-${sprint.id}`}
                  sprint={sprint}
                  scopeLookup={scopeLookup}
                  onDelete={onDeleteSprint}
                  onDispatch={onDispatchSprint}
                  onRename={onRenameSprint}
                  onScopeClick={onScopeClick}
                  cardDisplay={cardDisplay}
                  dimmedIds={dimmedIds}
                  editingName={sprint.id === editingSprintId}
                  onEditingDone={onSprintEditingDone}
                  looseCount={sprint.status === 'assembling' ? looseScopeIds.length : 0}
                  onAddAll={sprint.status === 'assembling' && onAddAllToSprint
                    ? (sprintId) => onAddAllToSprint(sprintId, looseScopeIds)
                    : undefined
                  }
                />
              ))}

              {looseScopes.filter((s) => !s.is_ghost).map((scope) => (
                <ScopeCard
                  key={scope.id}
                  scope={scope}
                  onClick={onScopeClick}
                  cardDisplay={cardDisplay}
                  dimmed={dimmedIds?.has(scope.id)}
                />
              ))}
              {looseScopes.some((s) => s.is_ghost) && looseScopes.some((s) => !s.is_ghost) && (
                <div className="my-2 border-t border-dashed border-purple-500/20" />
              )}
              {looseScopes.filter((s) => s.is_ghost).map((scope) => (
                <ScopeCard
                  key={scope.id}
                  scope={scope}
                  onClick={onScopeClick}
                  cardDisplay={cardDisplay}
                  dimmed={dimmedIds?.has(scope.id)}
                />
              ))}
              {totalCount === 0 && isDragActive && isOver && isValidDrop && (
                <p className="py-8 text-center text-xs text-muted-foreground/50">
                  Drop here
                </p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
