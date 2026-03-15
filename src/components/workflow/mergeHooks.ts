import type {
  WorkflowHook,
  CcHookParsed,
  UnifiedHook,
  CcTrigger,
} from '../../../shared/workflow-config';

/** Normalize script paths for comparison: strip "$CLAUDE_PROJECT_DIR"/ and leading ./ */
function normalizePath(p: string): string {
  return p
    .replace(/^"?\$CLAUDE_PROJECT_DIR"?\/?/, '')
    .replace(/^\.\//, '');
}

/** Convert filename to a human-readable label: "init-session.sh" → "Init Session" */
function labelFromFilename(filename: string): string {
  return filename
    .replace(/\.[^.]+$/, '')
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/**
 * Merge workflow hooks and CC hooks into a unified list.
 * Hooks sharing the same script path are combined with source='both'.
 */
export function mergeHooks(
  workflowHooks: WorkflowHook[],
  ccHooks: CcHookParsed[],
): UnifiedHook[] {
  const byPath = new Map<string, UnifiedHook>();

  // 1. Index workflow hooks by normalized target path
  for (const wh of workflowHooks) {
    const key = normalizePath(wh.target);
    byPath.set(key, {
      id: wh.id,
      label: wh.label,
      scriptPath: key,
      source: 'workflow',
      workflow: {
        timing: wh.timing,
        type: wh.type,
        category: wh.category,
        blocking: wh.blocking ?? false,
        description: wh.description,
      },
    });
  }

  // 2. Merge CC hooks — match by normalized path
  for (const cc of ccHooks) {
    const key = normalizePath(cc.scriptPath);
    const trigger: CcTrigger = {
      event: cc.event,
      matcher: cc.matcher,
      statusMessage: cc.statusMessage,
    };

    const existing = byPath.get(key);
    if (existing) {
      existing.source = 'both';
      if (!existing.ccTriggers) existing.ccTriggers = [];
      existing.ccTriggers.push(trigger);
    } else {
      // Check if we already created a CC-only entry for this script
      const ccKey = key;
      const prev = byPath.get(ccKey);
      if (prev) {
        prev.ccTriggers!.push(trigger);
      } else {
        byPath.set(ccKey, {
          id: cc.id,
          label: labelFromFilename(cc.scriptName),
          scriptPath: key,
          source: 'claude-code',
          ccTriggers: [trigger],
        });
      }
    }
  }

  return Array.from(byPath.values());
}
