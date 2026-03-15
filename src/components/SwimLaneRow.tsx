import { ChevronRight } from 'lucide-react';
import type { SwimLane } from '@/lib/swimlane';
import type { Scope, ScopeStatus, CardDisplayConfig, BoardColumn } from '@/types';
import { SwimCell } from './SwimCell';
import { cn } from '@/lib/utils';

interface SwimLaneRowProps {
  lane: SwimLane;
  columns: BoardColumn[];
  collapsedColumns: Set<string>;
  isLaneCollapsed: boolean;
  onToggleLane: () => void;
  onScopeClick?: (scope: Scope) => void;
  cardDisplay?: CardDisplayConfig;
  dimmedIds?: Set<number>;
  isDragActive: boolean;
  validTargets: Set<ScopeStatus>;
}

export function SwimLaneRow({
  lane,
  columns,
  collapsedColumns,
  isLaneCollapsed,
  onToggleLane,
  onScopeClick,
  cardDisplay,
  dimmedIds,
  isDragActive,
  validTargets,
}: SwimLaneRowProps) {
  if (isLaneCollapsed) {
    return (
      <>
        {/* Lane label cell — collapsed */}
        <button
          onClick={onToggleLane}
          className="swim-lane-header flex items-center gap-2 rounded-l px-3 py-1.5 text-left hover:bg-white/[0.04] transition-colors cursor-pointer sticky left-0 z-10 bg-background"
        >
          <div className={cn('h-full w-0.5 rounded-full shrink-0 self-stretch', lane.color)} />
          <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
          <span className="text-xxs font-medium text-muted-foreground truncate capitalize">
            {lane.label}
          </span>
          <span className="ml-auto rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground shrink-0">
            {lane.count}
          </span>
        </button>
        {/* Empty cells across columns */}
        {columns.map((col) => (
          <div key={col.id} className={cn(collapsedColumns.has(col.id) && 'hidden')} />
        ))}
      </>
    );
  }

  return (
    <>
      {/* Lane label cell */}
      <button
        onClick={onToggleLane}
        className="swim-lane-header flex items-start gap-2 rounded-l px-3 py-2 text-left hover:bg-white/[0.04] transition-colors cursor-pointer sticky left-0 z-10 bg-background"
      >
        <div className={cn('w-0.5 rounded-full shrink-0 min-h-[32px] self-stretch', lane.color)} />
        <div className="flex flex-col gap-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0 rotate-90 transition-transform" />
            <span className="swim-lane-label text-xxs font-medium text-foreground/80 truncate capitalize">
              {lane.label}
            </span>
          </div>
          <span className="text-[10px] text-muted-foreground">
            {lane.count} scope{lane.count !== 1 ? 's' : ''}
          </span>
        </div>
      </button>
      {/* Cells per column */}
      {columns.map((col) => (
        <SwimCell
          key={col.id}
          laneValue={lane.value}
          status={col.id}
          scopes={lane.cells[col.id]}
          onScopeClick={onScopeClick}
          cardDisplay={cardDisplay}
          dimmedIds={dimmedIds}
          isDragActive={isDragActive}
          isValidDrop={validTargets.has(col.id)}
          isCollapsed={collapsedColumns.has(col.id)}
        />
      ))}
    </>
  );
}
