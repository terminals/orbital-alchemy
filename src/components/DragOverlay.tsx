import { DragOverlay as DndDragOverlay } from '@dnd-kit/core';
import { ScopeCard } from './ScopeCard';
import { SprintDragPreview } from './SprintContainer';
import type { Scope, Sprint, CardDisplayConfig, Project } from '@/types';

interface DragOverlayProps {
  activeScope: Scope | null;
  activeSprint?: Sprint | null;
  cardDisplay?: CardDisplayConfig;
  projectLookup?: Map<string, Project>;
  scopeLookup?: Map<string, Scope>;
}

export function DragOverlay({ activeScope, activeSprint, cardDisplay, projectLookup, scopeLookup }: DragOverlayProps) {
  return (
    <DndDragOverlay dropAnimation={null}>
      {activeScope && (
        <div className="w-72 rotate-2 opacity-90 shadow-xl shadow-black/40">
          <ScopeCard scope={activeScope} cardDisplay={cardDisplay} project={activeScope.project_id && projectLookup ? projectLookup.get(activeScope.project_id) : undefined} />
        </div>
      )}
      {activeSprint && (
        <SprintDragPreview sprint={activeSprint} scopeLookup={scopeLookup} projectLookup={projectLookup} />
      )}
    </DndDragOverlay>
  );
}
