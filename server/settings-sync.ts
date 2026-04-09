/**
 * Bidirectional settings hook sync.
 *
 * Replaces the old additive-only mergeSettingsHooks(). The key improvement:
 * when a hook is removed from the template between versions, it's also
 * removed from settings.local.json — preventing stale registrations
 * pointing to deleted scripts.
 */

import fs from 'fs';
import path from 'path';
import { hashFile } from './manifest.js';
import { createLogger } from './utils/logger.js';
import type { SettingsHooks } from './manifest-types.js';

const log = createLogger('sync');

// ─── Types ──────────────────────────────────────────────────

interface SettingsFile {
  hooks?: SettingsHooks;
  [key: string]: unknown;
}

export interface SettingsSyncResult {
  added: number;
  removed: number;
  updated: number;
  skipped: boolean;
}

// ─── Public API ─────────────────────────────────────────────

/**
 * Sync settings.local.json hooks with the current settings-hooks.json template.
 *
 * - Adds new _orbital hooks from the template
 * - Removes _orbital hooks that are no longer in the template
 * - Updates _orbital hooks that have changed (e.g., renamed command paths)
 * - Never touches user hooks (those without _orbital: true)
 *
 * @param settingsPath - Path to .claude/settings.local.json
 * @param templatePath - Path to templates/settings-hooks.json
 * @param previousChecksum - Hash of the template last time sync was run (from manifest)
 * @param renameMap - Optional map of old command paths to new ones
 * @returns Sync result with counts of changes made
 */
export function syncSettingsHooks(
  settingsPath: string,
  templatePath: string,
  previousChecksum: string,
  renameMap?: Map<string, string>,
): SettingsSyncResult {
  if (!fs.existsSync(templatePath)) {
    return { added: 0, removed: 0, updated: 0, skipped: true };
  }

  // Check if template has changed since last sync
  const currentChecksum = hashFile(templatePath);
  if (currentChecksum === previousChecksum) {
    return { added: 0, removed: 0, updated: 0, skipped: true };
  }

  // Load current settings
  let settings: SettingsFile = {};
  if (fs.existsSync(settingsPath)) {
    try {
      settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    } catch {
      log.warn('Malformed settings file, starting fresh', { path: settingsPath });
      settings = {};
    }
  }

  // Load template
  const template: SettingsFile = JSON.parse(fs.readFileSync(templatePath, 'utf-8'));
  const templateHooks = template.hooks || {};

  // Collect all _orbital commands currently in settings
  const currentOrbitalCommands = collectOrbitalCommands(settings.hooks || {});

  // Collect all commands from the template
  const templateCommands = collectAllCommands(templateHooks);

  // Build rename map for command paths (from file rename map)
  const commandRenameMap = buildCommandRenameMap(renameMap);

  let added = 0;
  let removed = 0;
  let updated = 0;

  // Phase 1: Handle renames in existing _orbital hooks
  if (settings.hooks && commandRenameMap.size > 0) {
    updated += applyCommandRenames(settings.hooks, commandRenameMap);
  }

  // Phase 2: Remove _orbital hooks that are no longer in the template
  if (settings.hooks) {
    removed += removeStaleHooks(settings.hooks, templateCommands);
  }

  // Phase 3: Add new hooks from the template
  if (!settings.hooks) settings.hooks = {};
  added += addNewHooks(settings.hooks, templateHooks, currentOrbitalCommands);

  // Phase 4: Clean up empty groups and events
  cleanupEmptyEntries(settings.hooks);
  if (Object.keys(settings.hooks).length === 0) {
    delete settings.hooks;
  }

  // Write back
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n', 'utf-8');

  return { added, removed, updated, skipped: false };
}

/**
 * Remove all _orbital hooks from settings.local.json.
 * Used during uninstall.
 */
export function removeAllOrbitalHooks(settingsPath: string): number {
  if (!fs.existsSync(settingsPath)) return 0;

  let settings: SettingsFile;
  try {
    settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
  } catch {
    log.debug('Settings unreadable during cleanup', { path: settingsPath });
    return 0;
  }

  if (!settings.hooks) return 0;

  let removed = 0;

  for (const groups of Object.values(settings.hooks)) {
    for (const group of groups) {
      if (!group.hooks) continue;
      const before = group.hooks.length;
      group.hooks = group.hooks.filter(h => !h._orbital);
      removed += before - group.hooks.length;
    }
  }

  cleanupEmptyEntries(settings.hooks);
  if (Object.keys(settings.hooks).length === 0) {
    delete settings.hooks;
  }

  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n', 'utf-8');
  return removed;
}

/**
 * Get the current checksum of the settings-hooks.json template.
 */
export function getTemplateChecksum(templatePath: string): string {
  if (!fs.existsSync(templatePath)) return '';
  return hashFile(templatePath);
}

/**
 * Validate that every _orbital hook in settings.local.json points to a file
 * that exists on disk. Returns list of broken command paths.
 */
export function validateHookPaths(
  settingsPath: string,
  projectRoot: string,
): string[] {
  if (!fs.existsSync(settingsPath)) return [];

  let settings: SettingsFile;
  try {
    settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
  } catch {
    return [];
  }

  if (!settings.hooks) return [];

  const broken: string[] = [];

  for (const groups of Object.values(settings.hooks)) {
    for (const group of groups) {
      for (const hook of group.hooks || []) {
        if (!hook._orbital) continue;

        // Resolve command path — handle $CLAUDE_PROJECT_DIR variable
        const commandPath = hook.command
          .replace(/^"?\$CLAUDE_PROJECT_DIR"?\//, '')
          .replace(/^"/, '')
          .replace(/"$/, '');

        const absPath = path.join(projectRoot, commandPath);
        if (!fs.existsSync(absPath)) {
          broken.push(hook.command);
        }
      }
    }
  }

  return broken;
}

// ─── Internal Helpers ───────────────────────────────────────

/** Collect all command strings from _orbital hooks in settings. */
function collectOrbitalCommands(hooks: SettingsHooks): Set<string> {
  const commands = new Set<string>();
  for (const groups of Object.values(hooks)) {
    for (const group of groups) {
      for (const hook of group.hooks || []) {
        if (hook._orbital) commands.add(hook.command);
      }
    }
  }
  return commands;
}

/** Collect all command strings from a hooks template. */
function collectAllCommands(hooks: SettingsHooks): Set<string> {
  const commands = new Set<string>();
  for (const groups of Object.values(hooks)) {
    for (const group of groups) {
      for (const hook of group.hooks || []) {
        if (hook.command) commands.add(hook.command);
      }
    }
  }
  return commands;
}

/** Build a command-level rename map from a file-level rename map. */
function buildCommandRenameMap(
  fileRenameMap?: Map<string, string>,
): Map<string, string> {
  const commandMap = new Map<string, string>();
  if (!fileRenameMap) return commandMap;

  for (const [oldFile, newFile] of fileRenameMap) {
    // Hook commands use paths like: "$CLAUDE_PROJECT_DIR"/.claude/hooks/foo.sh
    // We need to detect when oldFile appears in a command and replace with newFile
    if (oldFile.startsWith('hooks/') || oldFile.startsWith('skills/')) {
      const oldSuffix = `.claude/${oldFile}`;
      const newSuffix = `.claude/${newFile}`;
      commandMap.set(oldSuffix, newSuffix);
    }
  }

  return commandMap;
}

/** Apply command path renames to existing _orbital hooks. Returns count of updates. */
function applyCommandRenames(
  hooks: SettingsHooks,
  commandRenameMap: Map<string, string>,
): number {
  let updated = 0;

  for (const groups of Object.values(hooks)) {
    for (const group of groups) {
      for (const hook of group.hooks || []) {
        if (!hook._orbital) continue;

        for (const [oldSuffix, newSuffix] of commandRenameMap) {
          if (hook.command.includes(oldSuffix)) {
            hook.command = hook.command.replace(oldSuffix, newSuffix);
            updated++;
            break;
          }
        }
      }
    }
  }

  return updated;
}

/** Remove _orbital hooks whose commands are not in the template. Returns count removed. */
function removeStaleHooks(
  hooks: SettingsHooks,
  templateCommands: Set<string>,
): number {
  let removed = 0;

  for (const groups of Object.values(hooks)) {
    for (const group of groups) {
      if (!group.hooks) continue;

      const before = group.hooks.length;
      group.hooks = group.hooks.filter(hook => {
        if (!hook._orbital) return true; // Keep user hooks
        return templateCommands.has(hook.command); // Keep if still in template
      });
      removed += before - group.hooks.length;
    }
  }

  return removed;
}

/** Add hooks from template that aren't already in settings. Returns count added. */
function addNewHooks(
  settingsHooks: SettingsHooks,
  templateHooks: SettingsHooks,
  existingOrbitalCommands: Set<string>,
): number {
  let added = 0;

  for (const [event, templateGroups] of Object.entries(templateHooks)) {
    if (!settingsHooks[event]) {
      settingsHooks[event] = [];
    }

    for (const templateGroup of templateGroups) {
      const matcher = templateGroup.matcher || '__none__';

      // Find matching group in settings
      let targetGroup = settingsHooks[event].find(
        g => (g.matcher || '__none__') === matcher,
      );

      if (!targetGroup) {
        // Create the group with all hooks tagged
        targetGroup = {
          ...(templateGroup.matcher ? { matcher: templateGroup.matcher } : {}),
          hooks: [],
        };
        settingsHooks[event].push(targetGroup);
      }

      if (!targetGroup.hooks) targetGroup.hooks = [];

      for (const hook of templateGroup.hooks || []) {
        if (existingOrbitalCommands.has(hook.command)) continue;

        // Also check if command already exists (de-dup)
        const alreadyPresent = targetGroup.hooks.some(h => h.command === hook.command);
        if (alreadyPresent) continue;

        targetGroup.hooks.push({ ...hook, _orbital: true });
        added++;
      }
    }
  }

  return added;
}

/** Remove empty hook groups and empty event entries. */
function cleanupEmptyEntries(hooks: SettingsHooks): void {
  for (const [event, groups] of Object.entries(hooks)) {
    hooks[event] = groups.filter(g => g.hooks && g.hooks.length > 0);
    if (hooks[event].length === 0) {
      delete hooks[event];
    }
  }
}
