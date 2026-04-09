import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WorkflowService } from './workflow-service.js';
import { WorkflowEngine } from '../../shared/workflow-engine.js';
import { DEFAULT_CONFIG, MINIMAL_CONFIG } from '../../shared/__fixtures__/workflow-configs.js';
import { createMockEmitter } from '../__tests__/helpers/mock-emitter.js';
import fs from 'fs';
import os from 'os';
import path from 'path';

describe('WorkflowService', () => {
  let tmpDir: string;
  let configDir: string;
  let scopesDir: string;
  let defaultConfigPath: string;
  let engine: WorkflowEngine;
  let service: WorkflowService;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-svc-test-'));
    configDir = path.join(tmpDir, 'config');
    scopesDir = path.join(tmpDir, 'scopes');
    defaultConfigPath = path.join(tmpDir, 'default-workflow.json');

    fs.mkdirSync(configDir, { recursive: true });
    fs.mkdirSync(scopesDir, { recursive: true });

    // Write the default workflow config that the constructor reads
    fs.writeFileSync(defaultConfigPath, JSON.stringify(DEFAULT_CONFIG));

    // Create scope directories for the default workflow
    for (const list of DEFAULT_CONFIG.lists) {
      if (list.hasDirectory) {
        fs.mkdirSync(path.join(scopesDir, list.id), { recursive: true });
      }
    }

    engine = new WorkflowEngine(DEFAULT_CONFIG);
    service = new WorkflowService(configDir, engine, scopesDir, defaultConfigPath);
    service.setSocketServer(createMockEmitter() as any);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ─── validate() ──────────────────────────────────────────

  describe('validate()', () => {
    it('passes for valid config', () => {
      const result = service.validate(DEFAULT_CONFIG);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('fails for invalid config shape', () => {
      const result = service.validate({ version: 2 } as any);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('fails for duplicate list IDs', () => {
      const config = {
        ...MINIMAL_CONFIG,
        lists: [
          ...MINIMAL_CONFIG.lists,
          { ...MINIMAL_CONFIG.lists[0] }, // duplicate 'todo'
        ],
      };
      const result = service.validate(config);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.toLowerCase().includes('duplicate'))).toBe(true);
    });

    it('fails for edges referencing non-existent lists', () => {
      const config = {
        ...MINIMAL_CONFIG,
        edges: [
          { from: 'todo', to: 'nonexistent', direction: 'forward' as const, command: null, confirmLevel: 'quick' as const, label: 'X', description: 'X' },
        ],
      };
      const result = service.validate(config);
      expect(result.valid).toBe(false);
    });

    it('fails for zero entry points', () => {
      const config = {
        ...MINIMAL_CONFIG,
        lists: MINIMAL_CONFIG.lists.map(l => ({ ...l, isEntryPoint: false })),
      };
      const result = service.validate(config);
      expect(result.valid).toBe(false);
    });
  });

  // ─── getActive() / updateActive() ────────────────────────

  describe('getActive()', () => {
    it('returns active workflow config', () => {
      const config = service.getActive();
      expect(config.name).toBe(DEFAULT_CONFIG.name);
      expect(config.version).toBe(1);
    });

    it('strips _defaultDigest from returned config', () => {
      const config = service.getActive() as any;
      expect(config._defaultDigest).toBeUndefined();
    });
  });

  describe('updateActive()', () => {
    it('updates config and returns valid result', () => {
      const result = service.updateActive(DEFAULT_CONFIG);
      expect(result.valid).toBe(true);
    });

    it('rejects invalid config', () => {
      const result = service.updateActive({ version: 1, name: 'Bad', lists: [], edges: [] } as any);
      expect(result.valid).toBe(false);
    });
  });

  // ─── Presets ──────────────────────────────────────────────

  describe('presets', () => {
    it('savePreset() creates a preset file', () => {
      service.savePreset('test-preset');
      const presets = service.listPresets();
      expect(presets.some(p => p.name === 'test-preset')).toBe(true);
    });

    it('listPresets() returns all saved presets', () => {
      service.savePreset('preset-a');
      service.savePreset('preset-b');
      const presets = service.listPresets();
      expect(presets.length).toBeGreaterThanOrEqual(2);
    });

    it('getPreset() loads preset by name', () => {
      service.savePreset('loadable');
      const config = service.getPreset('loadable');
      expect(config.version).toBe(1);
    });

    it('getPreset() throws for non-existent preset', () => {
      expect(() => service.getPreset('nonexistent')).toThrow();
    });

    it('deletePreset() removes preset file', () => {
      service.savePreset('to-delete');
      service.deletePreset('to-delete');
      expect(() => service.getPreset('to-delete')).toThrow();
    });

    it('deletePreset() blocks deletion of "default"', () => {
      expect(() => service.deletePreset('default')).toThrow();
    });
  });

  // ─── previewMigration() ──────────────────────────────────

  describe('previewMigration()', () => {
    it('detects removed lists', () => {
      // Preview migrating from DEFAULT_CONFIG (7 lists) to MINIMAL_CONFIG (2 lists)
      const plan = service.previewMigration(MINIMAL_CONFIG);
      expect(plan.removedLists.length).toBeGreaterThan(0);
    });

    it('returns no-op plan when configs have same lists', () => {
      const plan = service.previewMigration(DEFAULT_CONFIG);
      expect(plan.valid).toBe(true);
      expect(plan.removedLists).toHaveLength(0);
      expect(plan.orphanedScopes).toHaveLength(0);
    });

    it('returns valid: false for invalid config', () => {
      const plan = service.previewMigration({ version: 1, name: 'Bad', lists: [], edges: [] } as any);
      expect(plan.valid).toBe(false);
    });
  });

  // ─── getEngine() ─────────────────────────────────────────

  describe('getEngine()', () => {
    it('returns the active workflow engine', () => {
      const e = service.getEngine();
      expect(e).toBeDefined();
      expect(e.getLists().length).toBeGreaterThan(0);
    });
  });
});
