import type { WorkflowConfig } from '../../../shared/workflow-config';
import { isWorkflowConfig } from '../../../shared/workflow-config';

// ─── Types ──────────────────────────────────────────────

export interface ConfigValidationResult {
  valid: boolean;
  errors: string[];
}

// ─── Validation ─────────────────────────────────────────
// Mirrors server-side validation in workflow-service.ts

export function validateConfig(config: WorkflowConfig): ConfigValidationResult {
  const errors: string[] = [];

  if (!isWorkflowConfig(config)) {
    errors.push('Invalid config shape: must have version=1, name, lists[], edges[]');
    return { valid: false, errors };
  }

  // Unique list IDs
  const listIds = new Set<string>();
  for (const list of config.lists) {
    if (listIds.has(list.id)) errors.push(`Duplicate list ID: "${list.id}"`);
    listIds.add(list.id);
  }

  // Valid edge references + no duplicates
  const edgeKeys = new Set<string>();
  for (const edge of config.edges) {
    if (!listIds.has(edge.from)) errors.push(`Edge references unknown list: from="${edge.from}"`);
    if (!listIds.has(edge.to)) errors.push(`Edge references unknown list: to="${edge.to}"`);
    if (edge.from === edge.to) errors.push(`Self-referencing edge: "${edge.from}" → "${edge.to}"`);
    const key = `${edge.from}:${edge.to}`;
    if (edgeKeys.has(key)) errors.push(`Duplicate edge: ${key}`);
    edgeKeys.add(key);
  }

  // Exactly 1 entry point
  const entryPoints = config.lists.filter((l) => l.isEntryPoint);
  if (entryPoints.length === 0) errors.push('No entry point defined (isEntryPoint=true)');
  if (entryPoints.length > 1) errors.push(`Multiple entry points: ${entryPoints.map((l) => l.id).join(', ')}`);

  // Graph connectivity — all non-terminal lists reachable from entry point
  if (entryPoints.length === 1 && errors.length === 0) {
    const terminal = new Set(config.terminalStatuses ?? []);
    const reachable = new Set<string>();
    const queue = [entryPoints[0].id];
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (reachable.has(current)) continue;
      reachable.add(current);
      for (const edge of config.edges) {
        if (edge.from === current && !reachable.has(edge.to)) queue.push(edge.to);
      }
    }
    for (const list of config.lists) {
      if (!terminal.has(list.id) && !reachable.has(list.id)) {
        errors.push(`List "${list.id}" is not reachable from entry point`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}
