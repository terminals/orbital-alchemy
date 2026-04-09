/**
 * Legacy migration — creates an orbital-manifest.json for projects
 * that were initialized before the manifest system existed.
 *
 * Classifies existing files as synced/modified/user-owned by comparing
 * their content hashes against the current template set.
 */

import fs from 'fs';
import path from 'path';
import {
  loadManifest,
  saveManifest,
  createManifest,
  hashFile,
  buildTemplateInventory,
  templateFileRecord,
  userFileRecord,
  isSelfHosting,
  getSymlinkTarget,
} from './manifest.js';
import type { OrbitalManifest } from './manifest-types.js';
import type { OrbitalSyncManifest } from './services/sync-types.js';

// ─── Constants ──────────────────────────────────────────────

/** Directories that contain managed primitives */
const MANAGED_DIRS = ['hooks', 'skills', 'agents'];

/** Gitignore entries that Orbital adds */
const GITIGNORE_ENTRIES = [
  'scopes/',
  '.claude/orbital/',
  '.claude/orbital-events/',
  '.claude/config/workflow-manifest.sh',
];

// ─── Migration ──────────────────────────────────────────────

export interface LegacyMigrationResult {
  migrated: boolean;
  synced: number;
  modified: number;
  userOwned: number;
  importedPins: number;
}

/**
 * Detect whether a project needs legacy migration.
 * Returns true if it has an orbital config but no manifest.
 */
export function needsLegacyMigration(projectRoot: string): boolean {
  const claudeDir = path.join(projectRoot, '.claude');
  const hasConfig = fs.existsSync(path.join(claudeDir, 'orbital.config.json'));
  const hasManifest = loadManifest(projectRoot) !== null;
  return hasConfig && !hasManifest;
}

/**
 * Create a manifest for an existing project that was initialized
 * before the manifest system. Classifies every file in .claude/
 * managed directories.
 */
export function migrateFromLegacy(
  projectRoot: string,
  templatesDir: string,
  packageVersion: string,
): LegacyMigrationResult {
  const claudeDir = path.join(projectRoot, '.claude');

  // If manifest already exists, skip
  if (loadManifest(projectRoot) !== null) {
    return { migrated: false, synced: 0, modified: 0, userOwned: 0, importedPins: 0 };
  }

  // Read existing config to get preset info
  const preset = readPresetFromConfig(claudeDir);

  // Read existing templateVersion from config, fall back to packageVersion
  const configVersion = readTemplateVersion(claudeDir) || packageVersion;

  const manifest = createManifest(configVersion, preset);
  const selfHosting = isSelfHosting(projectRoot);

  // Build template inventory (what files the current package ships)
  const templateInventory = buildTemplateInventory(templatesDir);

  let synced = 0;
  let modified = 0;
  let userOwned = 0;

  // Walk managed directories and classify each file
  for (const dir of MANAGED_DIRS) {
    const dirPath = path.join(claudeDir, dir);
    if (!fs.existsSync(dirPath)) continue;

    walkDir(dirPath, dir, (relPath, absPath) => {
      const templateHash = templateInventory.get(relPath);

      if (templateHash) {
        // File matches a known template path
        if (selfHosting) {
          const symlinkTarget = getSymlinkTarget(claudeDir, relPath);
          if (symlinkTarget) {
            manifest.files[relPath] = {
              ...templateFileRecord(templateHash, symlinkTarget),
            };
            synced++;
            return;
          }
        }

        const fileHash = hashFile(absPath);
        if (fileHash === templateHash) {
          manifest.files[relPath] = templateFileRecord(templateHash);
          synced++;
        } else {
          manifest.files[relPath] = {
            origin: 'template',
            status: 'modified',
            templateHash,
            installedHash: fileHash,
          };
          modified++;
        }
      } else {
        // File doesn't match any template — user-created
        const fileHash = hashFile(absPath);
        manifest.files[relPath] = userFileRecord(fileHash);
        userOwned++;
      }
    });
  }

  // Also classify non-managed template files (quick/, anti-patterns/, config/, etc.)
  classifyNonManagedFiles(claudeDir, templateInventory, manifest, selfHosting);

  // Import from orbital-sync.json if it exists (override → pinned)
  const importedPins = importFromSyncManifest(claudeDir, manifest);

  // Record gitignore entries
  manifest.gitignoreEntries = [...GITIGNORE_ENTRIES];

  // Record settings hooks checksum
  const settingsHooksPath = path.join(templatesDir, 'settings-hooks.json');
  if (fs.existsSync(settingsHooksPath)) {
    manifest.settingsHooksChecksum = hashFile(settingsHooksPath);
  }

  saveManifest(projectRoot, manifest);

  return { migrated: true, synced, modified, userOwned, importedPins };
}

// ─── Internal Helpers ───────────────────────────────────────

/** Recursively walk a directory, calling fn with relative and absolute paths. */
function walkDir(
  dirPath: string,
  prefix: string,
  fn: (relPath: string, absPath: string) => void,
): void {
  if (!fs.existsSync(dirPath)) return;

  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const absPath = path.join(dirPath, entry.name);
    const relPath = `${prefix}/${entry.name}`;

    // Follow symlinks: use stat() to check if target is a directory
    const stat = fs.statSync(absPath);
    if (stat.isDirectory()) {
      walkDir(absPath, relPath, fn);
    } else {
      fn(relPath, absPath);
    }
  }
}

/** Classify template files outside hooks/skills/agents (quick/, anti-patterns/, config/, etc.) */
function classifyNonManagedFiles(
  claudeDir: string,
  templateInventory: Map<string, string>,
  manifest: OrbitalManifest,
  selfHosting: boolean,
): void {
  const nonManagedDirs = ['quick', 'anti-patterns', 'config'];

  for (const dir of nonManagedDirs) {
    const dirPath = path.join(claudeDir, dir);
    if (!fs.existsSync(dirPath)) continue;

    walkDir(dirPath, dir, (relPath, absPath) => {
      const templateHash = templateInventory.get(relPath);
      if (!templateHash) return; // Not a template file, skip

      if (selfHosting) {
        const symlinkTarget = getSymlinkTarget(claudeDir, relPath);
        if (symlinkTarget) {
          manifest.files[relPath] = templateFileRecord(templateHash, symlinkTarget);
          return;
        }
      }

      const fileHash = hashFile(absPath);
      if (fileHash === templateHash) {
        manifest.files[relPath] = templateFileRecord(templateHash);
      } else {
        manifest.files[relPath] = {
          origin: 'template',
          status: 'modified',
          templateHash,
          installedHash: fileHash,
        };
      }
    });
  }

  // Top-level template files
  const topLevel = ['lessons-learned.md'];
  for (const file of topLevel) {
    const filePath = path.join(claudeDir, file);
    const templateHash = templateInventory.get(file);
    if (!templateHash || !fs.existsSync(filePath)) continue;

    const fileHash = hashFile(filePath);
    if (fileHash === templateHash) {
      manifest.files[file] = templateFileRecord(templateHash);
    } else {
      manifest.files[file] = {
        origin: 'template',
        status: 'modified',
        templateHash,
        installedHash: fileHash,
      };
    }
  }
}

/** Import pin information from the legacy orbital-sync.json manifest. */
function importFromSyncManifest(
  claudeDir: string,
  manifest: OrbitalManifest,
): number {
  const syncManifestPath = path.join(claudeDir, 'orbital-sync.json');
  if (!fs.existsSync(syncManifestPath)) return 0;

  let imported = 0;
  try {
    const raw = fs.readFileSync(syncManifestPath, 'utf-8');
    const syncManifest = JSON.parse(raw) as OrbitalSyncManifest;

    for (const [relPath, record] of Object.entries(syncManifest.files)) {
      if (record.mode === 'override' && manifest.files[relPath]) {
        manifest.files[relPath].status = 'pinned';
        manifest.files[relPath].pinnedAt = record.overriddenAt || new Date().toISOString();
        manifest.files[relPath].pinnedReason = record.reason || 'Imported from orbital-sync.json override';
        imported++;
      }
    }
  } catch {
    // Malformed sync manifest — skip import
  }

  return imported;
}

/** Read the preset name from orbital.config.json, defaulting to "default". */
function readPresetFromConfig(claudeDir: string): string {
  try {
    const workflowPath = path.join(claudeDir, 'config', 'workflow.json');
    if (fs.existsSync(workflowPath)) {
      const workflow = JSON.parse(fs.readFileSync(workflowPath, 'utf-8'));
      if (workflow.name) return workflow.name.toLowerCase().replace(/\s+/g, '-');
    }
  } catch { /* fall through */ }
  return 'default';
}

/** Read the templateVersion from orbital.config.json. */
function readTemplateVersion(claudeDir: string): string | null {
  try {
    const configPath = path.join(claudeDir, 'orbital.config.json');
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      return config.templateVersion || null;
    }
  } catch { /* fall through */ }
  return null;
}
