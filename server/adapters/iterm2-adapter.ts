import { execFileSync, execFile as execFileCb } from 'child_process';
import { promisify } from 'util';
import { existsSync } from 'fs';
import path from 'path';
import os from 'os';
import type { TerminalAdapter, LaunchOptions, CategorizedLaunchOptions } from './terminal-adapter.js';
import {
  launchInTerminal,
  launchInCategorizedTerminal,
} from '../utils/terminal-launcher.js';

const execFileAsync = promisify(execFileCb);

/**
 * iTerm2 terminal adapter for macOS.
 * Uses AppleScript to create windows, tabs, and dynamic profiles.
 * Provides categorized window grouping (tabs grouped by workflow stage).
 */
export class ITerm2Adapter implements TerminalAdapter {
  async launch(command: string, _opts?: LaunchOptions): Promise<void> {
    await launchInTerminal(command);
  }

  async launchCategorized(command: string, fullCmd: string, opts?: CategorizedLaunchOptions): Promise<void> {
    await launchInCategorizedTerminal(command, fullCmd, opts?.tabName);
  }

  // ensureProfiles is handled directly via ensureDynamicProfiles(engine) in server startup
}

/** Check if iTerm2.app exists on disk (installed, may not be running). */
export function isITerm2Installed(): boolean {
  if (process.platform !== 'darwin') return false;
  return existsSync('/Applications/iTerm.app') ||
    existsSync(path.join(os.homedir(), 'Applications', 'iTerm.app'));
}

/** Check if iTerm2 process is currently running. */
export function isITerm2Running(): boolean {
  if (process.platform !== 'darwin') return false;
  try {
    const result = execFileSync('osascript', [
      '-e', 'tell application "System Events" to (name of processes) contains "iTerm2"',
    ], { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
    return result.trim() === 'true';
  } catch {
    return false;
  }
}

export interface ITerm2Status {
  installed: boolean;
  running: boolean;
  status: 'running' | 'installed' | 'not-installed';
}

/** Get combined iTerm2 status: installed + running -> status string. */
export function getITerm2Status(): ITerm2Status {
  const installed = isITerm2Installed();
  const running = installed && isITerm2Running();
  return {
    installed,
    running,
    status: running ? 'running' : installed ? 'installed' : 'not-installed',
  };
}

/** Launch iTerm2 via macOS `open -a`. Resolves when the open command completes (not when iTerm2 is ready). */
export async function launchITerm2(): Promise<void> {
  await execFileAsync('open', ['-a', 'iTerm']);
}

/** Poll until iTerm2 process appears, or timeout. Returns true if running. */
export async function waitForITerm2Ready(maxWaitMs = 10_000): Promise<boolean> {
  const interval = 500;
  const iterations = Math.ceil(maxWaitMs / interval);
  for (let i = 0; i < iterations; i++) {
    await new Promise(r => setTimeout(r, interval));
    if (isITerm2Running()) return true;
  }
  return false;
}

/** Check if iTerm2 is available on this system (backward compat — delegates to isITerm2Running). */
export function isITerm2Available(): boolean {
  return isITerm2Running();
}
