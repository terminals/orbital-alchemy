import { useDroppable } from '@dnd-kit/core';
import type { Scope, ScopeStatus, CardDisplayConfig } from '@/types';
import { ScopeCard } from './ScopeCard';
import { cn } from '@/lib/utils';

interface SwimCellProps {
  laneValue: string;
  status: ScopeStatus;
  scopes: Scope[];
  onScopeClick?: (scope: Scope) => void;
  cardDisplay?: CardDisplayConfig;
  dimmedIds?: Set<number>;
  isDragActive: boolean;
  isValidDrop: boolean;
  isCollapsed: boolean;
}

export function SwimCell({
  laneValue,
  status,
  scopes = [],
  onScopeClick,
  cardDisplay,
  dimmedIds,
  isDragActive,
  isValidDrop,
  isCollapsed,
}: SwimCellProps) {
  const droppableId = `swim::${laneValue}::${status}`;
  const { setNodeRef, isOver } = useDroppable({ id: droppableId });

  if (isCollapsed) return null;

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'swim-cell min-h-[48px] rounded border border-white/[0.04] p-1 transition-colors',
        isDragActive && isOver && isValidDrop && 'ring-2 ring-green-500/60 border-green-500/40 bg-green-500/5',
        isDragActive && isOver && !isValidDrop && 'ring-2 ring-red-500/50 border-red-500/30 bg-red-500/5',
        isDragActive && !isOver && isValidDrop && 'border-green-500/20',
        scopes.length === 0 && 'border-dashed border-white/[0.06]',
      )}
    >
      <div className="space-y-1.5">
        {scopes.filter((s) => !s.is_ghost).map((scope) => (
          <ScopeCard
            key={scope.id}
            scope={scope}
            onClick={onScopeClick}
            cardDisplay={cardDisplay}
            dimmed={dimmedIds?.has(scope.id)}
          />
        ))}
        {scopes.filter((s) => s.is_ghost).map((scope) => (
          <ScopeCard
            key={scope.id}
            scope={scope}
            onClick={onScopeClick}
            cardDisplay={cardDisplay}
            dimmed={dimmedIds?.has(scope.id)}
          />
        ))}
      </div>
    </div>
  );
}
