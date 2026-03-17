import { Info } from 'lucide-react';
import type { SwimLane } from '@/lib/swimlane';
import type { Scope, ScopeStatus, CardDisplayConfig, BoardColumn, Sprint } from '@/types';
import { SwimLaneRow } from './SwimLaneRow';
import { cn } from '@/lib/utils';
import { useTheme } from '@/hooks/useTheme';

interface SwimlaneBoardViewProps {
  lanes: SwimLane[];
  columns: BoardColumn[];
  collapsedColumns: Set<string>;
  collapsedLanes: Set<string>;
  onToggleLane: (laneValue: string) => void;
  onToggleCollapse: (columnId: string) => void;
  onScopeClick?: (scope: Scope) => void;
  cardDisplay?: CardDisplayConfig;
  dimmedIds?: Set<number>;
  isDragActive: boolean;
  validTargets: Set<ScopeStatus>;
  sprints: Sprint[];
}

export function SwimlaneBoardView({
  lanes,
  columns,
  collapsedColumns,
  collapsedLanes,
  onToggleLane,
  onToggleCollapse,
  onScopeClick,
  cardDisplay,
  dimmedIds,
  isDragActive,
  validTargets,
  sprints,
}: SwimlaneBoardViewProps) {
  const { neonGlass } = useTheme();

  // Filter out collapsed columns for grid sizing
  const visibleColumns = columns.filter((c) => !collapsedColumns.has(c.id));
  const gridTemplateColumns = `140px ${visibleColumns.map(() => '200px').join(' ')}`;

  const hasActiveSprints = sprints.some((s) =>
    s.group_type === 'sprint' || (s.group_type === 'batch' && s.status !== 'completed')
  );

  return (
    <div className="min-h-0 flex-1 overflow-auto">
      {/* Sprint info banner */}
      {hasActiveSprints && (
        <div className="mb-2 flex items-center gap-2 rounded border border-primary/20 bg-primary/5 px-3 py-1.5 text-xs text-muted-foreground">
          <Info className="h-3.5 w-3.5 text-primary shrink-0" />
          Sprint groups are hidden in swimlane view
        </div>
      )}

      <div
        className="grid gap-px pb-4"
        style={{ gridTemplateColumns, width: 'max-content' }}
      >
        {/* Column headers — sticky top row */}
        <div className="sticky top-0 z-20 bg-background" />
        {visibleColumns.map((col) => (
          <button
            key={col.id}
            onClick={() => onToggleCollapse(col.id)}
            className={cn(
              'sticky top-0 z-20 flex items-center gap-1.5 rounded-t border-b border-white/[0.06] bg-background px-2 py-1.5 text-left cursor-pointer hover:bg-white/[0.03] transition-colors',
              neonGlass && 'border-b-white/[0.08]',
            )}
          >
            <div className={cn('h-2 w-2 rounded-full shrink-0', neonGlass && 'animate-glow-pulse')} style={{ backgroundColor: `hsl(${col.color})` }} />
            <span className="text-xxs uppercase tracking-wider font-normal text-muted-foreground truncate">
              {col.label}
            </span>
          </button>
        ))}

        {/* Lane rows */}
        {lanes.map((lane) => (
          <SwimLaneRow
            key={lane.value}
            lane={lane}
            columns={visibleColumns}
            collapsedColumns={collapsedColumns}
            isLaneCollapsed={collapsedLanes.has(lane.value)}
            onToggleLane={() => onToggleLane(lane.value)}
            onScopeClick={onScopeClick}
            cardDisplay={cardDisplay}
            dimmedIds={dimmedIds}
            isDragActive={isDragActive}
            validTargets={validTargets}
          />
        ))}

        {/* Empty state */}
        {lanes.length === 0 && (
          <>
            <div />
            <div className={cn('col-span-full py-12 text-center text-xs text-muted-foreground')}>
              No scopes to display
            </div>
          </>
        )}
      </div>
    </div>
  );
}
