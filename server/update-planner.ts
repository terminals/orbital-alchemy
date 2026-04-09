/**
 * Update planner — computes a structured diff between the current manifest
 * and the new template set. Produces an UpdatePlan that can be executed
 * or printed as a dry-run.
 */

import fs from 'fs';
import path from 'path';
import { buildTemplateInventory } from './manifest.js';
import type { OrbitalManifest, UpdatePlan, RenameEntry, SkipEntry } from './manifest-types.js';

// ─── Version Comparison ─────────────────────────────────────

/** Parse a semver string into [major, minor, patch]. Returns null if invalid. */
function parseSemver(version: string): [number, number, number] | null {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])];
}

/** Compare two semver strings. Returns -1, 0, or 1. */
function compareSemver(a: string, b: string): number {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  if (!pa || !pb) return 0;
  for (let i = 0; i < 3; i++) {
    if (pa[i] < pb[i]) return -1;
    if (pa[i] > pb[i]) return 1;
  }
  return 0;
}

// ─── Rename Map ─────────────────────────────────────────────

interface RenameMap {
  [versionRange: string]: Record<string, string>;
}

/**
 * Load and chain rename maps between two versions.
 * Returns Map<oldPath, newPath> with all renames chained.
 */
export function loadRenameMap(
  templatesDir: string,
  fromVersion: string,
  toVersion: string,
): Map<string, string> {
  const renamesPath = path.join(templatesDir, 'migrations', 'renames.json');
  if (!fs.existsSync(renamesPath)) return new Map();

  let rawMap: RenameMap;
  try {
    rawMap = JSON.parse(fs.readFileSync(renamesPath, 'utf-8'));
  } catch {
    return new Map();
  }

  // Collect all applicable rename entries, ordered by target version
  const applicable: Array<{ to: string; renames: Record<string, string> }> = [];

  for (const [range, renames] of Object.entries(rawMap)) {
    const parts = range.split('->');
    if (parts.length !== 2) continue;
    const [from, to] = parts.map(s => s.trim());

    if (!parseSemver(from) || !parseSemver(to)) continue;
    // Include if: from > fromVersion (hasn't been applied) AND to <= toVersion
    if (compareSemver(from, fromVersion) <= 0 || compareSemver(to, toVersion) > 0) continue;
    applicable.push({ to, renames });
  }

  // Sort by target version ascending
  applicable.sort((a, b) => compareSemver(a.to, b.to));

  // Chain renames: if A→B in v1 and B→C in v2, result is A→C
  const chained = new Map<string, string>();

  for (const { renames } of applicable) {
    for (const [oldPath, newPath] of Object.entries(renames)) {
      // Check if oldPath is itself a rename target from a previous version
      let originalPath = oldPath;
      for (const [prevOld, prevNew] of chained) {
        if (prevNew === oldPath) {
          originalPath = prevOld;
          chained.delete(prevOld);
          break;
        }
      }
      chained.set(originalPath, newPath);
    }
  }

  return chained;
}

// ─── Plan Computation ───────────────────────────────────────

export interface PlanOptions {
  templatesDir: string;
  claudeDir: string;
  manifest: OrbitalManifest;
  newVersion: string;
  /** Pre-loaded rename map (or computed from templatesDir) */
  renameMap?: Map<string, string>;
}

/**
 * Compute the update plan by diffing manifest against current templates.
 * Does NOT modify any files — pure computation.
 */
export function computeUpdatePlan(options: PlanOptions): UpdatePlan {
  const { templatesDir, claudeDir, manifest, newVersion } = options;

  const renameMap = options.renameMap ??
    loadRenameMap(templatesDir, manifest.packageVersion, newVersion);

  const templateInventory = buildTemplateInventory(templatesDir);

  const toAdd: string[] = [];
  const toUpdate: string[] = [];
  const toRemove: string[] = [];
  const toRename: RenameEntry[] = [];
  const toSkip: SkipEntry[] = [];

  // Build reverse rename map: newPath → oldPath
  const reverseRenames = new Map<string, string>();
  for (const [oldPath, newPath] of renameMap) {
    reverseRenames.set(newPath, oldPath);
  }

  // 1. Check each template file against the manifest
  for (const [templatePath, templateHash] of templateInventory) {
    // Is this file the target of a rename?
    const oldPath = reverseRenames.get(templatePath);
    if (oldPath && manifest.files[oldPath]) {
      toRename.push({ from: oldPath, to: templatePath });
      continue;
    }

    const record = manifest.files[templatePath];

    if (!record) {
      // New file — not in manifest at all
      toAdd.push(templatePath);
      continue;
    }

    if (record.origin === 'user') {
      // A user file occupies a path that now conflicts with a template.
      // Skip it and warn. This is an unusual edge case.
      toSkip.push({ file: templatePath, reason: 'modified', newTemplateHash: templateHash });
      continue;
    }

    if (record.status === 'pinned') {
      // Update the template hash in manifest but don't touch the file
      toSkip.push({ file: templatePath, reason: 'pinned', newTemplateHash: templateHash });
      continue;
    }

    if (record.status === 'modified') {
      // User modified a template file — skip it
      toSkip.push({ file: templatePath, reason: 'modified', newTemplateHash: templateHash });
      continue;
    }

    if (record.status === 'outdated') {
      // File content doesn't match template but user hasn't edited it — safe to update
      toUpdate.push(templatePath);
      continue;
    }

    // synced file — update only if template changed since last sync
    if (record.templateHash !== templateHash) {
      toUpdate.push(templatePath);
    }
    // else: already up to date
  }

  // 2. Check for files in manifest that are no longer in templates
  for (const [filePath, record] of Object.entries(manifest.files)) {
    if (record.origin !== 'template') continue;

    // Skip if it's in the template inventory (already handled above)
    if (templateInventory.has(filePath)) continue;

    // Skip if it's the old side of a rename (will be handled in rename step)
    if (renameMap.has(filePath)) continue;

    toRemove.push(filePath);
  }

  // 3. Compute settings hook changes
  const settingsChanges = computeSettingsChanges(claudeDir, templatesDir);

  // 4. Check for pending config migrations (placeholder — computed by config-migrator)
  const pendingMigrations: string[] = [];

  const isEmpty = toAdd.length === 0 &&
    toUpdate.length === 0 &&
    toRemove.length === 0 &&
    toRename.length === 0 &&
    settingsChanges.hooksToAdd.length === 0 &&
    settingsChanges.hooksToRemove.length === 0 &&
    pendingMigrations.length === 0;

  return {
    toAdd,
    toUpdate,
    toRemove,
    toRename,
    toSkip,
    settingsChanges,
    pendingMigrations,
    isEmpty,
  };
}

// ─── Settings Changes ───────────────────────────────────────

/** Compute which _orbital hooks need to be added or removed from settings.local.json. */
function computeSettingsChanges(
  claudeDir: string,
  templatesDir: string,
): { hooksToAdd: string[]; hooksToRemove: string[] } {
  const settingsPath = path.join(claudeDir, 'settings.local.json');
  const templatePath = path.join(templatesDir, 'settings-hooks.json');

  if (!fs.existsSync(templatePath)) {
    return { hooksToAdd: [], hooksToRemove: [] };
  }

  // Extract all hook commands from the template
  const newCommands = extractHookCommands(templatePath);

  // Extract all _orbital hook commands from current settings
  const currentCommands = new Set<string>();
  if (fs.existsSync(settingsPath)) {
    try {
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      if (settings.hooks) {
        for (const groups of Object.values(settings.hooks) as Array<Array<{ hooks?: Array<{ command: string; _orbital?: boolean }> }>>) {
          for (const group of groups) {
            for (const hook of group.hooks || []) {
              if (hook._orbital) currentCommands.add(hook.command);
            }
          }
        }
      }
    } catch { /* malformed settings */ }
  }

  const hooksToAdd = [...newCommands].filter(c => !currentCommands.has(c));
  const hooksToRemove = [...currentCommands].filter(c => !newCommands.has(c));

  return { hooksToAdd, hooksToRemove };
}

/** Extract all hook command strings from a settings-hooks.json template. */
function extractHookCommands(templatePath: string): Set<string> {
  const commands = new Set<string>();
  try {
    const template = JSON.parse(fs.readFileSync(templatePath, 'utf-8'));
    if (template.hooks) {
      for (const groups of Object.values(template.hooks) as Array<Array<{ hooks?: Array<{ command: string }> }>>) {
        for (const group of groups) {
          for (const hook of group.hooks || []) {
            if (hook.command) commands.add(hook.command);
          }
        }
      }
    }
  } catch { /* malformed template */ }
  return commands;
}

// ─── Plan Formatting ────────────────────────────────────────

/** Format an update plan as a human-readable string for dry-run output. */
export function formatPlan(
  plan: UpdatePlan,
  oldVersion: string,
  newVersion: string,
): string {
  const lines: string[] = [];

  lines.push(`Orbital Command — update plan (dry run)\n`);
  lines.push(`Package version: ${oldVersion} → ${newVersion}\n`);

  if (plan.isEmpty) {
    lines.push('  Everything up to date. No changes needed.\n');
    return lines.join('\n');
  }

  for (const file of plan.toAdd) {
    lines.push(`  ADD     ${file}`);
  }
  for (const file of plan.toUpdate) {
    lines.push(`  UPDATE  ${file}`);
  }
  for (const { from, to } of plan.toRename) {
    lines.push(`  RENAME  ${from} → ${to}`);
  }
  for (const file of plan.toRemove) {
    lines.push(`  REMOVE  ${file}`);
  }
  for (const { file, reason } of plan.toSkip) {
    lines.push(`  SKIP    ${file} (${reason})`);
  }

  if (plan.settingsChanges.hooksToAdd.length > 0 || plan.settingsChanges.hooksToRemove.length > 0) {
    lines.push('');
    lines.push(`  SETTINGS  hooks to add: ${plan.settingsChanges.hooksToAdd.length}, to remove: ${plan.settingsChanges.hooksToRemove.length}`);
  }

  if (plan.pendingMigrations.length > 0) {
    lines.push(`  CONFIG    migrations: ${plan.pendingMigrations.length}`);
  }

  lines.push('');
  lines.push('  REGEN   INDEX.md, workflow-manifest.sh');
  lines.push('');
  lines.push('No changes made. Run without --dry-run to apply.');

  return lines.join('\n');
}

/**
 * Get the list of files that need to be backed up before executing a plan.
 * These are files that will be overwritten or deleted.
 */
export function getFilesToBackup(plan: UpdatePlan): string[] {
  const files: string[] = [];

  for (const file of plan.toUpdate) {
    files.push(file);
  }
  for (const file of plan.toRemove) {
    files.push(file);
  }
  for (const { from } of plan.toRename) {
    files.push(from);
  }

  return files;
}
