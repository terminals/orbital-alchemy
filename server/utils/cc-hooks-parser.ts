import { readFileSync } from 'node:fs';
import type { CcHookEvent, CcHookParsed } from '../../shared/workflow-config.js';

const CC_HOOK_EVENTS: CcHookEvent[] = ['SessionStart', 'SessionEnd', 'PreToolUse', 'PostToolUse'];

interface SettingsHookEntry {
  type: string;
  command: string;
  statusMessage?: string;
}

interface SettingsMatcherGroup {
  matcher?: string;
  hooks: SettingsHookEntry[];
}

interface SettingsJson {
  hooks?: Record<string, SettingsMatcherGroup[]>;
}

function extractScriptPath(command: string): string {
  // Strip "$CLAUDE_PROJECT_DIR"/ prefix and quotes
  return command
    .replace(/^"?\$CLAUDE_PROJECT_DIR"?\/?/, '')
    .replace(/^["']|["']$/g, '');
}

function deriveId(scriptName: string): string {
  // "init-session.sh" → "init-session"
  // Uses the bare filename so it matches workflow hook IDs when they exist.
  return scriptName.replace(/\.[^.]+$/, '');
}

export function parseCcHooks(settingsPath: string): CcHookParsed[] {
  let raw: string;
  try {
    raw = readFileSync(settingsPath, 'utf-8');
  } catch {
    return [];
  }

  const settings: SettingsJson = JSON.parse(raw);
  if (!settings.hooks) return [];

  const results: CcHookParsed[] = [];

  for (const event of CC_HOOK_EVENTS) {
    const groups = settings.hooks[event];
    if (!Array.isArray(groups)) continue;

    for (const group of groups) {
      const matcher = group.matcher ?? null;
      for (const entry of group.hooks) {
        if (entry.type !== 'command') continue;
        const scriptPath = extractScriptPath(entry.command);
        const scriptName = scriptPath.split('/').pop() ?? scriptPath;
        results.push({
          id: deriveId(scriptName),
          scriptPath,
          scriptName,
          event,
          matcher,
          statusMessage: entry.statusMessage ?? '',
        });
      }
    }
  }

  return results;
}
