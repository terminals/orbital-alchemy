import type { WorkflowConfig } from '../workflow-config.js';
import defaultWorkflowJson from '../default-workflow.json' with { type: 'json' };

/** The full 7-list trunk-based workflow from default-workflow.json */
export const DEFAULT_CONFIG = defaultWorkflowJson as unknown as WorkflowConfig;

/** Smallest valid config: 2 lists, 1 edge, 1 entry point */
export const MINIMAL_CONFIG: WorkflowConfig = {
  version: 1,
  name: 'Minimal',
  lists: [
    { id: 'todo', label: 'To Do', order: 0, color: '0 0% 50%', hex: '#808080', isEntryPoint: true, hasDirectory: true },
    { id: 'done', label: 'Done', order: 1, color: '120 50% 50%', hex: '#40bf40', hasDirectory: true },
  ],
  edges: [
    { from: 'todo', to: 'done', direction: 'forward', command: null, confirmLevel: 'quick', label: 'Complete', description: 'Mark as done' },
  ],
  terminalStatuses: ['done'],
  allowedCommandPrefixes: ['/test-'],
};

/** Config with hooks for hook-related tests */
export const CONFIG_WITH_HOOKS: WorkflowConfig = {
  version: 1,
  name: 'With Hooks',
  lists: [
    { id: 'backlog', label: 'Backlog', order: 0, color: '0 0% 50%', hex: '#808080', isEntryPoint: true, hasDirectory: true, supportsSprint: true },
    { id: 'active', label: 'Active', order: 1, color: '200 80% 50%', hex: '#1a8ccc', hasDirectory: true, sessionKey: 'implementScope' },
    { id: 'review', label: 'Review', order: 2, color: '45 90% 50%', hex: '#f0c010', hasDirectory: true, supportsBatch: true, sessionKey: 'reviewGate' },
    { id: 'shipped', label: 'Shipped', order: 3, color: '120 70% 40%', hex: '#30a030', hasDirectory: true, gitBranch: 'main' },
  ],
  edges: [
    { from: 'backlog', to: 'active', direction: 'forward', command: '/scope-implement {id}', confirmLevel: 'quick', label: 'Start', description: 'Begin work', dispatchOnly: true, autoRevert: true, hooks: ['blocker-check'], agents: ['architect'] },
    { from: 'active', to: 'review', direction: 'forward', command: '/scope-post-review {id}', confirmLevel: 'quick', label: 'Review', description: 'Submit for review', dispatchOnly: true, hooks: ['blocker-check', 'session-enforcer'] },
    { from: 'review', to: 'shipped', direction: 'forward', command: '/git-main', confirmLevel: 'quick', label: 'Ship', description: 'Push to main', dispatchOnly: true },
    { from: 'active', to: 'backlog', direction: 'backward', command: null, confirmLevel: 'quick', label: 'Revert', description: 'Back to backlog', humanOnly: true },
    { from: 'review', to: 'active', direction: 'backward', command: null, confirmLevel: 'quick', label: 'Rework', description: 'Back to active' },
  ],
  hooks: [
    { id: 'blocker-check', label: 'Blocker Check', timing: 'before', type: 'shell', target: '.claude/hooks/blocker-check.sh', blocking: false, category: 'gate', description: 'Checks for blockers' },
    { id: 'session-enforcer', label: 'Session Auth', timing: 'before', type: 'shell', target: '.claude/hooks/session-enforcer.sh', blocking: true, category: 'guard', description: 'Enforces session auth' },
    { id: 'scope-transition', label: 'File Mover', timing: 'before', type: 'shell', target: '.claude/hooks/scope-transition.sh', blocking: false, category: 'lifecycle' },
    { id: 'dashboard-sync', label: 'Dashboard Sync', timing: 'after', type: 'shell', target: '.claude/hooks/dashboard-sync.sh', blocking: false, category: 'observer' },
  ],
  groups: [
    { id: 'planning', label: 'Planning', order: 0 },
    { id: 'development', label: 'Development', order: 1 },
  ],
  eventInference: [
    { eventType: 'SCOPE_STATUS_CHANGED', targetStatus: '', dataField: 'to', forwardOnly: true },
    { eventType: 'AGENT_STARTED', targetStatus: 'active', forwardOnly: true },
    { eventType: 'AGENT_COMPLETED', targetStatus: '', conditions: { outcome: ['success', 'failure'], dispatchResolution: true }, forwardOnly: false },
  ],
  terminalStatuses: ['shipped'],
  allowedCommandPrefixes: ['/scope-', '/git-'],
};

/** Named invalid configs for constructor error tests */
export const INVALID_CONFIGS = {
  noLists: { version: 1 as const, name: 'No Lists', lists: [], edges: [{ from: 'a', to: 'b', direction: 'forward' as const, command: null, confirmLevel: 'quick' as const, label: 'X', description: 'X' }] } as WorkflowConfig,
  noEdges: { version: 1 as const, name: 'No Edges', lists: [{ id: 'a', label: 'A', order: 0, color: '0 0% 0%', hex: '#000', isEntryPoint: true, hasDirectory: true }], edges: [] } as WorkflowConfig,
  twoEntryPoints: {
    version: 1 as const,
    name: 'Two Entry Points',
    lists: [
      { id: 'a', label: 'A', order: 0, color: '0 0% 0%', hex: '#000', isEntryPoint: true, hasDirectory: true },
      { id: 'b', label: 'B', order: 1, color: '0 0% 0%', hex: '#000', isEntryPoint: true, hasDirectory: true },
    ],
    edges: [{ from: 'a', to: 'b', direction: 'forward' as const, command: null, confirmLevel: 'quick' as const, label: 'X', description: 'X' }],
  } as WorkflowConfig,
  zeroEntryPoints: {
    version: 1 as const,
    name: 'Zero Entry Points',
    lists: [
      { id: 'a', label: 'A', order: 0, color: '0 0% 0%', hex: '#000', hasDirectory: true },
      { id: 'b', label: 'B', order: 1, color: '0 0% 0%', hex: '#000', hasDirectory: true },
    ],
    edges: [{ from: 'a', to: 'b', direction: 'forward' as const, command: null, confirmLevel: 'quick' as const, label: 'X', description: 'X' }],
  } as WorkflowConfig,
};
