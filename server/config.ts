import path from 'path';
import fs from 'fs';
import { execFileSync } from 'child_process';
import os from 'os';
import { createLogger } from './utils/logger.js';

// ─── Types ──────────────────────────────────────────────────

export interface TerminalConfig {
  adapter: 'auto' | 'iterm2' | 'subprocess' | 'none';
  profilePrefix: string;
}

export interface ClaudeConfig {
  executable: string;
  flags: string[];
  dispatchFlags: DispatchFlags;
}

export interface CommandsConfig {
  typeCheck: string | null;
  lint: string | null;
  build: string | null;
  test: string | null;
}

export type { AgentConfig, DispatchFlags, DispatchConfig } from '../shared/api-types.js';
import type { AgentConfig, DispatchFlags, DispatchConfig } from '../shared/api-types.js';
import { DEFAULT_DISPATCH_FLAGS, DEFAULT_DISPATCH_CONFIG } from '../shared/api-types.js';
import { loadGlobalConfig as loadGlobal } from './global-config.js';

export interface TelemetryConfig {
  enabled: boolean;
  url: string;
  headers: Record<string, string>;
}

export interface OrbitalConfig {
  projectName: string;
  projectRoot: string;

  // Directories (resolved to absolute paths)
  scopesDir: string;
  eventsDir: string;
  dbDir: string;
  configDir: string;

  // Ports
  serverPort: number;
  clientPort: number;

  // Terminal integration
  terminal: TerminalConfig;

  // Claude Code CLI
  claude: ClaudeConfig;

  // Dispatch operational settings
  dispatch: DispatchConfig;

  // Build/test commands
  commands: CommandsConfig;

  // Logging
  logLevel: 'debug' | 'info' | 'warn' | 'error';

  // Dynamic configuration
  categories: string[];
  agents: AgentConfig[];

  // Telemetry
  telemetry: TelemetryConfig;
}

// ─── Defaults ───────────────────────────────────────────────

const DEFAULT_CONFIG: Omit<OrbitalConfig, 'projectRoot'> = {
  projectName: 'Project',
  scopesDir: 'scopes',
  eventsDir: '.claude/orbital-events',
  dbDir: '.claude/orbital',
  configDir: '.claude/config',
  serverPort: 4444,
  clientPort: 4445,
  terminal: {
    adapter: 'auto',
    profilePrefix: 'Orbital',
  },
  claude: {
    executable: 'claude',
    flags: ['--dangerously-skip-permissions'],
    dispatchFlags: DEFAULT_DISPATCH_FLAGS,
  },
  dispatch: DEFAULT_DISPATCH_CONFIG,
  commands: {
    typeCheck: null,
    lint: null,
    build: null,
    test: null,
  },
  logLevel: 'info' as const,
  telemetry: {
    enabled: false,
    url: '',
    headers: {},
  },
  categories: ['feature', 'bugfix', 'refactor', 'infrastructure', 'docs'],
  agents: [
    { id: 'attacker', label: 'Attacker', emoji: '\u{1F5E1}\u{FE0F}', color: '#ff1744' },
    { id: 'chaos', label: 'Chaos', emoji: '\u{1F4A5}', color: '#F97316' },
    { id: 'frontend-designer', label: 'Frontend Designer', emoji: '\u{1F3A8}', color: '#EC4899' },
    { id: 'architect', label: 'Architect', emoji: '\u{1F3D7}\u{FE0F}', color: '#536dfe' },
    { id: 'rules-enforcer', label: 'Rules Enforcer', emoji: '\u{1F4CB}', color: '#6B7280' },
  ],
};

// ─── Project Root Resolution ────────────────────────────────

/**
 * Resolve the project root directory.
 * Priority: ORBITAL_PROJECT_ROOT env > git rev-parse > cwd walk > cwd
 */
export function resolveProjectRoot(): string {
  // 1. Explicit env var
  if (process.env.ORBITAL_PROJECT_ROOT) {
    return path.resolve(process.env.ORBITAL_PROJECT_ROOT);
  }

  // 2. git rev-parse --show-toplevel
  try {
    const gitRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    if (gitRoot) return gitRoot;
  } catch {
    // Not in a git repo — continue
  }

  // 3. Walk up from cwd looking for .git directory
  let dir = process.cwd();
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, '.git'))) return dir;
    dir = path.dirname(dir);
  }

  // 4. Fall back to cwd
  return process.cwd();
}

// ─── Claude Sessions Path ───────────────────────────────────

/**
 * Derive the Claude Code sessions directory for a project.
 * Claude Code encodes the project path by replacing `/` with `-`.
 * The leading `/` becomes the leading `-` in the directory name.
 */
export function getClaudeSessionsDir(projectRoot: string): string {
  const encoded = projectRoot.replace(/\//g, '-');
  return path.join(os.homedir(), '.claude', 'projects', encoded);
}

// ─── Config Loading ─────────────────────────────────────────

/**
 * Load and merge orbital.config.json with defaults.
 * Resolves all relative paths to absolute using projectRoot.
 */
export function loadConfig(projectRoot?: string): OrbitalConfig {
  const root = projectRoot ?? resolveProjectRoot();

  // Try loading edition overrides (e.g. edition.json at repo root)
  const editionPath = path.join(root, 'edition.json');
  let editionConfig: Record<string, unknown> = {};
  if (fs.existsSync(editionPath)) {
    try {
      editionConfig = JSON.parse(fs.readFileSync(editionPath, 'utf-8'));
    } catch { /* malformed edition.json — ignore */ }
  }

  // Try loading user config
  const configPath = path.join(root, '.claude', 'orbital.config.json');
  let userConfig: Record<string, unknown> = {};

  const log = createLogger('config');

  if (fs.existsSync(configPath)) {
    try {
      userConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    } catch (err) {
      log.warn('Failed to parse orbital.config.json — using defaults', { error: (err as Error).message });
    }
  }

  // Merge with defaults — derive project name from directory if not configured
  const defaultProjectName = path.basename(root)
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
  const projectName = (userConfig.projectName as string) ?? defaultProjectName;

  const scopesDir = path.resolve(root, (userConfig.scopesDir as string) ?? DEFAULT_CONFIG.scopesDir);
  const eventsDir = path.resolve(root, (userConfig.eventsDir as string) ?? DEFAULT_CONFIG.eventsDir);
  const dbDir = path.resolve(root, (userConfig.dbDir as string) ?? DEFAULT_CONFIG.dbDir);
  const configDir = path.resolve(root, (userConfig.configDir as string) ?? DEFAULT_CONFIG.configDir);

  const serverPort = (userConfig.serverPort as number) ?? DEFAULT_CONFIG.serverPort;
  const clientPort = (userConfig.clientPort as number) ?? DEFAULT_CONFIG.clientPort;

  const terminal: TerminalConfig = {
    ...DEFAULT_CONFIG.terminal,
    ...(userConfig.terminal as Partial<TerminalConfig> ?? {}),
  };

  // Global settings — seed from ~/.orbital/config.json
  let globalDispatchFlags = DEFAULT_DISPATCH_FLAGS;
  let globalDispatch = DEFAULT_DISPATCH_CONFIG;
  let globalTelemetry: Partial<TelemetryConfig> = {};
  try {
    const global = loadGlobal();
    if (global.dispatchFlags) globalDispatchFlags = { ...DEFAULT_DISPATCH_FLAGS, ...global.dispatchFlags };
    if (global.dispatch) globalDispatch = { ...DEFAULT_DISPATCH_CONFIG, ...global.dispatch };
    if (global.telemetry) globalTelemetry = global.telemetry;
  } catch { /* global config may not exist yet */ }

  const userClaude = (userConfig.claude as Partial<ClaudeConfig>) ?? {};
  const claude: ClaudeConfig = {
    ...DEFAULT_CONFIG.claude,
    ...userClaude,
    dispatchFlags: globalDispatchFlags,
  };

  const dispatch: DispatchConfig = globalDispatch;

  const commands: CommandsConfig = {
    ...DEFAULT_CONFIG.commands,
    ...(userConfig.commands as Partial<CommandsConfig> ?? {}),
  };

  const logLevel = (userConfig.logLevel as OrbitalConfig['logLevel']) ?? DEFAULT_CONFIG.logLevel;
  const categories = (userConfig.categories as string[]) ?? DEFAULT_CONFIG.categories;
  const agents = (userConfig.agents as AgentConfig[]) ?? DEFAULT_CONFIG.agents;

  const telemetry: TelemetryConfig = {
    ...DEFAULT_CONFIG.telemetry,
    ...globalTelemetry,
    ...(editionConfig.telemetry as Partial<TelemetryConfig> ?? {}),
    ...(userConfig.telemetry as Partial<TelemetryConfig> ?? {}),
  };
  if (process.env.ORBITAL_TELEMETRY === 'false') telemetry.enabled = false;

  return {
    projectName,
    projectRoot: root,
    scopesDir,
    eventsDir,
    dbDir,
    configDir,
    serverPort,
    clientPort,
    terminal,
    claude,
    dispatch,
    commands,
    logLevel,
    categories,
    agents,
    telemetry,
  };
}

// ─── Singleton ──────────────────────────────────────────────

let _config: OrbitalConfig | null = null;

/** Get the global config singleton. Lazy-loaded on first access. */
export function getConfig(): OrbitalConfig {
  if (!_config) {
    _config = loadConfig();
  }
  return _config;
}

/** Reset the config singleton (for testing or hot-reload). */
export function resetConfig(): void {
  _config = null;
}
