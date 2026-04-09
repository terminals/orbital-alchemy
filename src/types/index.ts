import type {
  SprintStatus, SprintScopeStatus, GroupType,
  GateStatus, DeployStatus, DeployEnvironment, AgentConfig,
} from '../../shared/api-types.js';

// Re-export shared types so existing imports from '@/types' keep working
export type { SprintStatus, SprintScopeStatus, GroupType, GateStatus, DeployStatus, DeployEnvironment, AgentConfig };

// ─── Project Types ────────────────────────────────────────

export interface Project {
  id: string;
  name: string;
  color: string;        // HSL string, e.g. "210 80% 55%"
  path: string;
  status: 'active' | 'error' | 'offline';
  enabled: boolean;
  scopeCount: number;
}

// ─── Scope Types ───────────────────────────────────────────

// ScopeStatus is a dynamic string — runtime validation via engine.isValidStatus()
export type ScopeStatus = string;

export type ScopePriority = 'critical' | 'high' | 'medium' | 'low';

export interface Scope {
  id: number;
  title: string;
  slug?: string;
  status: ScopeStatus;
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
  /** Project this scope belongs to (multi-project mode) */
  project_id?: string;
  favourite?: boolean;
}

// ─── Card Display Types ────────────────────────────────────

export interface CardDisplayConfig {
  effort: boolean;
  category: boolean;
  priority: boolean;
  tags: boolean;
  project: boolean;
}

// ─── Filter Types ──────────────────────────────────────────

export type FilterField = 'priority' | 'category' | 'tags' | 'effort' | 'dependencies';

export type ViewMode = 'kanban' | 'swimlane';
export type SwimGroupField = 'priority' | 'category' | 'tags' | 'effort' | 'dependencies' | 'project';

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
  project_id?: string;
}

// ─── Quality Gate Types ────────────────────────────────────

export interface QualityGate {
  id: number;
  scope_id: number | null;
  gate_name: string;
  status: GateStatus;
  details: string | null;
  duration_ms: number | null;
  run_at: string;
  commit_sha: string | null;
  project_id?: string;
}

// ─── Transition Readiness Types ───────────────────────────

export type HookReadiness = 'pass' | 'fail' | 'unknown';

export interface HookStatus {
  id: string;
  label: string;
  category: import('../../shared/workflow-config').HookCategory;
  enforcement: import('../../shared/workflow-config').HookEnforcement;
  status: HookReadiness;
  reason: string | null;
}

export interface TransitionReadiness {
  from: string;
  to: string;
  edge: import('../../shared/workflow-config').WorkflowEdge;
  hooks: HookStatus[];
  gates: Array<{
    gate_name: string;
    status: GateStatus;
    details: string | null;
    duration_ms: number | null;
    run_at: string;
  }>;
  ready: boolean;
  blockers: string[];
}

export interface ScopeReadiness {
  scope_id: number;
  current_status: string;
  transitions: TransitionReadiness[];
}

// ─── Enforcement Rules Types ─────────────────────────────

export interface EnforcementRuleStats {
  violations: number;
  overrides: number;
  last_triggered: string | null;
}

export interface EnforcementRule {
  hook: import('../../shared/workflow-config').WorkflowHook;
  enforcement: import('../../shared/workflow-config').HookEnforcement;
  edges: Array<{ from: string; to: string; label: string }>;
  stats: EnforcementRuleStats;
}

export interface EnforcementRulesData {
  summary: { guards: number; gates: number; lifecycle: number; observers: number };
  rules: EnforcementRule[];
  totalEdges: number;
}

export interface ViolationTrendPoint {
  day: string;
  rule: string;
  count: number;
}

// ─── Deployment Types ──────────────────────────────────────

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
  project_id?: string;
}

// ─── Agent Types ───────────────────────────────────────────

// AgentName is now a dynamic string — validated at runtime against config
export type AgentName = string;

// Default agents — overridden at runtime by /api/orbital/config
const DEFAULT_AGENTS: AgentConfig[] = [
  { id: 'frontend-designer', label: 'Frontend Designer', emoji: '\u{1F3A8}', color: '#EC4899' },
  { id: 'architect', label: 'Architect', emoji: '\u{1F3D7}\u{FE0F}', color: '#536dfe' },
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
  project_id?: string;
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
  scope_ids?: number[] | null;
  outcome: 'completed' | 'failed' | 'abandoned';
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
  'git:status:changed': () => void;
  'config:agents:changed': (payload: { action: string; path: string }) => void;
  'config:skills:changed': (payload: { action: string; path: string }) => void;
  'config:hooks:changed': (payload: { action: string; path: string }) => void;
  'version:updating': (payload: { stage: 'pulling' | 'installing' }) => void;
  'version:updated': (payload: { success: true } | { success: false; error: string }) => void;
  // Multi-project events
  'project:registered': (payload: { id: string; name: string; path: string; color: string }) => void;
  'project:unregistered': (payload: { id: string }) => void;
  'project:status:changed': (payload: { id: string; status: string }) => void;
  'project:updated': (payload: { id: string; name?: string; color?: string; enabled?: boolean }) => void;
  // Sync events
  'sync:file:updated': (payload: { relativePath: string; projects: string[] }) => void;
  'sync:file:created': (payload: { relativePath: string; autoSynced: string[]; pending: string[] }) => void;
  'sync:file:deleted': (payload: { relativePath: string; removed: string[]; preserved: string[] }) => void;
  'sync:drift:detected': (payload: { projectPath: string; relativePath: string }) => void;
  // Manifest events
  'manifest:changed': (payload: { action: string; file?: string }) => void;
}

export interface ClientToServerEvents {
  'subscribe': (payload: string | { projectId?: string; scope?: string }) => void;
  'unsubscribe': (payload: string | { projectId?: string; scope?: string }) => void;
}

// ─── Config Primitives Types ──────────────────────────────

export type ConfigPrimitiveType = 'agents' | 'skills' | 'hooks';

export interface ConfigFileNode {
  name: string;
  path: string;
  type: 'file' | 'folder';
  children?: ConfigFileNode[];
  frontmatter?: Record<string, unknown>;
}

// ─── Source Control Types ─────────────────────────────────

export interface GitOverview {
  branchingMode: 'trunk' | 'worktree';
  currentBranch: string;
  dirty: boolean;
  detached: boolean;
  mainHead: { sha: string; message: string; date: string } | null;
  aheadBehind: { ahead: number; behind: number } | null;
  worktreeCount: number;
  featureBranchCount: number;
}

export interface CommitEntry {
  sha: string;
  shortSha: string;
  message: string;
  author: string;
  date: string;
  branch: string;
  scopeId: number | null;
  refs: string[];
  project_id?: string;
  projectName?: string;
  projectColor?: string;
}

export interface BranchInfoData {
  name: string;
  isRemote: boolean;
  isCurrent: boolean;
  headSha: string;
  headMessage: string;
  headDate: string;
  aheadBehind: { ahead: number; behind: number } | null;
  scopeId: number | null;
  isStale: boolean;
}

export interface WorktreeDetail {
  path: string;
  branch: string;
  head: string;
  scopeId: number | null;
  scopeTitle: string | null;
  scopeStatus: string | null;
  dirty: boolean;
  aheadBehind: { ahead: number; behind: number } | null;
}

export interface GitHubStatus {
  connected: boolean;
  authUser: string | null;
  repo: {
    owner: string;
    name: string;
    fullName: string;
    defaultBranch: string;
    visibility: string;
    url: string;
  } | null;
  openPRs: number;
  error: string | null;
}

export interface PullRequestInfo {
  number: number;
  title: string;
  author: string;
  branch: string;
  baseBranch: string;
  state: string;
  url: string;
  createdAt: string;
  scopeIds: number[];
  reviewDecision?: 'APPROVED' | 'CHANGES_REQUESTED' | 'REVIEW_REQUIRED' | null;
  lastActivityAt?: string;
  project_id?: string;
  projectName?: string;
  projectColor?: string;
}

export interface DriftPair {
  from: string;
  to: string;
  count: number;
  commits: Array<{ sha: string; message: string; author: string; date: string }>;
}

// ─── Aggregate Repo Types ────────────────────────────────

export interface ProjectGitOverview {
  projectId: string;
  projectName: string;
  projectColor: string;
  status: 'ok' | 'error';
  overview?: GitOverview;
  error?: string;
}

export interface ProjectBranchHealth {
  projectId: string;
  projectName: string;
  projectColor: string;
  branchCount: number;
  staleBranchCount: number;
  featureBranchCount: number;
  maxDriftSeverity: 'clean' | 'low' | 'moderate' | 'high';
}

export interface RepoHealthMetrics {
  commitsPerWeek: number;
  avgPrAgeDays: number;
  staleBranchCount: number;
  driftSeverity: 'clean' | 'low' | 'moderate' | 'high';
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
}

export interface ActivityDataPoint {
  date: string;
  count: number;
}

export interface CheckRun {
  name: string;
  status: 'completed' | 'in_progress' | 'queued';
  conclusion: 'success' | 'failure' | 'neutral' | 'cancelled' | 'timed_out' | null;
  url: string;
}

// ─── Pipeline Display Types ──────────────────────────────

export interface ResolvedHook {
  id: string;
  label: string;
  category: import('../../shared/workflow-config').HookCategory;
  enforcement: import('../../shared/workflow-config').HookEnforcement;
  filePath: string | null;
  timing: 'before' | 'after';
  blocking: boolean;
  description?: string;
}

export interface ResolvedAgent {
  id: string;
  label: string;
  emoji: string;
  color: string;
  team?: string;
  filePath: string | null;
}

export interface ReviewTeam {
  skillCommand: string;
  skillPath: string | null;
  agents: ResolvedAgent[];
}

export interface EdgeData {
  edge: import('../../shared/workflow-config').WorkflowEdge;
  skillPath: string | null;
  edgeHooks: ResolvedHook[];
}

export interface StageData {
  list: import('../../shared/workflow-config').WorkflowList;
  stageHooks: ResolvedHook[];
  alwaysOnAgents: ResolvedAgent[];
  reviewTeams: ReviewTeam[];
  forwardEdges: EdgeData[];
  backwardEdges: import('../../shared/workflow-config').WorkflowEdge[];
}

export interface PipelineData {
  globalHooks: ResolvedHook[];
  stages: StageData[];
  skillPathMap: Map<string, string>;
  hookPathMap: Map<string, string>;
  agentPathMap: Map<string, string>;
  orchestratesMap: Map<string, string[]>;
}

// ─── Manifest / Configuration Types ─────────────────────

export interface ManifestFileSummary {
  total: number;
  synced: number;
  outdated: number;
  modified: number;
  pinned: number;
  missing: number;
  userOwned: number;
  byType: Record<string, { synced: number; outdated: number; modified: number; pinned: number; missing: number; userOwned: number }>;
}

export interface ManifestStatus {
  exists: boolean;
  packageVersion: string;
  installedVersion: string;
  needsUpdate: boolean;
  preset: string;
  files: ManifestFileSummary;
  lastUpdated: string;
}

export interface ManifestFileEntry {
  path: string;
  origin: 'template' | 'user';
  status: 'synced' | 'outdated' | 'modified' | 'pinned' | 'missing' | 'user-owned';
  templateHash?: string;
  installedHash: string;
  pinnedAt?: string;
  pinnedReason?: string;
  hasPrev: boolean;
}

export interface ManifestValidationReport {
  results: Array<{
    severity: 'error' | 'warning' | 'info';
    message: string;
    file?: string;
    detail?: string;
  }>;
  errors: number;
  warnings: number;
}

export interface UpdatePlanPreview {
  toAdd: string[];
  toUpdate: string[];
  toRemove: string[];
  toRename: Array<{ from: string; to: string }>;
  toSkip: Array<{ file: string; reason: string }>;
  settingsChanges: { hooksToAdd: string[]; hooksToRemove: string[] };
  pendingMigrations: string[];
  isEmpty: boolean;
}

export interface ProjectManifestOverview {
  projectId: string;
  projectName: string;
  projectColor: string;
  status: 'ok' | 'error' | 'no-manifest';
  manifest: ManifestStatus | null;
  error?: string;
}

export interface AggregateManifestSummary {
  total: number;
  projectsUpToDate: number;
  projectsOutdated: number;
  noManifest: number;
  totalOutdated: number;
  totalModified: number;
  totalPinned: number;
  totalMissing: number;
  totalSynced: number;
  totalUserOwned: number;
  projects: ProjectManifestOverview[];
}
