import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

// We need to redirect ORBITAL_HOME / REGISTRY_PATH to a temp dir.
// We achieve this by overriding HOME env var before importing the module.

describe('global-config', () => {
  let tmpHome: string;
  let originalHome: string | undefined;
  let mod: typeof import('../global-config.js');

  beforeEach(async () => {
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'orbital-global-test-'));
    originalHome = process.env.HOME;
    process.env.HOME = tmpHome;

    // Reset module cache so constants are recomputed
    vi.resetModules();
    mod = await import('../global-config.js');
  });

  afterEach(() => {
    process.env.HOME = originalHome;
    fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  describe('generateProjectId', () => {
    it('generates slug from directory basename', () => {
      const id = mod.generateProjectId('/home/user/my-project', []);
      expect(id).toBe('my-project');
    });

    it('lowercases and normalizes special chars', () => {
      const id = mod.generateProjectId('/home/user/My_Cool.Project', []);
      expect(id).toBe('my-cool-project');
    });

    it('handles collision by appending hash', () => {
      const id = mod.generateProjectId('/home/user/my-project', ['my-project']);
      expect(id).toMatch(/^my-project-[0-9a-f]{4}$/);
    });

    it('generates different hashes for different paths with same basename', () => {
      const id1 = mod.generateProjectId('/home/user1/project', ['project']);
      const id2 = mod.generateProjectId('/home/user2/project', ['project']);
      expect(id1).not.toBe(id2);
    });

    it('falls back to "project" for empty basename', () => {
      const id = mod.generateProjectId('/', []);
      expect(id).toBe('project');
    });
  });

  describe('loadGlobalConfig', () => {
    it('creates default config when missing', () => {
      const config = mod.loadGlobalConfig();
      expect(config.version).toBe(1);
      expect(config.projects).toEqual([]);
    });

    it('creates ~/.orbital/ directory', () => {
      mod.loadGlobalConfig();
      expect(fs.existsSync(path.join(tmpHome, '.orbital'))).toBe(true);
    });

    it('reads existing config from disk', () => {
      const orbitalDir = path.join(tmpHome, '.orbital');
      fs.mkdirSync(orbitalDir, { recursive: true });
      // Create primitives dirs so ensureOrbitalHome is satisfied
      for (const sub of ['agents', 'skills', 'hooks', 'config']) {
        fs.mkdirSync(path.join(orbitalDir, 'primitives', sub), { recursive: true });
      }
      const registryPath = path.join(orbitalDir, 'config.json');
      fs.writeFileSync(registryPath, JSON.stringify({
        version: 1,
        projects: [{ id: 'test', path: '/tmp/test', name: 'Test', color: '210 80% 55%', registeredAt: '2026-01-01', enabled: true }],
      }));

      const config = mod.loadGlobalConfig();
      expect(config.projects).toHaveLength(1);
      expect(config.projects[0].id).toBe('test');
    });

    it('handles corrupt registry gracefully', () => {
      const orbitalDir = path.join(tmpHome, '.orbital');
      fs.mkdirSync(orbitalDir, { recursive: true });
      for (const sub of ['agents', 'skills', 'hooks', 'config']) {
        fs.mkdirSync(path.join(orbitalDir, 'primitives', sub), { recursive: true });
      }
      fs.writeFileSync(path.join(orbitalDir, 'config.json'), 'NOT JSON!!!');

      const config = mod.loadGlobalConfig();
      expect(config.version).toBe(1);
      expect(config.projects).toEqual([]);
    });
  });

  describe('saveGlobalConfig', () => {
    it('writes config atomically', () => {
      const config = { version: 1 as const, projects: [] };
      mod.saveGlobalConfig(config);

      const orbitalDir = path.join(tmpHome, '.orbital');
      const registryPath = path.join(orbitalDir, 'config.json');
      expect(fs.existsSync(registryPath)).toBe(true);

      const loaded = JSON.parse(fs.readFileSync(registryPath, 'utf-8'));
      expect(loaded.version).toBe(1);
    });
  });

  describe('registerProject / unregisterProject', () => {
    it('registers a new project', () => {
      const reg = mod.registerProject('/tmp/my-project', { name: 'My Project' });
      expect(reg.id).toBe('my-project');
      expect(reg.name).toBe('My Project');
      expect(reg.enabled).toBe(true);
    });

    it('returns existing registration for same path', () => {
      const reg1 = mod.registerProject('/tmp/my-project2');
      const reg2 = mod.registerProject('/tmp/my-project2');
      expect(reg1.id).toBe(reg2.id);
    });

    it('unregisters project by ID', () => {
      mod.registerProject('/tmp/unregister-test');
      const result = mod.unregisterProject('unregister-test');
      expect(result).toBe(true);

      const config = mod.loadGlobalConfig();
      expect(config.projects.find(p => p.id === 'unregister-test')).toBeUndefined();
    });

    it('returns false for non-existent project', () => {
      const result = mod.unregisterProject('non-existent');
      expect(result).toBe(false);
    });
  });

  describe('color cycling', () => {
    it('assigns different colors to different projects', () => {
      const reg1 = mod.registerProject('/tmp/color-test-1');
      const reg2 = mod.registerProject('/tmp/color-test-2');
      expect(reg1.color).not.toBe(reg2.color);
    });
  });
});
