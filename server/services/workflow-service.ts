import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type { Server } from 'socket.io';
import type { WorkflowConfig } from '../../shared/workflow-config.js';
import { isWorkflowConfig } from '../../shared/workflow-config.js';
import type { WorkflowEngine } from '../../shared/workflow-engine.js';

/** Short content digest of a WorkflowConfig (ignoring internal metadata fields). */
function configDigest(config: WorkflowConfig): string {
  // Strip internal metadata so the digest only reflects user-visible config
  const { _defaultDigest: _, ...rest } = config as WorkflowConfig & { _defaultDigest?: string };
  return crypto.createHash('sha256').update(JSON.stringify(rest)).digest('hex').slice(0, 16);
}

// ─── Types ──────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface PresetInfo {
  name: string;
  createdAt: string;
  listCount: number;
  edgeCount: number;
}

export interface MigrationPlan {
  valid: boolean;
  validationErrors: string[];
  removedLists: string[];
  addedLists: string[];
  dirsToCreate: string[];
  dirsToRemove: string[];
  orphanedScopes: Array<{ listId: string; scopeFiles: string[] }>;
  lostEdges: Array<{ from: string; to: string }>;
  suggestedMappings: Record<string, string>;
  impactSummary: string;
}

// ─── WorkflowService ───────────────────────────────────

export class WorkflowService {
  private presetsDir: string;
  private activeConfigPath: string;
  private scopesDir: string;
  private engine: WorkflowEngine;
  private defaultConfigPath: string;
  private manifestPath: string;
  private io: Server | null = null;

  constructor(configDir: string, engine: WorkflowEngine, scopesDir: string, defaultConfigPath: string) {
    this.presetsDir = path.join(configDir, 'workflows');
    this.activeConfigPath = path.join(configDir, 'workflow.json');
    this.scopesDir = scopesDir;
    this.engine = engine;
    this.defaultConfigPath = defaultConfigPath;
    this.manifestPath = path.join(configDir, 'workflow-manifest.sh');

    // Ensure directories exist
    if (!fs.existsSync(this.presetsDir)) fs.mkdirSync(this.presetsDir, { recursive: true });

    // ─── Sync active config with bundled default ─────────────────
    // The active config is a copy of the bundled default-workflow.json.
    // When the package updates (new colors, lists, edges, etc.), the cached
    // workflow.json becomes stale.  We embed a _defaultDigest so we can
    // detect drift and auto-refresh — but only if the user hasn't applied
    // a custom preset (which strips the digest).
    const defaultConfig = JSON.parse(fs.readFileSync(this.defaultConfigPath, 'utf-8')) as WorkflowConfig;
    const currentDigest = configDigest(defaultConfig);

    if (!fs.existsSync(this.activeConfigPath)) {
      // First run — seed from bundled default with digest marker
      this.writeWithDigest(this.activeConfigPath, defaultConfig, currentDigest);
      this.engine.reload(defaultConfig);
      fs.writeFileSync(this.manifestPath, this.engine.generateShellManifest(), 'utf-8');
    } else {
      const active = JSON.parse(fs.readFileSync(this.activeConfigPath, 'utf-8')) as WorkflowConfig & { _defaultDigest?: string };
      if (!active._defaultDigest) {
        // Legacy file without digest marker. If content matches current default, stamp it.
        // If different, it's user-customized — leave it alone.
        if (configDigest(active) === currentDigest) {
          this.writeWithDigest(this.activeConfigPath, defaultConfig, currentDigest);
        }
      } else if (active._defaultDigest !== currentDigest) {
        // Bundled default changed since last sync — refresh + regenerate manifest
        this.writeWithDigest(this.activeConfigPath, defaultConfig, currentDigest);
        this.engine.reload(defaultConfig);
        fs.writeFileSync(this.manifestPath, this.engine.generateShellManifest(), 'utf-8');
      }
    }

    // Always keep the "default" preset in sync with the bundled default
    const defaultPresetPath = path.join(this.presetsDir, 'default.json');
    const preset = { _preset: { name: 'default', savedAt: new Date().toISOString(), savedFrom: 'bundled' }, ...defaultConfig };
    fs.writeFileSync(defaultPresetPath, JSON.stringify(preset, null, 2));
  }

  setSocketServer(io: Server): void {
    this.io = io;
  }

  getEngine(): WorkflowEngine {
    return this.engine;
  }

  // ─── Validation ──────────────────────────────────────

  validate(config: WorkflowConfig): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!isWorkflowConfig(config)) {
      errors.push('Invalid config shape: must have version=1, name, lists[], edges[]');
      return { valid: false, errors, warnings };
    }

    if (config.branchingMode !== undefined && config.branchingMode !== 'trunk' && config.branchingMode !== 'worktree') {
      warnings.push(`Invalid branchingMode: "${config.branchingMode}" — defaulting to "trunk"`);
    }

    // Unique list IDs
    const listIds = new Set<string>();
    for (const list of config.lists) {
      if (listIds.has(list.id)) errors.push(`Duplicate list ID: "${list.id}"`);
      listIds.add(list.id);
    }

    // Valid edge references + no duplicates
    const edgeKeys = new Set<string>();
    for (const edge of config.edges) {
      if (!listIds.has(edge.from)) errors.push(`Edge references unknown list: from="${edge.from}"`);
      if (!listIds.has(edge.to)) errors.push(`Edge references unknown list: to="${edge.to}"`);
      const key = `${edge.from}:${edge.to}`;
      if (edgeKeys.has(key)) errors.push(`Duplicate edge: ${key}`);
      edgeKeys.add(key);
    }

    // Exactly 1 entry point
    const entryPoints = config.lists.filter((l) => l.isEntryPoint);
    if (entryPoints.length === 0) errors.push('No entry point defined (isEntryPoint=true)');
    if (entryPoints.length > 1) errors.push(`Multiple entry points: ${entryPoints.map((l) => l.id).join(', ')}`);

    // Graph connectivity — all non-terminal lists reachable from entry point via edges
    if (entryPoints.length === 1 && errors.length === 0) {
      const terminal = new Set(config.terminalStatuses ?? []);
      const reachable = new Set<string>();
      const queue = [entryPoints[0].id];
      while (queue.length > 0) {
        const current = queue.shift()!;
        if (reachable.has(current)) continue;
        reachable.add(current);
        for (const edge of config.edges) {
          if (edge.from === current && !reachable.has(edge.to)) queue.push(edge.to);
        }
      }
      for (const list of config.lists) {
        if (!terminal.has(list.id) && !reachable.has(list.id)) {
          errors.push(`List "${list.id}" is not reachable from entry point`);
        }
      }
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  // ─── Active Config ──────────────────────────────────

  getActive(): WorkflowConfig {
    let raw: WorkflowConfig;
    if (fs.existsSync(this.activeConfigPath)) {
      raw = JSON.parse(fs.readFileSync(this.activeConfigPath, 'utf-8')) as WorkflowConfig;
    } else {
      raw = JSON.parse(fs.readFileSync(this.defaultConfigPath, 'utf-8')) as WorkflowConfig;
    }
    // Strip internal digest marker before returning to clients
    delete (raw as WorkflowConfig & { _defaultDigest?: string })._defaultDigest;
    return raw;
  }

  updateActive(config: WorkflowConfig): ValidationResult {
    const result = this.validate(config);
    if (!result.valid) return result;
    // Strip digest — user edits mean this is no longer a pristine default
    delete (config as WorkflowConfig & { _defaultDigest?: string })._defaultDigest;
    this.writeAtomic(this.activeConfigPath, config);
    this.io?.emit('workflow:changed', { config });
    return result;
  }

  // ─── Preset Management ──────────────────────────────

  listPresets(): PresetInfo[] {
    const files = fs.readdirSync(this.presetsDir).filter((f) => f.endsWith('.json'));
    return files.map((f) => {
      const filePath = path.join(this.presetsDir, f);
      const content = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as {
        _preset?: { savedAt?: string };
        lists?: unknown[];
        edges?: unknown[];
      };
      const stat = fs.statSync(filePath);
      return {
        name: f.endsWith('.json') ? f.slice(0, -5) : f,
        createdAt: content._preset?.savedAt ?? stat.birthtime.toISOString(),
        listCount: Array.isArray(content.lists) ? content.lists.length : 0,
        edgeCount: Array.isArray(content.edges) ? content.edges.length : 0,
      };
    });
  }

  savePreset(name: string): void {
    if (!/^[a-zA-Z0-9-]+$/.test(name) || name.length > 50) {
      throw new Error('Preset name must be alphanumeric with hyphens, max 50 characters');
    }
    if (name === 'default') {
      throw new Error('Cannot overwrite the "default" preset');
    }
    const config = this.getActive();
    const preset = { _preset: { name, savedAt: new Date().toISOString(), savedFrom: 'active' }, ...config };
    fs.writeFileSync(path.join(this.presetsDir, `${name}.json`), JSON.stringify(preset, null, 2));
  }

  getPreset(name: string): WorkflowConfig {
    const filePath = path.join(this.presetsDir, `${name}.json`);
    if (!fs.existsSync(filePath)) throw new Error(`Preset "${name}" not found`);
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as WorkflowConfig & { _preset?: unknown };
    delete raw._preset;
    return raw;
  }

  deletePreset(name: string): void {
    if (name === 'default') throw new Error('Cannot delete the "default" preset');
    const filePath = path.join(this.presetsDir, `${name}.json`);
    if (!fs.existsSync(filePath)) throw new Error(`Preset "${name}" not found`);
    fs.unlinkSync(filePath);
  }

  // ─── Migration Engine ───────────────────────────────

  previewMigration(newConfig: WorkflowConfig): MigrationPlan {
    const validation = this.validate(newConfig);
    if (!validation.valid) {
      return {
        valid: false, validationErrors: validation.errors,
        removedLists: [], addedLists: [], dirsToCreate: [], dirsToRemove: [],
        orphanedScopes: [], lostEdges: [], suggestedMappings: {},
        impactSummary: 'New config has validation errors',
      };
    }

    const activeConfig = this.getActive();
    const activeIds = new Set(activeConfig.lists.map((l) => l.id));
    const newIds = new Set(newConfig.lists.map((l) => l.id));

    const removedLists = [...activeIds].filter((id) => !newIds.has(id));
    const addedLists = [...newIds].filter((id) => !activeIds.has(id));

    const orphanedScopes = removedLists
      .map((listId) => ({ listId, scopeFiles: this.scanScopesInList(listId) }))
      .filter((o) => o.scopeFiles.length > 0);

    const lostEdges = activeConfig.edges
      .filter((e) => !newIds.has(e.from) || !newIds.has(e.to))
      .map((e) => ({ from: e.from, to: e.to }));

    const suggestedMappings: Record<string, string> = {};
    for (const orphan of orphanedScopes) {
      suggestedMappings[orphan.listId] = this.findClosestList(orphan.listId, activeConfig, newConfig);
    }

    // Directories to create: new lists with hasDirectory that don't exist on disk
    const dirsToCreate = newConfig.lists
      .filter((l) => l.hasDirectory && !fs.existsSync(path.join(this.scopesDir, l.id)))
      .map((l) => l.id);

    // Directories to remove: removed lists whose scopes/ dir is empty (or will be after moves)
    const dirsToRemove = removedLists.filter((id) => {
      const dir = path.join(this.scopesDir, id);
      if (!fs.existsSync(dir)) return false;
      const remaining = fs.readdirSync(dir).filter((f) => f.endsWith('.md'));
      const orphan = orphanedScopes.find((o) => o.listId === id);
      // All .md files will be moved out, so the dir will be empty
      return orphan ? remaining.length <= orphan.scopeFiles.length : remaining.length === 0;
    });

    const parts: string[] = [];
    if (removedLists.length) parts.push(`${removedLists.length} list(s) removed`);
    if (addedLists.length) parts.push(`${addedLists.length} list(s) added`);
    if (dirsToCreate.length) parts.push(`${dirsToCreate.length} scope dir(s) to create`);
    if (dirsToRemove.length) parts.push(`${dirsToRemove.length} scope dir(s) to remove`);
    if (orphanedScopes.length) {
      const total = orphanedScopes.reduce((sum, o) => sum + o.scopeFiles.length, 0);
      parts.push(`${total} scope(s) in ${orphanedScopes.length} orphaned list(s) need migration`);
    }
    if (lostEdges.length) parts.push(`${lostEdges.length} edge(s) lost`);

    return {
      valid: true, validationErrors: [],
      removedLists, addedLists, dirsToCreate, dirsToRemove,
      orphanedScopes, lostEdges, suggestedMappings,
      impactSummary: parts.length > 0 ? parts.join('; ') : 'No impact — configs are compatible',
    };
  }

  // ─── Atomic Apply ───────────────────────────────────

  applyMigration(newConfig: WorkflowConfig, orphanMappings: Record<string, string>): MigrationPlan {
    // User-initiated migration — strip digest so auto-refresh won't overwrite
    delete (newConfig as WorkflowConfig & { _defaultDigest?: string })._defaultDigest;

    // Step 1: Validate
    const validation = this.validate(newConfig);
    if (!validation.valid) {
      throw new Error(`Validation failed: ${validation.errors.join('; ')}`);
    }

    // Step 2: Compute impact + verify all orphans have valid mappings
    const plan = this.previewMigration(newConfig);
    const newIds = new Set(newConfig.lists.map((l) => l.id));

    for (const orphan of plan.orphanedScopes) {
      const target = orphanMappings[orphan.listId];
      if (!target) throw new Error(`Missing orphan mapping for list "${orphan.listId}"`);
      if (!newIds.has(target)) throw new Error(`Orphan mapping target "${target}" is not a valid list in the new config`);
    }

    // Backup current config for rollback
    const backupPath = this.activeConfigPath + '.backup';
    if (fs.existsSync(this.activeConfigPath)) fs.copyFileSync(this.activeConfigPath, backupPath);

    const moves: Array<{ src: string; dest: string; originalContent: string }> = [];
    const migratedScopes: Array<{ file: string; from: string; to: string }> = [];

    try {
      // Step 3: Move scope files + update frontmatter
      for (const orphan of plan.orphanedScopes) {
        const targetId = orphanMappings[orphan.listId];
        const targetDir = path.join(this.scopesDir, targetId);
        if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

        for (const file of orphan.scopeFiles) {
          const srcPath = path.join(this.scopesDir, orphan.listId, file);
          const originalContent = fs.readFileSync(srcPath, 'utf-8');
          const destPath = path.join(targetDir, file);
          fs.renameSync(srcPath, destPath);
          moves.push({ src: srcPath, dest: destPath, originalContent });
          this.updateFrontmatterStatus(destPath, targetId);
          migratedScopes.push({ file, from: orphan.listId, to: targetId });
        }
      }

      // Step 4: Create scopes/ directories for added lists with hasDirectory
      for (const list of newConfig.lists) {
        if (list.hasDirectory) {
          const dir = path.join(this.scopesDir, list.id);
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        }
      }

      // Step 5: Remove empty scopes/ directories for removed lists
      for (const listId of plan.removedLists) {
        const dir = path.join(this.scopesDir, listId);
        if (fs.existsSync(dir) && fs.readdirSync(dir).length === 0) {
          fs.rmdirSync(dir);
        }
      }

      // Step 6: Apply config atomically + regenerate manifest + reload engine
      this.writeAtomic(this.activeConfigPath, newConfig);
      this.engine.reload(newConfig);
      const manifest = this.engine.generateShellManifest();
      const tmpManifestPath = this.manifestPath + '.tmp';
      fs.writeFileSync(tmpManifestPath, manifest);
      fs.renameSync(tmpManifestPath, this.manifestPath);

      // Step 7: Emit socket event + log
      this.io?.emit('workflow:changed', { config: newConfig, migratedScopes });
      // eslint-disable-next-line no-console
      console.log(`[Orbital] Workflow migrated: ${migratedScopes.length} scope(s) moved across ${plan.removedLists.length} removed list(s)`);

      // Clean up backup on success
      if (fs.existsSync(backupPath)) fs.unlinkSync(backupPath);
    } catch (err) {
      // Rollback: reverse scope file moves with original content
      for (const move of moves.reverse()) {
        try {
          fs.renameSync(move.dest, move.src);
          fs.writeFileSync(move.src, move.originalContent);
        } catch (rollbackErr) { console.error('[Orbital] Migration rollback failed for', move.src, rollbackErr); }
      }
      // Rollback: restore original config + reload engine
      if (fs.existsSync(backupPath)) {
        fs.copyFileSync(backupPath, this.activeConfigPath);
        fs.unlinkSync(backupPath);
        const original = JSON.parse(fs.readFileSync(this.activeConfigPath, 'utf-8')) as WorkflowConfig;
        this.engine.reload(original);
      }
      throw err;
    }

    return plan;
  }

  // ─── Helpers ────────────────────────────────────────

  private scanScopesInList(listId: string): string[] {
    const dir = path.join(this.scopesDir, listId);
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir).filter((f) => f.endsWith('.md'));
  }

  private findClosestList(removedId: string, activeConfig: WorkflowConfig, newConfig: WorkflowConfig): string {
    const removed = activeConfig.lists.find((l) => l.id === removedId);
    const entryId = newConfig.lists.find((l) => l.isEntryPoint)?.id ?? newConfig.lists[0].id;
    if (!removed) return entryId;

    // 1. Same group as removed list
    if (removed.group) {
      const match = newConfig.lists.find((l) => l.group === removed.group);
      if (match) return match.id;
    }

    // 2. Closest list by order number
    const sorted = [...newConfig.lists].sort((a, b) =>
      Math.abs(a.order - removed.order) - Math.abs(b.order - removed.order),
    );
    if (sorted.length > 0) return sorted[0].id;

    // 3. Entry point as last resort
    return entryId;
  }

  private updateFrontmatterStatus(filePath: string, newStatus: string): void {
    const content = fs.readFileSync(filePath, 'utf-8');
    const updated = content.replace(/^(status:\s*).+$/m, `$1${newStatus}`);
    fs.writeFileSync(filePath, updated);
  }

  private writeAtomic(targetPath: string, data: WorkflowConfig): void {
    const tmpPath = targetPath + '.tmp';
    fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2));
    fs.renameSync(tmpPath, targetPath);
  }

  /** Write config with a _defaultDigest marker so we can detect when the bundled default changes. */
  private writeWithDigest(targetPath: string, config: WorkflowConfig, digest: string): void {
    const withDigest = { _defaultDigest: digest, ...config };
    const tmpPath = targetPath + '.tmp';
    fs.writeFileSync(tmpPath, JSON.stringify(withDigest, null, 2));
    fs.renameSync(tmpPath, targetPath);
  }
}
