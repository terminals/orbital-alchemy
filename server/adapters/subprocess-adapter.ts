import { spawn } from 'child_process';
import type { TerminalAdapter, LaunchOptions, CategorizedLaunchOptions } from './terminal-adapter.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('terminal');

/**
 * Cross-platform terminal adapter using child_process.spawn.
 * Runs Claude sessions as background subprocesses — works on any OS.
 * Does not provide windowed/tabbed grouping (use iTerm2 adapter for that).
 */
export class SubprocessAdapter implements TerminalAdapter {
  async launch(command: string, _opts?: LaunchOptions): Promise<void> {
    const child = spawn('sh', ['-c', command], {
      detached: true,
      stdio: 'ignore',
    });
    child.on('error', (err: Error) => log.error('Subprocess launch failed', { error: err.message }));
    child.unref();
  }

  async launchCategorized(_command: string, fullCmd: string, _opts?: CategorizedLaunchOptions): Promise<void> {
    await this.launch(fullCmd);
  }
}
