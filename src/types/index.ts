// ─── Scope Types ───────────────────────────────────────────

// ScopeStatus is a dynamic string — runtime validation via engine.isValidStatus()
export type ScopeStatus = string;

export type ScopePriority = 'critical' | 'high' | 'medium' | 'low';

export interface Scope {
  id: number;
  title: string;
  status: string;
  is_ghost?: boolean;
  priority: ScopePriority | null;
  effort_estimate: string | null;
  category: string | null;
  tags: string[];
  blocked_by: number[];
  blocks: number[];
  file_path: string;
  created_at: string | null;
  updated_at: string | null;
  raw_content: string | null;
  sessions: Record<string, string[]>;
}

// ─── Card Display Types ────────────────────────────────────

export interface CardDisplayConfig {
  effort: boolean;
  category: boolean;
  priority: boolean;
  tags: boolean;
}

// ─── Filter Types ──────────────────────────────────────────

export type FilterField = 'priority' | 'category' | 'tags' | 'effort' | 'dependencies';

export type ViewMode = 'kanban' | 'swimlane';
export type SwimGroupField = 'priority' | 'category' | 'tags' | 'effort' | 'dependencies';

export type ScopeFilterState = Record<FilterField, Set<string>>;

export const PRIORITY_OPTIONS = ['critical', 'high', 'medium', 'low'] as const;

// Default categories — overridden at runtime by /api/orbital/config
export const CATEGORY_OPTIONS = [
  'feature', 'bugfix', 'refactor', 'infrastructure', 'docs',
] as const;

export const EFFORT_BUCKETS = ['<1H', '1-4H', '4H+', 'TBD'] as const;

export const DEPENDENCY_OPTIONS = ['has-blockers', 'blocks-others', 'no-deps'] as const;

// ─── Event Types ───────────────────────────────────────────

export type EventType =
  | 'SESSION_START'
  | 'SESSION_END'
  | 'CHECKPOINT_SAVED'
  | 'HANDOFF_CREATED'
  | 'SKILL_INVOKED'
  | 'SKILL_COMPLETED'
  | 'AGENT_STARTED'
  | 'AGENT_FINDING'
  | 'AGENT_COMPLETED'
  | 'AGENT_CONSENSUS'
  | 'GATE_STARTED'
  | 'GATE_PASSED'
  | 'GATE_FAILED'
  | 'ALL_GATES_PASSED'
  | 'FILE_MODIFIED'
  | 'BUILD_COMPLETED'
  | 'TESTS_COMPLETED'
  | 'BRANCH_CREATED'
  | 'COMMIT_CREATED'
  | 'PR_CREATED'
  | 'PR_MERGED'
  | 'DEPLOY_STARTED'
  | 'DEPLOY_HEALTHY'
  | 'DEPLOY_FAILED'
  | 'ROLLBACK_INITIATED'
  | 'SCOPE_CREATED'
  | 'SCOPE_STATUS_CHANGED'
  | 'SCOPE_COMPLETED'
  | 'VIOLATION'
  | 'OVERRIDE'
  | 'PATTERN_DETECTED'
  | 'RULE_PROPOSED'
  | 'SCOPE_TRANSITION'
  | 'COMMIT'
  | 'DISPATCH';

export interface OrbitalEvent {
  id: string;
  type: EventType;
  scope_id: number | null;
  session_id: string | null;
  agent: string | null;
  data: Record<string, unknown>;
  timestamp: string;
}

// ─── Quality Gate Types ────────────────────────────────────

export type GateStatus = 'pass' | 'fail' | 'running' | 'skipped';

export interface QualityGate {
  id: number;
  scope_id: number | null;
  gate_name: string;
  status: GateStatus;
  details: string | null;
  duration_ms: number | null;
  run_at: string;
  commit_sha: string | null;
}

// ─── Deployment Types ──────────────────────────────────────

export type DeployEnvironment = 'staging' | 'production';
export type DeployStatus = 'deploying' | 'healthy' | 'failed' | 'rolled-back';

export interface Deployment {
  id: number;
  environment: DeployEnvironment;
  status: DeployStatus;
  commit_sha: string | null;
  branch: string | null;
  pr_number: number | null;
  health_check_url: string | null;
  started_at: string | null;
  completed_at: string | null;
  details: Record<string, unknown> | null;
}

// ─── Pipeline Drift Types ─────────────────────────────────

export interface DriftCommit {
  sha: string;
  message: string;
  author: string;
  date: string; // ISO 8601
}

export interface BranchHead {
  sha: string;
  date: string;
  message: string;
}

export interface PipelineDrift {
  devToStaging: { count: number; commits: DriftCommit[]; oldestDate: string | null };
  stagingToMain: { count: number; commits: DriftCommit[]; oldestDate: string | null };
  heads: { dev: BranchHead; staging: BranchHead; main: BranchHead };
}

export interface DeployFrequencyWeek {
  week: string;
  staging: number;
  production: number;
}

// ─── Session Types ─────────────────────────────────────────

export interface Session {
  id: string;
  scope_id: number | null;
  claude_session_id: string | null;
  action: string | null;
  started_at: string | null;
  ended_at: string | null;
  handoff_file: string | null;
  summary: string | null;
  discoveries: string[];
  next_steps: string[];
  progress_pct: number | null;
}

// ─── Agent Types ───────────────────────────────────────────

// Agent configuration — loaded dynamically from /api/orbital/config
export interface AgentConfig {
  id: string;
  label: string;
  emoji: string;
  color: string;
}

// AgentName is now a dynamic string — validated at runtime against config
export type AgentName = string;

// Default agents — overridden at runtime by /api/orbital/config
const DEFAULT_AGENTS: AgentConfig[] = [
  { id: 'attacker', label: 'Attacker', emoji: '\u{1F5E1}\u{FE0F}', color: '#ff1744' },
  { id: 'chaos', label: 'Chaos', emoji: '\u{1F4A5}', color: '#F97316' },
  { id: 'frontend-designer', label: 'Frontend Designer', emoji: '\u{1F3A8}', color: '#EC4899' },
  { id: 'architect', label: 'Architect', emoji: '\u{1F3D7}\u{FE0F}', color: '#536dfe' },
  { id: 'devops-expert', label: 'DevOps Expert', emoji: '\u{1F680}', color: '#40c4ff' },
  { id: 'rules-enforcer', label: 'Rules Enforcer', emoji: '\u{1F4CB}', color: '#6B7280' },
];

/** Build emoji map from agent config array */
export function buildAgentEmoji(agents?: AgentConfig[]): Record<string, string> {
  const list = agents ?? DEFAULT_AGENTS;
  return Object.fromEntries(list.map(a => [a.id, a.emoji]));
}

/** Build color map from agent config array */
export function buildAgentColor(agents?: AgentConfig[]): Record<string, string> {
  const list = agents ?? DEFAULT_AGENTS;
  return Object.fromEntries(list.map(a => [a.id, a.color]));
}

// Legacy compatibility — static defaults for initial render before config loads
export const AGENT_EMOJI: Record<string, string> = buildAgentEmoji();
export const AGENT_COLOR: Record<string, string> = buildAgentColor();

// ─── Board Column Config ───────────────────────────────────

export interface BoardColumn {
  id: string;
  label: string;
  color: string;
}

// ─── Sprint / Batch Types ─────────────────────────────────

export type SprintStatus = 'assembling' | 'dispatched' | 'in_progress' | 'completed' | 'failed' | 'cancelled';
export type SprintScopeStatus = 'pending' | 'queued' | 'dispatched' | 'in_progress' | 'completed' | 'failed' | 'skipped';
export type GroupType = 'sprint' | 'batch';

export interface BatchDispatchResult {
  commit_sha?: string;
  pr_url?: string;
  pr_number?: number;
  dispatched_at?: string;
}

export interface Sprint {
  id: number;
  name: string;
  status: SprintStatus;
  concurrency_cap: number;
  group_type: GroupType;
  target_column: string;
  dispatch_result: BatchDispatchResult | null;
  scope_ids: number[];
  scopes: SprintScope[];
  layers: number[][] | null;
  progress: { pending: number; in_progress: number; completed: number; failed: number; skipped: number };
  created_at: string;
  updated_at: string;
  dispatched_at: string | null;
  completed_at: string | null;
}

export interface SprintScope {
  scope_id: number;
  title: string;
  scope_status: string;
  effort_estimate: string | null;
  layer: number | null;
  dispatch_status: SprintScopeStatus;
}

// ─── Socket Events ─────────────────────────────────────────

export interface DispatchResolvedPayload {
  event_id: string;
  scope_id: number | null;
  outcome: 'completed' | 'failed';
}

export interface ServerToClientEvents {
  'scope:updated': (scope: Scope) => void;
  'scope:created': (scope: Scope) => void;
  'scope:deleted': (scopeId: number) => void;
  'event:new': (event: OrbitalEvent) => void;
  'dispatch:resolved': (payload: DispatchResolvedPayload) => void;
  'gate:updated': (gate: QualityGate) => void;
  'deploy:updated': (deployment: Deployment) => void;
  'session:updated': (session: Session) => void;
  'sprint:created': (sprint: Sprint) => void;
  'sprint:updated': (sprint: Sprint) => void;
  'sprint:deleted': (payload: { id: number }) => void;
  'sprint:completed': (sprint: Sprint) => void;
  'workflow:changed': () => void;
}

export interface ClientToServerEvents {
  'subscribe': (channel: string) => void;
  'unsubscribe': (channel: string) => void;
}
