import type { DispatchFlags } from '../../shared/api-types.js';
import { VALID_OUTPUT_FORMATS, validateToolName, validateEnvKey } from '../../shared/api-types.js';
import { shellQuote } from './terminal-launcher.js';

/**
 * Compile a structured DispatchFlags object into a CLI flags string
 * for the `claude` command. All parameterized values are validated
 * and shell-quoted to prevent injection.
 */
export function buildClaudeFlags(flags: DispatchFlags): string {
  const parts: string[] = [];

  // Permission mode — 'default' means no flag (use Claude's built-in default)
  if (flags.permissionMode === 'bypass') {
    parts.push('--dangerously-skip-permissions');
  } else if (flags.permissionMode && flags.permissionMode !== 'default') {
    parts.push('--permission-mode', flags.permissionMode);
  }

  if (flags.verbose) parts.push('--verbose');
  if (flags.noMarkdown) parts.push('--no-markdown');
  if (flags.printMode) parts.push('-p');

  if (flags.outputFormat && VALID_OUTPUT_FORMATS.includes(flags.outputFormat)) {
    parts.push('--output-format', flags.outputFormat);
  }

  if (flags.allowedTools.length > 0) {
    const safe = flags.allowedTools.filter(validateToolName);
    if (safe.length > 0) parts.push('--allowedTools', safe.join(','));
  }
  if (flags.disallowedTools.length > 0) {
    const safe = flags.disallowedTools.filter(validateToolName);
    if (safe.length > 0) parts.push('--disallowedTools', safe.join(','));
  }

  if (flags.appendSystemPrompt) {
    const sanitized = flags.appendSystemPrompt.replace(/\n/g, '\\n');
    parts.push('--append-system-prompt', `'${shellQuote(sanitized)}'`);
  }

  return parts.join(' ');
}

/**
 * Build env var prefix string for dispatch commands.
 * Keys are validated against POSIX naming rules.
 * Returns empty string if no vars configured.
 */
export function buildEnvVarPrefix(envVars: Record<string, string>): string {
  const entries = Object.entries(envVars).filter(([k]) => validateEnvKey(k));
  if (entries.length === 0) return '';
  return entries
    .map(([k, v]) => `${k}='${v.replace(/'/g, "'\\''")}'`)
    .join(' ') + ' ';
}
