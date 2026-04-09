import path from 'path';
import fs from 'fs';
import { GLOBAL_PRIMITIVES_DIR, GLOBAL_WORKFLOW_PATH, getRegisteredProjects } from '../global-config.js';
import { createLogger } from '../utils/logger.js';
import { hashFile, hashTree } from '../manifest.js';
import type {
  OrbitalSyncManifest,
  SyncFileRecord,
  SyncState,
  FileSyncStatus,
  SyncStateReport,
  GlobalSyncReport,
  PropagationResult,
} from './sync-types.js';

const log = createLogger('sync');

const SYNC_MANIFEST_FILENAME = 'orbital-sync.json';

// ─── Manifest I/O ───────────────────────────────────────────

function manifestPath(projectRoot: string): string {
  return path.join(projectRoot, '.claude', SYNC_MANIFEST_FILENAME);
}

/** Load a project's sync manifest, or return null if none exists. */
function loadManifest(projectRoot: string): OrbitalSyncManifest | null {
  const mp = manifestPath(projectRoot);
  if (!fs.existsSync(mp)) return null;
  try {
    return JSON.parse(fs.readFileSync(mp, 'utf-8')) as OrbitalSyncManifest;
  } catch {
    log.warn('Failed to parse sync manifest', { path: mp });
    return null;
  }
}

/** Save a project's sync manifest atomically. */
function saveManifest(projectRoot: string, manifest: OrbitalSyncManifest): void {
  const mp = manifestPath(projectRoot);
  const dir = path.dirname(mp);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmp = mp + '.tmp';
  try {
    fs.writeFileSync(tmp, JSON.stringify(manifest, null, 2), 'utf-8');
    fs.renameSync(tmp, mp);
  } catch (err) {
    try { fs.unlinkSync(tmp); } catch { /* best-effort cleanup */ }
    throw err;
  }
}

/** Create a default manifest for a project by comparing its files against global. */
function createInitialManifest(projectRoot: string): OrbitalSyncManifest {
  const claudeDir = path.join(projectRoot, '.claude');
  const globalHashes = hashTree(GLOBAL_PRIMITIVES_DIR);
  const now = new Date().toISOString();

  const files: Record<string, SyncFileRecord> = {};

  for (const [relPath, globalHash] of globalHashes) {
    const localPath = path.join(claudeDir, relPath);
    if (fs.existsSync(localPath)) {
      const localHash = hashFile(localPath);
      files[relPath] = {
        mode: localHash === globalHash ? 'synced' : 'override',
        globalHash,
        localHash,
        syncedAt: now,
        ...(localHash !== globalHash ? { overriddenAt: now, reason: 'Existing file at registration time' } : {}),
      };
    } else {
      // Global file not present locally — copy it
      const localDir = path.dirname(localPath);
      if (!fs.existsSync(localDir)) fs.mkdirSync(localDir, { recursive: true });
      fs.copyFileSync(path.join(GLOBAL_PRIMITIVES_DIR, relPath), localPath);
      files[relPath] = {
        mode: 'synced',
        globalHash,
        localHash: globalHash,
        syncedAt: now,
      };
    }
  }

  // Workflow
  let workflow: SyncFileRecord;
  const workflowPath = path.join(projectRoot, '.claude', 'config', 'workflow.json');
  if (fs.existsSync(GLOBAL_WORKFLOW_PATH) && fs.existsSync(workflowPath)) {
    const globalHash = hashFile(GLOBAL_WORKFLOW_PATH);
    const localHash = hashFile(workflowPath);
    workflow = {
      mode: localHash === globalHash ? 'synced' : 'override',
      globalHash,
      localHash,
      syncedAt: now,
      ...(localHash !== globalHash ? { overriddenAt: now, reason: 'Existing workflow at registration time' } : {}),
    };
  } else {
    workflow = { mode: 'synced', globalHash: '', localHash: '', syncedAt: now };
  }

  return { version: 1, files, workflow, newFilesPolicy: 'auto-sync' };
}

// ─── Atomic File Copy ───────────────────────────────────────

/** Copy a file atomically (write to temp, then rename). */
function atomicCopy(src: string, dest: string): void {
  const dir = path.dirname(dest);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmp = dest + '.sync-tmp';
  try {
    fs.copyFileSync(src, tmp);
    fs.renameSync(tmp, dest);
  } catch (err) {
    try { fs.unlinkSync(tmp); } catch { /* best-effort cleanup */ }
    throw err;
  }
}

// ─── SyncService ────────────────────────────────────────────

export class SyncService {
  constructor() {}

  // ─── Sync State Computation ──────────────────────────────

  /** Compute the actual sync state of every tracked file in a project. */
  computeSyncState(projectId: string, projectRoot: string): SyncStateReport {
    let manifest = loadManifest(projectRoot);
    if (!manifest) {
      manifest = createInitialManifest(projectRoot);
      saveManifest(projectRoot, manifest);
    }

    const claudeDir = path.join(projectRoot, '.claude');
    const files: FileSyncStatus[] = [];

    for (const [relPath, record] of Object.entries(manifest.files)) {
      const localPath = path.join(claudeDir, relPath);
      const globalPath = path.join(GLOBAL_PRIMITIVES_DIR, relPath);
      const localExists = fs.existsSync(localPath);
      const globalExists = fs.existsSync(globalPath);

      let state: SyncState;
      let localHash: string | null = localExists ? hashFile(localPath) : null;
      let globalHash: string | null = globalExists ? hashFile(globalPath) : null;

      if (record.mode === 'override') {
        state = 'override';
      } else if (!localExists) {
        state = 'absent';
      } else if (localHash !== record.localHash) {
        // Local file changed since last sync — drift
        state = 'drifted';
      } else {
        state = 'synced';
      }

      files.push({
        relativePath: relPath,
        state,
        globalHash,
        localHash,
        overriddenAt: record.overriddenAt,
        reason: record.reason,
      });
    }

    // Check for new global files not in manifest
    if (fs.existsSync(GLOBAL_PRIMITIVES_DIR)) {
      const globalHashes = hashTree(GLOBAL_PRIMITIVES_DIR);
      for (const [relPath] of globalHashes) {
        if (!manifest.files[relPath]) {
          files.push({
            relativePath: relPath,
            state: 'absent',
            globalHash: globalHashes.get(relPath) ?? null,
            localHash: null,
          });
        }
      }
    }

    // Workflow state
    const wfLocalPath = path.join(projectRoot, '.claude', 'config', 'workflow.json');
    let workflowState: SyncState = 'synced';
    if (manifest.workflow.mode === 'override') {
      workflowState = 'override';
    } else if (fs.existsSync(wfLocalPath)) {
      const currentLocalHash = hashFile(wfLocalPath);
      if (currentLocalHash !== manifest.workflow.localHash) {
        workflowState = 'drifted';
      }
    }

    return {
      projectId,
      projectPath: projectRoot,
      files,
      workflow: {
        relativePath: 'workflow.json',
        state: workflowState,
        globalHash: manifest.workflow.globalHash || null,
        localHash: manifest.workflow.localHash || null,
      },
    };
  }

  /** Compute sync state across ALL registered projects. */
  computeGlobalSyncState(): GlobalSyncReport {
    const projects = getRegisteredProjects();
    const allFiles = new Set<string>();
    const projectStates: GlobalSyncReport['projects'] = [];

    for (const reg of projects) {
      if (!reg.enabled || !fs.existsSync(reg.path)) continue;
      const report = this.computeSyncState(reg.id, reg.path);
      const states: Record<string, SyncState> = {};
      for (const f of report.files) {
        allFiles.add(f.relativePath);
        states[f.relativePath] = f.state;
      }
      projectStates.push({ projectId: reg.id, projectName: reg.name, states });
    }

    return { files: [...allFiles].sort(), projects: projectStates };
  }

  // ─── Write Operations ────────────────────────────────────

  /** Propagate a global file change to all synced projects. */
  propagateGlobalChange(relativePath: string): PropagationResult {
    const globalPath = path.join(GLOBAL_PRIMITIVES_DIR, relativePath);
    if (!fs.existsSync(globalPath)) {
      return { updated: [], skipped: [], failed: [] };
    }

    const globalHash = hashFile(globalPath);
    const projects = getRegisteredProjects();
    const result: PropagationResult = { updated: [], skipped: [], failed: [] };

    for (const reg of projects) {
      if (!reg.enabled || !fs.existsSync(reg.path)) continue;

      const manifest = loadManifest(reg.path);
      if (!manifest) continue;

      const record = manifest.files[relativePath];
      if (!record || record.mode === 'override') {
        result.skipped.push(reg.id);
        // Update globalHash even for overrides so drift detection works
        if (record) {
          record.globalHash = globalHash;
          saveManifest(reg.path, manifest);
        }
        continue;
      }

      try {
        const destPath = path.join(reg.path, '.claude', relativePath);
        atomicCopy(globalPath, destPath);
        record.globalHash = globalHash;
        record.localHash = globalHash;
        record.syncedAt = new Date().toISOString();
        saveManifest(reg.path, manifest);
        result.updated.push(reg.id);
        log.info('Propagated global change', { file: relativePath, project: reg.id });
      } catch (err) {
        result.failed.push({ projectId: reg.id, error: String(err) });
      }
    }

    return result;
  }

  /** Create an override for a file in a specific project. */
  createOverride(projectRoot: string, relativePath: string, reason?: string): void {
    const manifest = loadManifest(projectRoot);
    if (!manifest) return;

    const record = manifest.files[relativePath];
    if (!record) return;

    record.mode = 'override';
    record.overriddenAt = new Date().toISOString();
    if (reason) record.reason = reason;

    // Update localHash to current file content
    const localPath = path.join(projectRoot, '.claude', relativePath);
    if (fs.existsSync(localPath)) {
      record.localHash = hashFile(localPath);
    }

    saveManifest(projectRoot, manifest);
    log.info('Created override', { file: relativePath, reason });
  }

  /** Revert an override — replace local file with global version. */
  revertOverride(projectRoot: string, relativePath: string): void {
    const manifest = loadManifest(projectRoot);
    if (!manifest) return;

    const record = manifest.files[relativePath];
    if (!record) return;

    const globalPath = path.join(GLOBAL_PRIMITIVES_DIR, relativePath);
    if (!fs.existsSync(globalPath)) return;

    const destPath = path.join(projectRoot, '.claude', relativePath);
    atomicCopy(globalPath, destPath);

    const globalHash = hashFile(globalPath);
    record.mode = 'synced';
    record.globalHash = globalHash;
    record.localHash = globalHash;
    record.syncedAt = new Date().toISOString();
    delete record.overriddenAt;
    delete record.reason;

    saveManifest(projectRoot, manifest);
    log.info('Reverted override', { file: relativePath });
  }

  /** Promote a project override to become the new global version. */
  promoteOverride(projectRoot: string, relativePath: string): PropagationResult {
    const localPath = path.join(projectRoot, '.claude', relativePath);
    if (!fs.existsSync(localPath)) {
      return { updated: [], skipped: [], failed: [{ projectId: 'self', error: 'Local file not found' }] };
    }

    // Copy local to global
    const globalPath = path.join(GLOBAL_PRIMITIVES_DIR, relativePath);
    atomicCopy(localPath, globalPath);

    // Update this project's manifest to synced
    const manifest = loadManifest(projectRoot);
    if (manifest && manifest.files[relativePath]) {
      const hash = hashFile(globalPath);
      manifest.files[relativePath] = {
        mode: 'synced',
        globalHash: hash,
        localHash: hash,
        syncedAt: new Date().toISOString(),
      };
      saveManifest(projectRoot, manifest);
    }

    // Propagate to all other synced projects
    log.info('Promoted override to global', { file: relativePath });
    return this.propagateGlobalChange(relativePath);
  }

  /** Resolve drift — either pin as override or reset to global. */
  resolveDrift(
    projectRoot: string,
    relativePath: string,
    resolution: 'pin-override' | 'reset-global',
  ): void {
    if (resolution === 'pin-override') {
      this.createOverride(projectRoot, relativePath, 'Pinned from drift resolution');
    } else {
      this.revertOverride(projectRoot, relativePath);
    }
  }

  // ─── New File Handling ───────────────────────────────────

  /** Handle a new file appearing in the global primitives directory. */
  handleNewGlobalFile(relativePath: string): PropagationResult {
    const globalPath = path.join(GLOBAL_PRIMITIVES_DIR, relativePath);
    if (!fs.existsSync(globalPath)) {
      return { updated: [], skipped: [], failed: [] };
    }

    const globalHash = hashFile(globalPath);
    const projects = getRegisteredProjects();
    const result: PropagationResult = { updated: [], skipped: [], failed: [] };

    for (const reg of projects) {
      if (!reg.enabled || !fs.existsSync(reg.path)) continue;

      const manifest = loadManifest(reg.path);
      if (!manifest) continue;

      if (manifest.newFilesPolicy === 'prompt') {
        result.skipped.push(reg.id);
        continue;
      }

      try {
        const destPath = path.join(reg.path, '.claude', relativePath);
        atomicCopy(globalPath, destPath);
        manifest.files[relativePath] = {
          mode: 'synced',
          globalHash,
          localHash: globalHash,
          syncedAt: new Date().toISOString(),
        };
        saveManifest(reg.path, manifest);
        result.updated.push(reg.id);
      } catch (err) {
        result.failed.push({ projectId: reg.id, error: String(err) });
      }
    }

    return result;
  }

  /** Handle a file being deleted from the global primitives directory. */
  handleGlobalFileDeletion(relativePath: string): { removed: string[]; preserved: string[] } {
    const projects = getRegisteredProjects();
    const removed: string[] = [];
    const preserved: string[] = [];

    for (const reg of projects) {
      if (!reg.enabled || !fs.existsSync(reg.path)) continue;

      const manifest = loadManifest(reg.path);
      if (!manifest || !manifest.files[relativePath]) continue;

      const record = manifest.files[relativePath];
      const localPath = path.join(reg.path, '.claude', relativePath);

      if (record.mode === 'synced') {
        // Delete the local copy
        if (fs.existsSync(localPath)) fs.unlinkSync(localPath);
        delete manifest.files[relativePath];
        saveManifest(reg.path, manifest);
        removed.push(reg.id);
      } else {
        // Override — preserve the local file, remove from manifest
        delete manifest.files[relativePath];
        saveManifest(reg.path, manifest);
        preserved.push(reg.id);
      }
    }

    return { removed, preserved };
  }

  // ─── Impact Preview ──────────────────────────────────────

  /** Preview which projects would be affected by a global file change. */
  getImpactPreview(relativePath: string): { willUpdate: string[]; willSkip: Array<{ id: string; reason?: string }> } {
    const projects = getRegisteredProjects();
    const willUpdate: string[] = [];
    const willSkip: Array<{ id: string; reason?: string }> = [];

    for (const reg of projects) {
      if (!reg.enabled || !fs.existsSync(reg.path)) continue;

      const manifest = loadManifest(reg.path);
      if (!manifest) {
        willSkip.push({ id: reg.id, reason: 'No sync manifest' });
        continue;
      }

      const record = manifest.files[relativePath];
      if (!record || record.mode === 'synced') {
        willUpdate.push(reg.id);
      } else {
        willSkip.push({ id: reg.id, reason: record.reason });
      }
    }

    return { willUpdate, willSkip };
  }

  // ─── Manifest Management ─────────────────────────────────

  /** Ensure a project has a sync manifest. Creates one if missing. */
  ensureManifest(projectRoot: string): OrbitalSyncManifest {
    let manifest = loadManifest(projectRoot);
    if (!manifest) {
      manifest = createInitialManifest(projectRoot);
      saveManifest(projectRoot, manifest);
    }
    return manifest;
  }
}
