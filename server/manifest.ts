/**
 * Manifest I/O and hash utilities for the Orbital Command primitive system.
 *
 * The manifest tracks every file Orbital installs, enabling safe updates,
 * complete uninstalls, and user-file preservation.
 */

import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import type { OrbitalManifest, ManifestFile, FileStatus } from './manifest-types.js';
import { createLogger } from './utils/logger.js';

const log = createLogger('manifest');

// ─── Constants ──────────────────────────────────────────────

export const MANIFEST_FILENAME = 'orbital-manifest.json';
export const BACKUPS_DIR = '.orbital-backups';
const MAX_BACKUPS = 5;

// ─── Hash Utilities ─────────────────────────────────────────

/** Compute SHA-256 hash of file content (first 16 hex chars). Normalizes line endings. */
export function hashFile(filePath: string): string {
  const content = fs.readFileSync(filePath, 'utf-8').replace(/\r\n/g, '\n');
  return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
}

/** Compute SHA-256 hash of a string (first 16 hex chars). */
export function hashString(content: string): string {
  return crypto.createHash('sha256').update(content.replace(/\r\n/g, '\n')).digest('hex').slice(0, 16);
}

/**
 * Compute hashes for all files in a directory tree.
 * Returns Map<relativePath, hash>. Skips dotfiles.
 */
export function hashTree(baseDir: string): Map<string, string> {
  const result = new Map<string, string>();
  if (!fs.existsSync(baseDir)) return result;

  function walk(dir: string, prefix: string): void {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      const full = path.join(dir, entry.name);
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      // Follow symlinks: use stat() to check if target is a directory
      const stat = fs.statSync(full);
      if (stat.isDirectory()) {
        walk(full, rel);
      } else {
        result.set(rel, hashFile(full));
      }
    }
  }

  walk(baseDir, '');
  return result;
}

// ─── Manifest I/O ───────────────────────────────────────────

/** Resolve the manifest path for a project. */
export function manifestPath(projectRoot: string): string {
  return path.join(projectRoot, '.claude', MANIFEST_FILENAME);
}

/** Load a project's manifest, or return null if none exists. */
export function loadManifest(projectRoot: string): OrbitalManifest | null {
  const mp = manifestPath(projectRoot);
  if (!fs.existsSync(mp)) return null;
  try {
    const raw = fs.readFileSync(mp, 'utf-8');
    const parsed = JSON.parse(raw) as OrbitalManifest;
    if (parsed.version !== 2) {
      log.warn('Manifest version mismatch, expected 2', { path: mp, version: parsed.version });
      return null;
    }
    return parsed;
  } catch (err) {
    log.warn('Failed to load manifest (corrupted?)', { path: mp, error: String(err) });
    return null;
  }
}

/** Save a project's manifest atomically (write to tmp, then rename). */
export function saveManifest(projectRoot: string, manifest: OrbitalManifest): void {
  const mp = manifestPath(projectRoot);
  const dir = path.dirname(mp);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmp = mp + `.tmp.${process.pid}`;
  try {
    fs.writeFileSync(tmp, JSON.stringify(manifest, null, 2) + '\n', 'utf-8');
    fs.renameSync(tmp, mp);
  } catch (err) {
    try { fs.unlinkSync(tmp); } catch { /* best-effort cleanup */ }
    throw err;
  }
}

/** Create a fresh empty manifest. */
export function createManifest(packageVersion: string, preset: string): OrbitalManifest {
  const now = new Date().toISOString();
  return {
    version: 2,
    installedAt: now,
    updatedAt: now,
    packageVersion,
    preset,
    files: {},
    settingsHooksChecksum: '',
    appliedMigrations: [],
    generatedArtifacts: ['INDEX.md', 'config/workflow-manifest.sh'],
    gitignoreEntries: [],
  };
}

// ─── File Record Helpers ────────────────────────────────────

/** Create a manifest record for a template-origin file. */
export function templateFileRecord(hash: string, symlinkTarget?: string): ManifestFile {
  return {
    origin: 'template',
    status: 'synced',
    templateHash: hash,
    installedHash: hash,
    ...(symlinkTarget ? { symlinkTarget } : {}),
  };
}

/** Create a manifest record for a user-owned file. */
export function userFileRecord(hash: string): ManifestFile {
  return {
    origin: 'user',
    status: 'user-owned',
    installedHash: hash,
  };
}

/** Compute the current status of a template file by comparing hashes. */
export function computeFileStatus(
  record: ManifestFile,
  currentHash: string,
): FileStatus {
  if (record.status === 'pinned') return 'pinned';
  if (record.origin === 'user') return 'user-owned';

  // Check if file matches the current template
  if (record.templateHash && currentHash === record.templateHash) return 'synced';
  if (!record.templateHash && currentHash === record.installedHash) return 'synced';

  // File doesn't match template. Distinguish:
  // - outdated: user hasn't touched it (matches installedHash), but template moved ahead
  // - modified: user edited the file (doesn't match installedHash)
  if (currentHash === record.installedHash) return 'outdated';
  return 'modified';
}

/** Refresh all file statuses in a manifest by hashing current disk contents. */
export function refreshFileStatuses(
  manifest: OrbitalManifest,
  claudeDir: string,
): void {
  for (const [relPath, record] of Object.entries(manifest.files)) {
    if (record.status === 'pinned') continue; // pinned is user-set, don't auto-change
    if (record.origin === 'user') continue;   // user files don't drift

    const absPath = path.join(claudeDir, relPath);

    // Detect missing files
    if (!fs.existsSync(absPath)) {
      if (record.origin === 'template') record.status = 'missing';
      continue;
    }

    // Symlinked files (self-hosting) are always synced — they point directly at templates
    if (record.symlinkTarget) {
      record.status = 'synced';
      continue;
    }

    const currentHash = hashFile(absPath);
    record.status = computeFileStatus(record, currentHash);
  }
}

// ─── Backup Utilities ───────────────────────────────────────

/** Create a backup of specific files before a destructive update. */
export function createBackup(
  claudeDir: string,
  filesToBackup: string[],
): string | null {
  if (filesToBackup.length === 0) return null;

  const backupsRoot = path.join(claudeDir, BACKUPS_DIR);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.join(backupsRoot, timestamp);

  fs.mkdirSync(backupDir, { recursive: true });

  // Back up the manifest itself
  const currentManifest = path.join(claudeDir, MANIFEST_FILENAME);
  if (fs.existsSync(currentManifest)) {
    fs.copyFileSync(currentManifest, path.join(backupDir, MANIFEST_FILENAME));
  }

  // Back up settings.local.json
  const settingsPath = path.join(claudeDir, 'settings.local.json');
  if (fs.existsSync(settingsPath)) {
    fs.copyFileSync(settingsPath, path.join(backupDir, 'settings.local.json'));
  }

  // Back up each file that will be modified/removed
  for (const relPath of filesToBackup) {
    const srcPath = path.join(claudeDir, relPath);
    if (!fs.existsSync(srcPath)) continue;

    const destPath = path.join(backupDir, relPath);
    const destDir = path.dirname(destPath);
    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
    fs.copyFileSync(srcPath, destPath);
  }

  // Prune old backups (keep MAX_BACKUPS most recent)
  pruneBackups(backupsRoot);

  return backupDir;
}

/** Keep only the N most recent backup directories. */
function pruneBackups(backupsRoot: string): void {
  if (!fs.existsSync(backupsRoot)) return;

  const entries = fs.readdirSync(backupsRoot, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .map(e => e.name)
    .sort()
    .reverse();

  for (const dir of entries.slice(MAX_BACKUPS)) {
    fs.rmSync(path.join(backupsRoot, dir), { recursive: true, force: true });
  }
}

// ─── Symlink-Safe File Operations ───────────────────────────

const SYMLINK_PREV_MARKER = 'SYMLINK:';

/**
 * Back up a file before overwriting. Symlink-aware: preserves the
 * symlink target string so it can be restored later.
 */
export function safeBackupFile(filePath: string): void {
  if (!fs.existsSync(filePath)) return;
  const prevPath = filePath + '.prev';
  try {
    const stat = fs.lstatSync(filePath);
    if (stat.isSymbolicLink()) {
      const target = fs.readlinkSync(filePath);
      fs.writeFileSync(prevPath, SYMLINK_PREV_MARKER + target, 'utf-8');
    } else {
      fs.copyFileSync(filePath, prevPath);
    }
  } catch {
    // Best-effort backup — don't block the operation
  }
}

/**
 * Copy a template to a destination. Symlink-aware: if the destination
 * is already a symlink (self-hosting), skip the copy since the symlink
 * already points at the template source.
 */
export function safeCopyTemplate(templatePath: string, destPath: string): void {
  try {
    const stat = fs.lstatSync(destPath);
    if (stat.isSymbolicLink()) return; // symlink already points at templates
  } catch {
    // File doesn't exist — proceed with copy
  }
  fs.copyFileSync(templatePath, destPath);
}

/**
 * Restore a file from its .prev backup. Handles both regular files
 * and symlink backups (marked with SYMLINK: prefix).
 * Returns true if restored, false if no .prev available.
 */
export function safeRestoreFile(filePath: string): boolean {
  const prevPath = filePath + '.prev';
  if (!fs.existsSync(prevPath)) return false;

  const prevContent = fs.readFileSync(prevPath, 'utf-8');

  if (prevContent.startsWith(SYMLINK_PREV_MARKER)) {
    // Restore symlink
    const target = prevContent.slice(SYMLINK_PREV_MARKER.length);
    // Back up current file as new .prev (swap)
    if (fs.existsSync(filePath)) {
      const currentStat = fs.lstatSync(filePath);
      if (currentStat.isSymbolicLink()) {
        fs.writeFileSync(prevPath, SYMLINK_PREV_MARKER + fs.readlinkSync(filePath), 'utf-8');
      } else {
        fs.copyFileSync(filePath, prevPath);
      }
      fs.unlinkSync(filePath);
    } else {
      fs.unlinkSync(prevPath);
    }
    fs.symlinkSync(target, filePath);
    return true;
  }

  // Regular file swap
  const tmpPath = filePath + '.tmp';
  if (fs.existsSync(filePath)) {
    fs.renameSync(filePath, tmpPath);
  }
  fs.renameSync(prevPath, filePath);
  if (fs.existsSync(tmpPath)) {
    fs.renameSync(tmpPath, prevPath);
  }
  return true;
}

// ─── Template Inventory ─────────────────────────────────────

/**
 * Path remapping from template paths to .claude/ paths.
 * Most files map 1:1, but presets go to config/workflows/.
 */
const PATH_REMAPS: Record<string, string> = {
  'presets/': 'config/workflows/',
};

/** Remap a template-relative path to a .claude/-relative path. */
export function remapTemplatePath(templateRelPath: string): string {
  for (const [prefix, replacement] of Object.entries(PATH_REMAPS)) {
    if (templateRelPath.startsWith(prefix)) {
      return templateRelPath.replace(prefix, replacement);
    }
  }
  return templateRelPath;
}

/** Reverse-remap a .claude/-relative path back to a template-relative path. */
export function reverseRemapPath(claudeRelPath: string): string {
  for (const [prefix, replacement] of Object.entries(PATH_REMAPS)) {
    if (claudeRelPath.startsWith(replacement)) {
      return claudeRelPath.replace(replacement, prefix);
    }
  }
  return claudeRelPath;
}

/**
 * Build a complete inventory of template files with their hashes.
 * Returns Map<claudeRelativePath, hash>.
 *
 * This walks all template subdirectories that contain managed primitives
 * and remaps their paths to where they'd be installed in .claude/.
 */
export function buildTemplateInventory(templatesDir: string): Map<string, string> {
  const inventory = new Map<string, string>();

  // Directories that map directly: templates/X/ → .claude/X/
  const directDirs = ['hooks', 'skills', 'agents', 'quick', 'anti-patterns'];
  for (const dir of directDirs) {
    const dirPath = path.join(templatesDir, dir);
    if (!fs.existsSync(dirPath)) continue;
    for (const [relPath, hash] of hashTree(dirPath)) {
      inventory.set(`${dir}/${relPath}`, hash);
    }
  }

  // Presets: templates/presets/ → .claude/config/workflows/
  const presetsDir = path.join(templatesDir, 'presets');
  if (fs.existsSync(presetsDir)) {
    for (const [relPath, hash] of hashTree(presetsDir)) {
      inventory.set(`config/workflows/${relPath}`, hash);
    }
  }

  // Config files: templates/config/ → .claude/config/
  const configDir = path.join(templatesDir, 'config');
  if (fs.existsSync(configDir)) {
    for (const [relPath, hash] of hashTree(configDir)) {
      inventory.set(`config/${relPath}`, hash);
    }
  }

  // Top-level files
  const topLevelFiles = ['lessons-learned.md'];
  for (const file of topLevelFiles) {
    const filePath = path.join(templatesDir, file);
    if (fs.existsSync(filePath)) {
      inventory.set(file, hashFile(filePath));
    }
  }

  return inventory;
}

// ─── Self-Hosting Detection ─────────────────────────────────

/**
 * Detect if a project is self-hosting (i.e. .claude/ contains symlinks
 * pointing into the project's own templates/ directory).
 */
export function isSelfHosting(projectRoot: string): boolean {
  const claudeDir = path.join(projectRoot, '.claude');
  if (!fs.existsSync(claudeDir)) return false;

  const templatesDir = path.join(projectRoot, 'templates');
  if (!fs.existsSync(templatesDir)) return false;

  try {
    for (const entry of fs.readdirSync(claudeDir, { withFileTypes: true })) {
      if (!entry.isSymbolicLink()) continue;
      const linkTarget = fs.readlinkSync(path.join(claudeDir, entry.name));
      const resolved = path.resolve(claudeDir, linkTarget);
      if (resolved.startsWith(templatesDir + path.sep) || resolved === templatesDir) {
        return true;
      }
    }
  } catch {
    return false;
  }

  return false;
}

/**
 * For self-hosting projects, get the symlink target relative to .claude/
 * for a given template file. Returns null if the file wouldn't be symlinked.
 */
export function getSymlinkTarget(
  claudeDir: string,
  claudeRelPath: string,
): string | null {
  const absPath = path.join(claudeDir, claudeRelPath);
  try {
    const stat = fs.lstatSync(absPath);
    if (stat.isSymbolicLink()) {
      return fs.readlinkSync(absPath);
    }
  } catch {
    // File doesn't exist or isn't accessible
  }
  return null;
}

// ─── Summary Utilities ──────────────────────────────────────

export interface ManifestSummary {
  synced: number;
  outdated: number;
  modified: number;
  pinned: number;
  missing: number;
  userOwned: number;
  total: number;
  byType: Record<string, { synced: number; outdated: number; modified: number; pinned: number; missing: number; userOwned: number }>;
}

/** Compute summary statistics from a manifest. */
export function summarizeManifest(manifest: OrbitalManifest): ManifestSummary {
  const summary: ManifestSummary = {
    synced: 0, outdated: 0, modified: 0, pinned: 0, missing: 0, userOwned: 0, total: 0,
    byType: {},
  };

  for (const [relPath, record] of Object.entries(manifest.files)) {
    summary.total++;

    const type = relPath.split('/')[0]; // hooks, skills, agents, etc.
    if (!summary.byType[type]) {
      summary.byType[type] = { synced: 0, outdated: 0, modified: 0, pinned: 0, missing: 0, userOwned: 0 };
    }

    switch (record.status) {
      case 'synced':     summary.synced++; summary.byType[type].synced++; break;
      case 'outdated':   summary.outdated++; summary.byType[type].outdated++; break;
      case 'modified':   summary.modified++; summary.byType[type].modified++; break;
      case 'pinned':     summary.pinned++; summary.byType[type].pinned++; break;
      case 'missing':    summary.missing++; summary.byType[type].missing++; break;
      case 'user-owned': summary.userOwned++; summary.byType[type].userOwned++; break;
    }
  }

  return summary;
}
