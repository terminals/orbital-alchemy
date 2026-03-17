import path from 'path';
import fs from 'fs';
import { execFileSync } from 'child_process';
import os from 'os';

// ─── Types ──────────────────────────────────────────────────

export interface TerminalConfig {
  adapter: 'auto' | 'iterm2' | 'subprocess' | 'none';
  profilePrefix: string;
}

export interface ClaudeConfig {
  executable: string;
  flags: string[];
}

export interface CommandsConfig {
  typeCheck: string | null;
  lint: string | null;
  build: string | null;
  test: string | null;
  validateTemplates: string | null;
  validateDocs: string | null;
  checkRules: string | null;
}

export type { AgentConfig } from '../shared/api-types.js';
import type { AgentConfig } from '../shared/api-types.js';

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

  // Build/test commands
  commands: CommandsConfig;

  // Dynamic configuration
  categories: string[];
  agents: AgentConfig[];
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
  },
  commands: {
    typeCheck: null,
    lint: null,
    build: null,
    test: null,
    validateTemplates: null,
    validateDocs: null,
    checkRules: null,
  },
  categories: ['feature', 'bugfix', 'refactor', 'infrastructure', 'docs'],
  agents: [
    { id: 'attacker', label: 'Attacker', emoji: '\u{1F5E1}\u{FE0F}', color: '#ff1744' },
    { id: 'chaos', label: 'Chaos', emoji: '\u{1F4A5}', color: '#F97316' },
    { id: 'solana-expert', label: 'Solana Expert', emoji: '\u{26D3}\u{FE0F}', color: '#8B5CF6' },
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

  // Try loading user config
  const configPath = path.join(root, '.claude', 'orbital.config.json');
  let userConfig: Record<string, unknown> = {};

  if (fs.existsSync(configPath)) {
    try {
      userConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    } catch (err) {
      console.warn('[Orbital] Failed to parse orbital.config.json — using defaults:', (err as Error).message);
    }
  }

  // Merge with defaults
  const projectName = (userConfig.projectName as string) ?? DEFAULT_CONFIG.projectName;

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

  const claude: ClaudeConfig = {
    ...DEFAULT_CONFIG.claude,
    ...(userConfig.claude as Partial<ClaudeConfig> ?? {}),
  };

  const commands: CommandsConfig = {
    ...DEFAULT_CONFIG.commands,
    ...(userConfig.commands as Partial<CommandsConfig> ?? {}),
  };

  const categories = (userConfig.categories as string[]) ?? DEFAULT_CONFIG.categories;
  const agents = (userConfig.agents as AgentConfig[]) ?? DEFAULT_CONFIG.agents;

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
    commands,
    categories,
    agents,
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
