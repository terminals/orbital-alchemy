import { pointerWithin, rectIntersection, type CollisionDetection } from '@dnd-kit/core';

/**
 * Custom collision detection: prioritizes sprint-drop targets (nested batch zones)
 * over column droppables when the pointer is directly over a batch container.
 */
export const sprintAwareCollision: CollisionDetection = (args) => {
  // pointerWithin detects droppables under the actual cursor — precise for nested zones
  const pointerHits = pointerWithin(args);

  // Prioritize sprint-drop targets (batch containers)
  const sprintDrop = pointerHits.find((c) => String(c.id).startsWith('sprint-drop-'));
  if (sprintDrop) return [sprintDrop];

  // If pointer is over any droppable, use pointerWithin results
  if (pointerHits.length > 0) return pointerHits;

  // Fallback: rectIntersection for edge cases (drag near boundaries)
  return rectIntersection(args);
};
