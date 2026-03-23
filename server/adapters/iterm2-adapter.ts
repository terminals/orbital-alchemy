import { execFileSync } from 'child_process';
import type { TerminalAdapter, LaunchOptions, CategorizedLaunchOptions } from './terminal-adapter.js';
import {
  launchInTerminal,
  launchInCategorizedTerminal,
} from '../utils/terminal-launcher.js';

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

/** Check if iTerm2 is available on this system */
export function isITerm2Available(): boolean {
  if (process.platform !== 'darwin') return false;

  try {
    execFileSync('osascript', [
      '-e', 'tell application "System Events" to (name of processes) contains "iTerm2"',
    ], { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
    return true;
  } catch {
    return false;
  }
}
