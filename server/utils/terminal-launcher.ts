import { promisify } from 'util';
import { execFile as execFileCb } from 'child_process';
import fsSync from 'fs';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { getConfig } from '../config.js';

const execFileAsync = promisify(execFileCb);

// ─── iTerm2 Dynamic Profiles ────────────────────────────────

const DYNAMIC_PROFILES_DIR = path.join(
  os.homedir(), 'Library', 'Application Support', 'iTerm2', 'DynamicProfiles',
);
const PROFILES_FILENAME = 'orbital-dispatch-profiles.json';

interface DynamicProfile {
  Name: string;
  Guid: string;
  'Dynamic Profile Parent Name': string;
  'Custom Window Title': string;
  'Use Custom Window Title': boolean;
  'Allow Title Setting': boolean;
  'Title Components': number;
  'Badge Text': string;
}

const CATEGORY_BADGES: Array<{ category: string; badge: string }> = [
  { category: 'Scoping',      badge: 'Scoping' },
  { category: 'Planning',     badge: 'Planning' },
  { category: 'Implementing', badge: 'Implementing' },
  { category: 'Reviewing',    badge: 'Reviewing' },
  { category: 'Deploying',    badge: 'Deploying' },
];

function buildProfiles(): { Profiles: DynamicProfile[] } {
  const prefix = getConfig().terminal.profilePrefix;
  return {
    Profiles: CATEGORY_BADGES.map(({ category, badge }, i) => ({
      Name: `${prefix}-${category}`,
      Guid: `orbital-${category.toLowerCase()}-0000-0000-${String(i + 1).padStart(12, '0')}`,
      'Dynamic Profile Parent Name': 'Default',
      'Custom Window Title': category,
      'Use Custom Window Title': true,
      'Allow Title Setting': false,
      'Title Components': 1,  // 1 = Session Name (not Job Name)
      'Badge Text': badge,
    })),
  };
}

/** Write iTerm2 Dynamic Profiles for each workflow category.
 *  Idempotent — safe to call on every server startup. */
export async function ensureDynamicProfiles(): Promise<void> {
  try {
    await fs.mkdir(DYNAMIC_PROFILES_DIR, { recursive: true });
    const filePath = path.join(DYNAMIC_PROFILES_DIR, PROFILES_FILENAME);
    await fs.writeFile(filePath, JSON.stringify(buildProfiles(), null, 2));
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[Orbital] Failed to write iTerm2 dynamic profiles:', (err as Error).message);
  }
}

/** Maps a WindowCategory to its iTerm2 profile name. */
function profileNameForCategory(category: string): string {
  return `${getConfig().terminal.profilePrefix}-${category}`;
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
    return parseInt(stdout.trim(), 10);
  } catch {
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
    return parseInt(stdout.trim(), 10);
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
