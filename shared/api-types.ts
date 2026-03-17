// ─── Shared API Types ────────────────────────────────────────
//
// Types shared between server and client. Single source of truth for
// enums/unions that were previously duplicated across layers.

export type SprintStatus = 'assembling' | 'dispatched' | 'in_progress' | 'completed' | 'failed' | 'cancelled';
export type SprintScopeStatus = 'pending' | 'queued' | 'dispatched' | 'in_progress' | 'completed' | 'failed' | 'skipped';
export type GroupType = 'sprint' | 'batch';

export type GateStatus = 'pass' | 'fail' | 'running' | 'skipped';

export type DeployStatus = 'deploying' | 'healthy' | 'failed' | 'rolled-back';
export type DeployEnvironment = 'staging' | 'production';

export interface AgentConfig {
  id: string;
  label: string;
  emoji: string;
  color: string;
}
