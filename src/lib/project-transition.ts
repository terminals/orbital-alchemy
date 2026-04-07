import type { WorkflowEdge } from '../../shared/workflow-config';
import type { WorkflowEngine } from '../../shared/workflow-engine';
import { WorkflowNormalizer } from '../../shared/workflow-normalizer';
import type { Phase } from '../../shared/workflow-normalizer';

/**
 * Resolve a normalized (phase-level) transition for a scope.
 *
 * When the All Projects board shows phase columns and a card is dragged
 * from one phase to another, this function finds valid workflow transitions
 * from the scope's current status to any status in the target phase.
 *
 * Returns:
 * - A single edge if exactly one valid transition exists (proceed normally)
 * - Multiple edges if disambiguation is needed (show picker dialog)
 * - Empty array if no valid transitions exist (reject the drop)
 */
export function resolvePhaseTransition(
  engine: WorkflowEngine,
  currentStatus: string,
  targetPhase: Phase,
): WorkflowEdge[] {
  const normalizer = new WorkflowNormalizer(engine);
  return normalizer.resolveNormalizedTransition(currentStatus, targetPhase);
}

/**
 * Get the workflow engine for a scope's project.
 * Falls back to the provided default engine if the project is unknown.
 */
export function getEngineForScope(
  scopeProjectId: string | undefined,
  projectEngines: Map<string, WorkflowEngine>,
  defaultEngine: WorkflowEngine,
): WorkflowEngine {
  if (scopeProjectId && projectEngines.has(scopeProjectId)) {
    return projectEngines.get(scopeProjectId)!;
  }
  return defaultEngine;
}
