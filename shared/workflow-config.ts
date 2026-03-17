// --- Type Aliases ---

export type TransitionContext = 'patch' | 'dispatch' | 'event' | 'bulk-sync' | 'rollback';
export type TransitionResult = { ok: true } | { ok: false; error: string; code: string };
export type ConfirmLevel = 'quick' | 'full';
export type EdgeDirection = 'forward' | 'backward' | 'shortcut';
export type HookCategory = 'guard' | 'gate' | 'lifecycle' | 'observer';
export type HookEnforcement = 'blocker' | 'advisor' | 'operator' | 'silent';

// --- Claude Code Hook Types ---

export type CcHookEvent = 'SessionStart' | 'SessionEnd' | 'PreToolUse' | 'PostToolUse';
export type HookSource = 'workflow' | 'claude-code' | 'both';

export interface CcHookParsed {
  id: string;
  scriptPath: string;
  scriptName: string;
  event: CcHookEvent;
  matcher: string | null;
  statusMessage: string;
}

export interface CcTrigger {
  event: CcHookEvent;
  matcher: string | null;
  statusMessage: string;
}

export interface UnifiedHook {
  id: string;
  label: string;
  scriptPath: string;
  source: HookSource;
  workflow?: {
    timing: 'before' | 'after';
    type: 'shell' | 'event' | 'webhook';
    category: HookCategory;
    blocking: boolean;
    description?: string;
  };
  ccTriggers?: CcTrigger[];
}

// --- Interfaces ---

export interface WorkflowConfig {
  version: 1;
  name: string;
  description?: string;
  branchingMode?: 'trunk' | 'worktree';
  lists: WorkflowList[];
  edges: WorkflowEdge[];
  hooks?: WorkflowHook[];
  groups?: ListGroup[];
  eventInference?: EventInferenceRule[];
  allowedCommandPrefixes?: string[];
  terminalStatuses?: string[];
  commitBranchPatterns?: string;
}

export interface WorkflowList {
  id: string;
  label: string;
  order: number;
  group?: string;
  color: string;
  hex: string;
  isEntryPoint?: boolean;
  supportsBatch?: boolean;
  supportsSprint?: boolean;
  hasDirectory: boolean;
  gitBranch?: string;
  sessionKey?: string;
  activeHooks?: string[];
}

export interface WorkflowEdge {
  from: string;
  to: string;
  direction: EdgeDirection;
  command: string | null;
  confirmLevel: ConfirmLevel;
  checklist?: string[];
  label: string;
  description: string;
  skipServerTransition?: boolean;
  dispatchOnly?: boolean;
  humanOnly?: boolean;
  hooks?: string[];
  agents?: string[];
}

export interface WorkflowHook {
  id: string;
  label: string;
  timing: 'before' | 'after';
  type: 'shell' | 'event' | 'webhook';
  target: string;
  blocking?: boolean;
  description?: string;
  category: HookCategory;
}

export interface ListGroup {
  id: string;
  label: string;
  order: number;
}

export interface EventInferenceRule {
  eventType: string;
  targetStatus: string;
  dataField?: string;
  dataMap?: Record<string, string>;
  conditions?: Record<string, unknown>;
  forwardOnly: boolean;
}

// --- Type Guards ---

export function isWorkflowConfig(obj: unknown): obj is WorkflowConfig {
  if (typeof obj !== 'object' || obj === null) return false;
  const o = obj as Record<string, unknown>;
  return (
    o.version === 1 &&
    typeof o.name === 'string' &&
    Array.isArray(o.lists) &&
    Array.isArray(o.edges) &&
    (o.lists as unknown[]).every(isWorkflowList) &&
    (o.edges as unknown[]).every(isWorkflowEdge) &&
    (o.branchingMode === undefined || o.branchingMode === 'trunk' || o.branchingMode === 'worktree')
  );
}

export function isWorkflowList(obj: unknown): obj is WorkflowList {
  if (typeof obj !== 'object' || obj === null) return false;
  const o = obj as Record<string, unknown>;
  return (
    typeof o.id === 'string' &&
    typeof o.label === 'string' &&
    typeof o.order === 'number' &&
    typeof o.color === 'string' &&
    typeof o.hex === 'string' &&
    typeof o.hasDirectory === 'boolean'
  );
}

const CATEGORY_TO_ENFORCEMENT: Record<HookCategory, HookEnforcement> = {
  guard: 'blocker',
  gate: 'advisor',
  lifecycle: 'operator',
  observer: 'silent',
};

export function getHookEnforcement(hook: WorkflowHook): HookEnforcement {
  return CATEGORY_TO_ENFORCEMENT[hook.category];
}

export function isWorkflowEdge(obj: unknown): obj is WorkflowEdge {
  if (typeof obj !== 'object' || obj === null) return false;
  const o = obj as Record<string, unknown>;
  return (
    typeof o.from === 'string' &&
    typeof o.to === 'string' &&
    typeof o.direction === 'string' &&
    typeof o.label === 'string' &&
    typeof o.description === 'string'
  );
}
