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
  gray: useColor ? '\x1b[90m' : '',
  cyan: useColor ? '\x1b[36m' : '',
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

  const color = LEVEL_COLOR[level];
  const label = LEVEL_LABEL[level];
  const kv = formatData(data);
  const line = `${c.dim}${timestamp()}${c.reset} ${color}${label}${c.reset} ${c.dim}[${component}]${c.reset} ${msg}${kv}\n`;

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
