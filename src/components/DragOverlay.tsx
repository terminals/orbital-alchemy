import { DragOverlay as DndDragOverlay } from '@dnd-kit/core';
import { ScopeCard } from './ScopeCard';
import { SprintDragPreview } from './SprintContainer';
import type { Scope, Sprint, CardDisplayConfig } from '@/types';

interface DragOverlayProps {
  activeScope: Scope | null;
  activeSprint?: Sprint | null;
  cardDisplay?: CardDisplayConfig;
}

export function DragOverlay({ activeScope, activeSprint, cardDisplay }: DragOverlayProps) {
  return (
    <DndDragOverlay dropAnimation={null}>
      {activeScope && (
        <div className="w-72 rotate-2 opacity-90 shadow-xl shadow-black/40">
          <ScopeCard scope={activeScope} cardDisplay={cardDisplay} />
        </div>
      )}
      {activeSprint && (
        <SprintDragPreview sprint={activeSprint} />
      )}
    </DndDragOverlay>
  );
}
