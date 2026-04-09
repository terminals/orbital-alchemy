import { useDroppable } from '@dnd-kit/core';
import { AnimatePresence, motion } from 'framer-motion';
import type { Scope, ScopeStatus, CardDisplayConfig } from '@/types';
import { ScopeCard } from './ScopeCard';
import { cn } from '@/lib/utils';
import { scopeKey } from '@/lib/scope-key';

interface SwimCellProps {
  laneValue: string;
  status: ScopeStatus;
  scopes: Scope[];
  onScopeClick?: (scope: Scope) => void;
  cardDisplay?: CardDisplayConfig;
  dimmedIds?: Set<string>;
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
        'swim-cell min-h-[48px] overflow-hidden rounded border border-white/[0.04] p-1 transition-colors',
        isDragActive && isOver && isValidDrop && 'ring-2 ring-inset ring-green-500/60 border-green-500/40 bg-green-500/5',
        isDragActive && isOver && !isValidDrop && 'ring-2 ring-inset ring-red-500/50 border-red-500/30 bg-red-500/5',
        isDragActive && !isOver && isValidDrop && 'border-green-500/20',
        scopes.length === 0 && 'border-dashed border-white/[0.06]',
      )}
    >
      <div className="space-y-1.5">
        {isDragActive && isValidDrop && (
          <div className={cn(
            'flex h-8 items-center justify-center rounded border-2 border-dashed text-[10px] transition-colors',
            isOver
              ? 'border-cyan-500/60 bg-cyan-500/10 text-cyan-400'
              : 'border-white/20 bg-white/[0.03] text-white/30',
          )}>
            Drop here
          </div>
        )}
        <AnimatePresence initial={false}>
          {scopes.filter((s) => !s.is_ghost).map((scope) => (
            <motion.div key={scopeKey(scope)} layout transition={{ duration: 0.25, ease: 'easeInOut' }}>
              <ScopeCard
                scope={scope}
                onClick={onScopeClick}
                cardDisplay={cardDisplay}
                dimmed={dimmedIds?.has(scopeKey(scope))}
              />
            </motion.div>
          ))}
        </AnimatePresence>
        <AnimatePresence initial={false}>
          {scopes.filter((s) => s.is_ghost).map((scope) => (
            <motion.div key={scopeKey(scope)} layout transition={{ duration: 0.25, ease: 'easeInOut' }}>
              <ScopeCard
                scope={scope}
                onClick={onScopeClick}
                cardDisplay={cardDisplay}
                dimmed={dimmedIds?.has(scopeKey(scope))}
              />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
