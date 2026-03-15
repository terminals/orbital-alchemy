import fs from 'fs';
import path from 'path';
import type { Server } from 'socket.io';
import type { WorkflowConfig } from '../../shared/workflow-config.js';
import { isWorkflowConfig } from '../../shared/workflow-config.js';
import type { WorkflowEngine } from '../../shared/workflow-engine.js';

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

    // Create active config if missing (copy from default)
    if (!fs.existsSync(this.activeConfigPath)) {
      fs.copyFileSync(this.defaultConfigPath, this.activeConfigPath);
    }

    // Create default preset if missing
    const defaultPresetPath = path.join(this.presetsDir, 'default.json');
    if (!fs.existsSync(defaultPresetPath)) {
      const config = JSON.parse(fs.readFileSync(this.activeConfigPath, 'utf-8')) as WorkflowConfig;
      const preset = { _preset: { name: 'default', savedAt: new Date().toISOString(), savedFrom: 'initial' }, ...config };
      fs.writeFileSync(defaultPresetPath, JSON.stringify(preset, null, 2));
    }
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
    if (fs.existsSync(this.activeConfigPath)) {
      return JSON.parse(fs.readFileSync(this.activeConfigPath, 'utf-8')) as WorkflowConfig;
    }
    return JSON.parse(fs.readFileSync(this.defaultConfigPath, 'utf-8')) as WorkflowConfig;
  }

  updateActive(config: WorkflowConfig): ValidationResult {
    const result = this.validate(config);
    if (!result.valid) return result;
    this.writeAtomic(this.activeConfigPath, config);
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
        name: f.replace('.json', ''),
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
        removedLists: [], addedLists: [], orphanedScopes: [],
        lostEdges: [], suggestedMappings: {},
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

    const parts: string[] = [];
    if (removedLists.length) parts.push(`${removedLists.length} list(s) removed`);
    if (addedLists.length) parts.push(`${addedLists.length} list(s) added`);
    if (orphanedScopes.length) {
      const total = orphanedScopes.reduce((sum, o) => sum + o.scopeFiles.length, 0);
      parts.push(`${total} scope(s) in ${orphanedScopes.length} orphaned list(s) need migration`);
    }
    if (lostEdges.length) parts.push(`${lostEdges.length} edge(s) lost`);

    return {
      valid: true, validationErrors: [],
      removedLists, addedLists, orphanedScopes, lostEdges, suggestedMappings,
      impactSummary: parts.length > 0 ? parts.join('; ') : 'No impact — configs are compatible',
    };
  }

  // ─── Atomic Apply ───────────────────────────────────

  applyMigration(newConfig: WorkflowConfig, orphanMappings: Record<string, string>): MigrationPlan {
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

      // Step 4: Apply config atomically + regenerate manifest + reload engine
      this.writeAtomic(this.activeConfigPath, newConfig);
      this.engine.reload(newConfig);
      const manifest = this.engine.generateShellManifest();
      fs.writeFileSync(this.manifestPath, manifest);

      // Step 5: Emit socket event + log
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
        } catch { /* best-effort rollback */ }
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
}
