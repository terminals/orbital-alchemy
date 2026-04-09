import { promisify } from 'util';
import { createHash } from 'crypto';
import { execFile as execFileCb } from 'child_process';
import fsSync from 'fs';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { getConfig } from '../config.js';
import { createLogger } from './logger.js';
import { WorkflowEngine } from '../../shared/workflow-engine.js';

const log = createLogger('terminal');

const execFileAsync = promisify(execFileCb);

// ─── iTerm2 Dynamic Profiles ────────────────────────────────

const DYNAMIC_PROFILES_DIR = path.join(
  os.homedir(), 'Library', 'Application Support', 'iTerm2', 'DynamicProfiles',
);
interface ItermColor {
  'Red Component': number;
  'Green Component': number;
  'Blue Component': number;
  'Alpha Component': number;
  'Color Space': string;
}

interface DynamicProfile {
  Name: string;
  Guid: string;
  'Dynamic Profile Parent Name': string;
  'Custom Window Title': string;
  'Use Custom Window Title': boolean;
  'Allow Title Setting': boolean;
  'Title Components': number;
  'Badge Text': string;
  'Tab Color'?: ItermColor;
  'Use Tab Color'?: boolean;
  [key: string]: unknown; // allow extra color properties from parent profile
}

/** Convert a hex color (#rrggbb) to iTerm2's color dictionary format. */
function hexToItermColor(hex: string): ItermColor {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return { 'Red Component': r, 'Green Component': g, 'Blue Component': b, 'Alpha Component': 1, 'Color Space': 'sRGB' };
}

/** Derive a stable, hex-only UUID from a prefix + category string. */
function deriveGuid(prefix: string, category: string): string {
  const hash = createHash('md5').update(`${prefix}-${category}`).digest('hex');
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    '4' + hash.slice(13, 16),
    '8' + hash.slice(17, 20),
    hash.slice(20, 32),
  ].join('-').toUpperCase();
}

/** Maps each window category to candidate workflow column IDs (first match wins). */
const CATEGORY_COLUMN_CANDIDATES: Array<{ category: WindowCategory; columnIds: string[] }> = [
  { category: 'Scoping',      columnIds: ['planning', 'backlog'] },
  { category: 'Planning',     columnIds: ['backlog', 'planning'] },
  { category: 'Implementing', columnIds: ['implementing', 'in-progress'] },
  { category: 'Reviewing',    columnIds: ['review'] },
  { category: 'Deploying',    columnIds: ['production', 'main', 'dev', 'completed', 'done'] },
];

const FALLBACK_HEX = '#6B7280';  // neutral gray if no column match

function profilesFilename(prefix: string): string {
  return `${prefix.toLowerCase()}-dispatch-profiles.json`;
}

function buildProfiles(
  colorMap: Map<WindowCategory, string>,
  profilePrefix?: string,
  parentColors?: Record<string, unknown>,
): { Profiles: DynamicProfile[] } {
  const prefix = profilePrefix ?? getConfig().terminal.profilePrefix;
  const useSeparateColors = parentColors?.['Use Separate Colors for Light and Dark Mode'] === true;
  return {
    Profiles: CATEGORY_COLUMN_CANDIDATES.map(({ category }) => {
      const stageColor = hexToItermColor(colorMap.get(category) ?? FALLBACK_HEX);
      const badgeColor = { ...stageColor, 'Alpha Component': 0.5 };
      return {
        ...(parentColors ?? {}),  // inherited colors first — our overrides win
        Name: `${prefix}-${category}`,
        Guid: deriveGuid(prefix, category),
        'Dynamic Profile Parent Name': 'Default',
        'Custom Window Title': category,
        'Use Custom Window Title': true,
        'Allow Title Setting': false,
        'Title Components': 1,  // 1 = Session Name (not Job Name)
        'Badge Text': category,
        'Tab Color': stageColor,
        'Use Tab Color': true,
        'Badge Color': badgeColor,
        ...(useSeparateColors ? { 'Badge Color (Dark)': badgeColor, 'Badge Color (Light)': badgeColor } : {}),
      };
    }),
  };
}

/** Resolve tab colors from the active workflow's column hex values. */
function resolveColorMap(engine: WorkflowEngine): Map<WindowCategory, string> {
  const colors = new Map<WindowCategory, string>();
  for (const { category, columnIds } of CATEGORY_COLUMN_CANDIDATES) {
    for (const colId of columnIds) {
      const list = engine.getList(colId);
      if (list) {
        colors.set(category, list.hex);
        break;
      }
    }
  }
  return colors;
}

const ITERM2_PLIST = path.join(os.homedir(), 'Library', 'Preferences', 'com.googlecode.iterm2.plist');

/** Read all color properties from the user's iTerm2 parent profile.
 *  Uses `plutil -extract` to pull the first bookmark as JSON, then filters
 *  for color dicts (entries with "Red Component") and the separate-colors flag.
 *  Returns an empty object on non-macOS or if iTerm2 prefs can't be read. */
async function readParentProfileColors(): Promise<Record<string, unknown>> {
  try {
    const { stdout } = await execFileAsync(
      'plutil', ['-extract', 'New Bookmarks.0', 'json', '-o', '-', ITERM2_PLIST],
      { timeout: 5000 },
    );
    const profile = JSON.parse(stdout) as Record<string, unknown>;
    const colors: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(profile)) {
      if (value && typeof value === 'object' && 'Red Component' in (value as Record<string, unknown>)) {
        colors[key] = value;
      }
      if (key === 'Use Separate Colors for Light and Dark Mode') {
        colors[key] = value;
      }
    }
    return colors;
  } catch {
    return {};
  }
}

/** Write iTerm2 Dynamic Profiles for each workflow category.
 *  Derives tab colors from the active workflow's column definitions.
 *  Reads the parent profile's colors to work around iTerm2's incomplete
 *  inheritance of (Dark)/(Light) color variants.
 *  Idempotent — safe to call on every server startup. */
const profilesWritten = new Set<string>();
export async function ensureDynamicProfiles(engine: WorkflowEngine, profilePrefix?: string): Promise<void> {
  const prefix = profilePrefix ?? getConfig().terminal.profilePrefix;
  if (profilesWritten.has(prefix)) return;
  profilesWritten.add(prefix);
  try {
    await fs.mkdir(DYNAMIC_PROFILES_DIR, { recursive: true });
    const filePath = path.join(DYNAMIC_PROFILES_DIR, profilesFilename(prefix));
    const colorMap = resolveColorMap(engine);
    const parentColors = await readParentProfileColors();
    // Write tmp file outside DynamicProfiles/ — iTerm2 watches that dir and reads ALL files.
    // Use pid + timestamp to avoid races when multiple projects call concurrently.
    const tmpPath = path.join(os.tmpdir(), `${profilesFilename(prefix)}.${process.pid}.${Date.now()}.tmp`);
    await fs.writeFile(tmpPath, JSON.stringify(buildProfiles(colorMap, prefix, parentColors), null, 2));
    await fs.copyFile(tmpPath, filePath);
    await fs.unlink(tmpPath).catch(() => {});
    log.info('iTerm2 profiles ready', { categories: CATEGORY_COLUMN_CANDIDATES.length });
  } catch (err) {
    log.warn('iTerm2 profiles failed', { error: (err as Error).message });
  }
}

/** Maps a WindowCategory to its iTerm2 profile name. */
function profileNameForCategory(category: string, profilePrefix?: string): string {
  return `${profilePrefix ?? getConfig().terminal.profilePrefix}-${category}`;
}

// ─── Window Categorization ──────────────────────────────────

export type WindowCategory = 'Scoping' | 'Planning' | 'Implementing' | 'Reviewing' | 'Deploying';

/** Ordered array — maps command prefixes to window categories */
const COMMAND_WINDOW_MAP: Array<[string, WindowCategory]> = [
  ['/scope-post-review', 'Reviewing'],
  ['/scope-pre-review', 'Planning'],
  ['/scope-verify', 'Reviewing'],
  ['/scope-create', 'Planning'],
  ['/scope-implement', 'Implementing'],
  ['/git-commit', 'Deploying'],
  ['/git-staging', 'Deploying'],
  ['/git-production', 'Deploying'],
  ['/git-main', 'Deploying'],
];

export function commandToWindowCategory(command: string): WindowCategory | null {
  for (const [prefix, category] of COMMAND_WINDOW_MAP) {
    if (command.startsWith(prefix)) return category;
  }
  return null;
}

/** In-memory registry: category → iTerm2 window ID (stable integer). Resets on server restart. */
const windowRegistry = new Map<WindowCategory, number>();

/** Escape a value for use inside single quotes in shell commands.
 *  Replaces ' with '\'' (end quote, escaped quote, reopen quote). */
export function shellQuote(s: string): string {
  return s.replace(/'/g, "'\\''");
}

/**
 * Escape a string for use inside $'...' ANSI-C quoting.
 * Handles backslash, single-quote, and newline characters.
 */
export function escapeForAnsiC(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
    .replace(/\0/g, '\\0')
    .replace(/\x07/g, '\\a')
    .replace(/\x08/g, '\\b')
    .replace(/\x0C/g, '\\f')
    .replace(/\x1B/g, '\\e')
    .replace(/\x0B/g, '\\v');
}

/**
 * Launch a command in a new iTerm2 window.
 *
 * Opens a window with the user's default profile (which sources their shell
 * profile, so PATH includes `claude`), then sends the command via `write text`.
 * This is more reliable than `command "..."` which replaces the shell process
 * and can't interpret builtins like `cd` or operators like `&&`.
 */
export async function launchInTerminal(command: string): Promise<void> {
  const escaped = command.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  await execFileAsync('osascript', [
    '-e', 'tell application "iTerm2"',
    '-e', '  create window with default profile',
    '-e', '  delay 0.5',
    '-e', '  tell current session of current window',
    '-e', `    write text "${escaped}"`,
    '-e', '  end tell',
    '-e', 'end tell',
  ]);
}

/**
 * Create a new iTerm2 window, run a command, and return the window ID.
 * The window ID is a stable integer that persists for the window's lifetime.
 * Tab name is set via AppleScript session `name` (immune to app title changes).
 * Window title is locked via Dynamic Profile (`Allow Title Setting: false`).
 */
async function createWindowWithCommand(command: string, category: WindowCategory, tabName?: string): Promise<number> {
  const escaped = command.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const tabLabel = (tabName ?? category).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const profile = profileNameForCategory(category);

  try {
    const { stdout } = await execFileAsync('osascript', [
      '-e', 'tell application "iTerm2"',
      '-e', `  create window with profile "${profile}"`,
      '-e', '  delay 0.5',
      '-e', '  set newWindow to current window',
      '-e', '  tell current session of newWindow',
      '-e', `    set name to "${tabLabel}"`,
      '-e', `    write text "${escaped}"`,
      '-e', '  end tell',
      '-e', '  return id of newWindow',
      '-e', 'end tell',
    ]);
    const id = parseInt(stdout.trim(), 10);
    if (isNaN(id)) throw new Error('Failed to parse iTerm2 window ID');
    return id;
  } catch (e) {
    if (e instanceof Error && e.message === 'Failed to parse iTerm2 window ID') throw e;
    // Profile missing — fall back to default profile
    const { stdout } = await execFileAsync('osascript', [
      '-e', 'tell application "iTerm2"',
      '-e', '  create window with default profile',
      '-e', '  delay 0.5',
      '-e', '  set newWindow to current window',
      '-e', '  tell current session of newWindow',
      '-e', `    set name to "${tabLabel}"`,
      '-e', `    write text "${escaped}"`,
      '-e', '  end tell',
      '-e', '  return id of newWindow',
      '-e', 'end tell',
    ]);
    const id = parseInt(stdout.trim(), 10);
    if (isNaN(id)) throw new Error('Failed to parse iTerm2 window ID');
    return id;
  }
}

/**
 * Create a new tab in an existing iTerm2 window (identified by ID) and run a command.
 * Returns false if the window no longer exists (user closed it).
 */
async function createTabInWindow(windowId: number, command: string, category: WindowCategory, tabName?: string): Promise<boolean> {
  const escaped = command.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const profile = profileNameForCategory(category);
  const nameLines = tabName
    ? ['-e', `      set name to "${tabName.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`]
    : [];
  try {
    await execFileAsync('osascript', [
      '-e', 'tell application "iTerm2"',
      '-e', `  set targetWindow to window id ${windowId}`,
      '-e', '  tell targetWindow',
      '-e', `    set newTab to (create tab with profile "${profile}")`,
      '-e', '    tell current session of newTab',
      ...nameLines,
      '-e', `      write text "${escaped}"`,
      '-e', '    end tell',
      '-e', '  end tell',
      '-e', 'end tell',
    ]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Route a dispatch to a categorized iTerm2 window.
 * Groups commands by workflow stage (Scoping, Planning, Implementing, Reviewing, Deploying)
 * so multiple dispatches of the same type open as tabs in one window.
 *
 * Falls back to launchInTerminal() for unmapped commands.
 */
export async function launchInCategorizedTerminal(command: string, fullCmd: string, tabName?: string | null): Promise<void> {
  const category = commandToWindowCategory(command);

  if (!category) {
    await launchInTerminal(fullCmd);
    return;
  }

  // Try reusing an existing window for this category
  const existingId = windowRegistry.get(category);
  if (existingId !== undefined) {
    const added = await createTabInWindow(existingId, fullCmd, category, tabName ?? undefined);
    if (added) return;
    // Window was closed — clear stale entry and fall through to create new
    windowRegistry.delete(category);
  }

  // Create a new categorized window
  const newId = await createWindowWithCommand(fullCmd, category, tabName ?? undefined);
  windowRegistry.set(category, newId);
}

// ─── Session Naming ──────────────────────────────────────────

const COMMAND_STEP_MAP: Record<string, string> = {
  '/scope-implement': 'Implementation',
  '/scope-post-review': 'Post-Review',
  '/scope-pre-review': 'Pre-Review',
  '/scope-verify': 'Verify',
  '/scope-create': 'Creation',
  '/git-commit': 'Commit',
  '/git-dev': 'Merge-Dev',
  '/git-staging': 'PR-Staging',
  '/git-production': 'PR-Production',
  '/git-main': 'Push-Main',
};

/** Title-Case slug: "Hook & Event Foundation" → "Hook-Event-Foundation" */
function slugifySessionName(title: string, maxLen = 40): string {
  return title
    .replace(/[^a-zA-Z0-9\s]/g, '')  // strip non-alphanumeric
    .trim()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join('-')
    .slice(0, maxLen);
}

/** Maps command prefix to step label */
function commandToStep(command: string): string {
  for (const [prefix, step] of Object.entries(COMMAND_STEP_MAP)) {
    if (command.startsWith(prefix)) return step;
  }
  return 'Session';
}

/** Builds "079-Hook-Event-Foundation-Implementation" from parts */
export function buildSessionName(parts: { scopeId?: number; title?: string; command: string }): string | null {
  const step = commandToStep(parts.command);
  if (parts.scopeId == null) {
    // No scope context — return step-only name for known commands, null for unknown
    return step !== 'Session' ? step : null;
  }

  const paddedId = String(parts.scopeId).padStart(3, '0');
  if (!parts.title) return `${paddedId}-${step}`;

  const slug = slugifySessionName(parts.title);
  return `${paddedId}-${slug}-${step}`;
}

interface SessionsIndex {
  version: number;
  entries: Array<{ sessionId: string; fileMtime: number; summary: string; [k: string]: unknown }>;
  originalPath: string;
}

/**
 * Derive the sessions-index.json path for a project.
 * Claude Code encodes the project path by replacing `/` with `-`.
 * The leading `/` naturally becomes the leading `-` in the directory name.
 */
function getSessionsIndexPath(projectRoot: string): string {
  const encoded = projectRoot.replace(/\//g, '-');
  return path.join(os.homedir(), '.claude', 'projects', encoded, 'sessions-index.json');
}

/** Rename a session in sessions-index.json by UUID.
 *  Updates existing entry or adds a new one if not found. */
export async function renameSession(
  projectRoot: string,
  sessionId: string,
  name: string,
): Promise<void> {
  const indexPath = getSessionsIndexPath(projectRoot);
  try {
    const raw = await fs.readFile(indexPath, 'utf-8');
    const index: SessionsIndex = JSON.parse(raw);

    const existing = index.entries.find((e) => e.sessionId === sessionId);
    if (existing) {
      existing.summary = name;
    } else {
      // Entry not in index — add it so the name shows up in the Claude UI
      index.entries.push({ sessionId, fileMtime: Date.now(), summary: name });
    }

    const tmpPath = indexPath + '.tmp';
    await fs.writeFile(tmpPath, JSON.stringify(index, null, 2));
    await fs.rename(tmpPath, indexPath);
  } catch {
    // Index file not readable — skip silently
  }
}

// ─── PID-based Session Discovery ─────────────────────────────

/** Directory where init-session.sh stores PID→UUID mapping files */
function getSessionPidDir(projectRoot: string): string {
  return path.join(projectRoot, '.claude', 'metrics', '.session-ids');
}

/** Snapshot current PID files before launching a new session */
export function snapshotSessionPids(projectRoot: string): Set<string> {
  const dir = getSessionPidDir(projectRoot);
  try {
    return new Set(fsSync.readdirSync(dir).map((f) => f.split('-')[0]));
  } catch {
    return new Set();
  }
}

export interface DiscoveredSession {
  pid: number;
  sessionId: string;
}

/** Poll for a new PID file that wasn't in the pre-launch snapshot.
 *  Returns the PID and session UUID, or null if no new session appeared. */
export async function discoverNewSession(
  projectRoot: string,
  beforePidSet: Set<string>,
): Promise<DiscoveredSession | null> {
  const dir = getSessionPidDir(projectRoot);
  const pollInterval = 500;
  const maxWait = 15_000;
  const deadline = Date.now() + maxWait;

  while (Date.now() < deadline) {
    try {
      const current = fsSync.readdirSync(dir);
      for (const entry of current) {
        const pidStr = entry.split('-')[0];
        if (/^\d+$/.test(pidStr) && !beforePidSet.has(pidStr)) {
          const pid = parseInt(pidStr, 10);
          // Verify the PID is alive (not a stale leftover)
          try {
            process.kill(pid, 0);
            const sessionId = fsSync.readFileSync(path.join(dir, entry), 'utf-8').trim();
            return { pid, sessionId };
          } catch {
            // Dead PID or unreadable file, skip
          }
        }
      }
    } catch {
      // Directory not readable — retry
    }
    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }
  return null;
}

/** Check if a session PID is still running.
 *  process.kill(pid, 0) sends no signal but checks existence. */
export function isSessionPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
