// ─── Lightweight Structured Logger ──────────────────────────
//
// Zero dependencies. Colored, timestamped, component-namespaced output.
// Usage:
//   import { createLogger } from './utils/logger.js';
//   const log = createLogger('scope');
//   log.info('Status updated', { id: 3, from: 'backlog', to: 'implementing' });
//   // => 12:34:56.789 INFO  [scope] Status updated id=3 from=backlog to=implementing

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_VALUE: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

let currentLevel: LogLevel = 'info';

export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
}

export function getLogLevel(): LogLevel {
  return currentLevel;
}

// ─── Colors (ANSI) ──────────────────────────────────────────

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;

const c = {
  reset: useColor ? '\x1b[0m' : '',
  dim: useColor ? '\x1b[2m' : '',
  green: useColor ? '\x1b[32m' : '',
  blue: useColor ? '\x1b[34m' : '',
  magenta: useColor ? '\x1b[35m' : '',
  cyan: useColor ? '\x1b[36m' : '',
  white: useColor ? '\x1b[37m' : '',
  gray: useColor ? '\x1b[90m' : '',
  brightMagenta: useColor ? '\x1b[95m' : '',
  brightCyan: useColor ? '\x1b[96m' : '',
  yellow: useColor ? '\x1b[33m' : '',
  red: useColor ? '\x1b[31m' : '',
};

const LEVEL_COLOR: Record<LogLevel, string> = {
  debug: c.gray,
  info: c.cyan,
  warn: c.yellow,
  error: c.red,
};

const LEVEL_LABEL: Record<LogLevel, string> = {
  debug: 'DEBUG',
  info: 'INFO ',
  warn: 'WARN ',
  error: 'ERROR',
};

// ─── Component Colors ───────────────────────────────────────

const COMPONENT_COLOR: Record<string, string> = {
  // Scope (green)
  'scope': c.green, 'scope-watcher': c.green,
  // Dispatch (magenta)
  'dispatch': c.magenta, 'dispatch-utils': c.magenta, 'batch': c.magenta,
  // Git (blue)
  'git': c.blue, 'worktree': c.blue,
  // Workflow (cyan)
  'workflow': c.cyan, 'sprint': c.cyan,
  // Sync / Config (yellow)
  'sync': c.yellow, 'config': c.yellow, 'manifest': c.yellow, 'global-config': c.yellow,
  // Events (white)
  'event': c.white, 'event-watcher': c.white, 'global-watcher': c.white,
  // Infrastructure (white)
  'server': c.white, 'central': c.white, 'database': c.white,
  'project-context': c.white, 'project-manager': c.white, 'launch': c.white,
  // Terminal (bright magenta)
  'terminal': c.brightMagenta,
  // Services (bright cyan)
  'gate': c.brightCyan, 'deploy': c.brightCyan, 'telemetry': c.brightCyan, 'version': c.brightCyan,
};

function componentColor(name: string): string {
  return COMPONENT_COLOR[name] ?? c.dim;
}

// ─── Formatting ─────────────────────────────────────────────

function timestamp(): string {
  const d = new Date();
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  const ms = String(d.getMilliseconds()).padStart(3, '0');
  return `${h}:${m}:${s}.${ms}`;
}

function formatData(data?: Record<string, unknown>): string {
  if (!data) return '';
  const pairs: string[] = [];
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined || v === null) continue;
    const val = typeof v === 'object' ? JSON.stringify(v) : String(v);
    pairs.push(`${k}=${val}`);
  }
  return pairs.length > 0 ? ' ' + pairs.join(' ') : '';
}

// ─── Logger Factory ─────────────────────────────────────────

export interface Logger {
  debug(msg: string, data?: Record<string, unknown>): void;
  info(msg: string, data?: Record<string, unknown>): void;
  warn(msg: string, data?: Record<string, unknown>): void;
  error(msg: string, data?: Record<string, unknown>): void;
}

function write(level: LogLevel, component: string, msg: string, data?: Record<string, unknown>): void {
  if (LEVEL_VALUE[level] < LEVEL_VALUE[currentLevel]) return;

  const lvl = LEVEL_COLOR[level];
  const label = LEVEL_LABEL[level];
  const kv = formatData(data);
  const cc = componentColor(component);
  // Message uses level color for warn/error (urgency), component color otherwise
  const mc = (level === 'warn' || level === 'error') ? lvl : cc;
  const line = `${c.dim}${timestamp()}${c.reset} ${lvl}${label}${c.reset} ${cc}[${component}]${c.reset} ${mc}${msg}${c.reset}${c.dim}${kv}${c.reset}\n`;

  if (level === 'warn' || level === 'error') {
    process.stderr.write(line);
  } else {
    process.stdout.write(line);
  }
}

export function createLogger(component: string): Logger {
  return {
    debug: (msg, data) => write('debug', component, msg, data),
    info: (msg, data) => write('info', component, msg, data),
    warn: (msg, data) => write('warn', component, msg, data),
    error: (msg, data) => write('error', component, msg, data),
  };
}
