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

// ─── Dispatch Flags (CLI flags passed to `claude`) ──────────

export interface DispatchFlags {
  permissionMode: 'bypass' | 'default' | 'plan' | 'acceptEdits';
  verbose: boolean;
  model: string;
  maxTurns: number;
  allowedTools: string[];
  disallowedTools: string[];
  reasoningEffort: '' | 'low' | 'medium' | 'high';
  appendSystemPrompt: string;
  outputFormat: '' | 'text' | 'json' | 'stream-json';
  noMarkdown: boolean;
  printMode: boolean;
}

export const DEFAULT_DISPATCH_FLAGS: DispatchFlags = {
  permissionMode: 'bypass',
  verbose: true,
  model: '',
  maxTurns: 0,
  allowedTools: [],
  disallowedTools: [],
  reasoningEffort: '',
  appendSystemPrompt: '',
  outputFormat: '',
  noMarkdown: false,
  printMode: false,
};

// ─── Dispatch Config (Orbital operational settings) ─────────

export interface DispatchConfig {
  staleTimeoutMinutes: number;
  maxBatchSize: number;
  maxConcurrent: number;
  envVars: Record<string, string>;
}

export const DEFAULT_DISPATCH_CONFIG: DispatchConfig = {
  staleTimeoutMinutes: 10,
  maxBatchSize: 20,
  maxConcurrent: 0,
  envVars: {},
};

// ─── Validation ─────────────────────────────────────────────

export const VALID_PERMISSION_MODES = ['bypass', 'default', 'plan', 'acceptEdits'] as const;
export const VALID_MODELS = ['', 'sonnet', 'opus', 'haiku'];
export const VALID_REASONING_EFFORTS = ['', 'low', 'medium', 'high'];
export const VALID_OUTPUT_FORMATS = ['', 'text', 'json', 'stream-json'];
export const VALID_TERMINAL_ADAPTERS = ['auto', 'iterm2', 'subprocess', 'none'];

const SAFE_TOOL_NAME = /^[a-zA-Z0-9_:.-]+$/;
const SAFE_ENV_KEY = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function validateToolName(name: string): boolean {
  return SAFE_TOOL_NAME.test(name);
}

export function validateEnvKey(key: string): boolean {
  return SAFE_ENV_KEY.test(key);
}

export function validateDispatchFlags(flags: Partial<DispatchFlags>): string | null {
  if (flags.permissionMode !== undefined && !VALID_PERMISSION_MODES.includes(flags.permissionMode as typeof VALID_PERMISSION_MODES[number])) {
    return `Invalid permissionMode: ${flags.permissionMode}`;
  }
  if (flags.model !== undefined && !VALID_MODELS.includes(flags.model)) {
    return `Invalid model: ${flags.model}`;
  }
  if (flags.reasoningEffort !== undefined && !VALID_REASONING_EFFORTS.includes(flags.reasoningEffort as string)) {
    return `Invalid reasoningEffort: ${flags.reasoningEffort}`;
  }
  if (flags.outputFormat !== undefined && !VALID_OUTPUT_FORMATS.includes(flags.outputFormat as string)) {
    return `Invalid outputFormat: ${flags.outputFormat}`;
  }
  if (flags.maxTurns !== undefined && (typeof flags.maxTurns !== 'number' || flags.maxTurns < 0 || !Number.isInteger(flags.maxTurns))) {
    return 'maxTurns must be a non-negative integer';
  }
  if (flags.allowedTools !== undefined) {
    if (!Array.isArray(flags.allowedTools)) return 'allowedTools must be an array';
    for (const t of flags.allowedTools) {
      if (typeof t !== 'string' || !validateToolName(t)) return `Invalid tool name: ${t}`;
    }
  }
  if (flags.disallowedTools !== undefined) {
    if (!Array.isArray(flags.disallowedTools)) return 'disallowedTools must be an array';
    for (const t of flags.disallowedTools) {
      if (typeof t !== 'string' || !validateToolName(t)) return `Invalid tool name: ${t}`;
    }
  }
  if (flags.appendSystemPrompt !== undefined && typeof flags.appendSystemPrompt !== 'string') {
    return 'appendSystemPrompt must be a string';
  }
  return null;
}

export function validateDispatchConfig(config: Partial<DispatchConfig> & { terminalAdapter?: string }): string | null {
  if (config.terminalAdapter !== undefined && !VALID_TERMINAL_ADAPTERS.includes(config.terminalAdapter)) {
    return `Invalid terminalAdapter: ${config.terminalAdapter}`;
  }
  if (config.staleTimeoutMinutes !== undefined && (typeof config.staleTimeoutMinutes !== 'number' || config.staleTimeoutMinutes < 1)) {
    return 'staleTimeoutMinutes must be a positive number';
  }
  if (config.maxBatchSize !== undefined && (typeof config.maxBatchSize !== 'number' || config.maxBatchSize < 1)) {
    return 'maxBatchSize must be a positive number';
  }
  if (config.maxConcurrent !== undefined && (typeof config.maxConcurrent !== 'number' || config.maxConcurrent < 0)) {
    return 'maxConcurrent must be a non-negative number';
  }
  if (config.envVars !== undefined) {
    if (typeof config.envVars !== 'object' || config.envVars === null || Array.isArray(config.envVars)) {
      return 'envVars must be an object';
    }
    for (const key of Object.keys(config.envVars)) {
      if (!validateEnvKey(key)) return `Invalid env var key: ${key}`;
    }
  }
  return null;
}
