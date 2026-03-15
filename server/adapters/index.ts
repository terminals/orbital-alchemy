import type { TerminalAdapter } from './terminal-adapter.js';
import { getConfig } from '../config.js';

export type { TerminalAdapter, LaunchOptions, CategorizedLaunchOptions, WindowCategory } from './terminal-adapter.js';

let _adapter: TerminalAdapter | null = null;

/**
 * Get the terminal adapter singleton.
 * Auto-detects based on config and platform:
 *   - "iterm2" → iTerm2 adapter (macOS only)
 *   - "subprocess" → cross-platform subprocess fallback
 *   - "none" → no-op adapter (for headless/CI)
 *   - "auto" → iTerm2 if available, else subprocess
 */
export function getTerminalAdapter(): TerminalAdapter {
  if (_adapter) return _adapter;

  const preference = getConfig().terminal.adapter;

  if (preference === 'none') {
    _adapter = { launch: async () => {}, launchCategorized: async () => {} };
    return _adapter;
  }

  if (preference === 'iterm2' || preference === 'auto') {
    try {
      // Dynamic import to avoid loading AppleScript dependencies on non-macOS
      const { ITerm2Adapter, isITerm2Available } = require('./iterm2-adapter.js');
      if (preference === 'iterm2' || isITerm2Available()) {
        _adapter = new ITerm2Adapter();
        return _adapter;
      }
    } catch {
      // iTerm2 adapter not available — fall through
    }
  }

  // Fallback to subprocess
  const { SubprocessAdapter } = require('./subprocess-adapter.js');
  _adapter = new SubprocessAdapter();
  return _adapter;
}
