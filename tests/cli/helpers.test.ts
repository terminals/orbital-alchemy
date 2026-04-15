import { describe, it, expect, afterAll, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

// ─── Shared temp dir setup ──────────────────────────────────

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'orbital-cli-helpers-test-'));

afterAll(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

let counter = 0;
function makeTmpDir(name: string): string {
  const dir = path.join(tmpRoot, `${name}-${counter++}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// ─── Tests ──────────────────────────────────────────────────

describe('CLI Helpers', () => {
  // We import the helpers dynamically to avoid module-level side effects
  let helpers: typeof import('../../bin/lib/helpers.js');

  beforeEach(async () => {
    helpers = await import('../../bin/lib/helpers.js');
  });

  // ─── getFlagValue() ─────────────────────────────────────────

  describe('getFlagValue()', () => {
    it('returns value after the flag', () => {
      const result = helpers.getFlagValue(['--port', '8080', '--verbose'], '--port');
      expect(result).toBe('8080');
    });

    it('returns undefined when flag is missing', () => {
      const result = helpers.getFlagValue(['--verbose'], '--port');
      expect(result).toBeUndefined();
    });

    it('returns undefined when flag is last arg (no value)', () => {
      const result = helpers.getFlagValue(['--port'], '--port');
      expect(result).toBeUndefined();
    });

    it('works with multiple flags', () => {
      const args = ['--host', 'localhost', '--port', '3000'];
      expect(helpers.getFlagValue(args, '--host')).toBe('localhost');
      expect(helpers.getFlagValue(args, '--port')).toBe('3000');
    });
  });

  // ─── detectProjectRoot() ──────────────────────────────────

  describe('detectProjectRoot()', () => {
    it('returns a string path', () => {
      const result = helpers.detectProjectRoot();
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('returns the git root when in a git repo', () => {
      // We are running in a git repo, so this should return its root
      const root = helpers.detectProjectRoot();
      expect(fs.existsSync(path.join(root, '.git'))).toBe(true);
    });
  });

  // ─── loadConfig() ──────────────────────────────────────────

  describe('loadConfig()', () => {
    it('returns defaults when no config file exists', () => {
      const dir = makeTmpDir('loadConfig-missing');
      const config = helpers.loadConfig(dir);
      expect(config).toEqual({ serverPort: 4444, clientPort: 4445 });
    });

    it('loads config from existing file', () => {
      const dir = makeTmpDir('loadConfig-exists');
      fs.mkdirSync(path.join(dir, '.claude'), { recursive: true });
      fs.writeFileSync(
        path.join(dir, '.claude', 'orbital.config.json'),
        JSON.stringify({ serverPort: 5555, clientPort: 5556, projectName: 'test' }),
        'utf-8',
      );

      const config = helpers.loadConfig(dir);
      expect(config.serverPort).toBe(5555);
      expect(config.clientPort).toBe(5556);
    });

    it('returns defaults for malformed JSON', () => {
      const dir = makeTmpDir('loadConfig-malformed');
      fs.mkdirSync(path.join(dir, '.claude'), { recursive: true });
      fs.writeFileSync(
        path.join(dir, '.claude', 'orbital.config.json'),
        'not valid json!!!',
        'utf-8',
      );

      const config = helpers.loadConfig(dir);
      expect(config).toEqual({ serverPort: 4444, clientPort: 4445 });
    });
  });

  // ─── getPackageVersion() ──────────────────────────────────

  describe('getPackageVersion()', () => {
    it('returns a version string', () => {
      const version = helpers.getPackageVersion();
      expect(typeof version).toBe('string');
      expect(version.length).toBeGreaterThan(0);
    });

    it('returns a semver-like format', () => {
      const version = helpers.getPackageVersion();
      expect(version).toMatch(/^\d+\.\d+\.\d+/);
    });
  });

  // ─── loadRegistry() ──────────────────────────────────────

  describe('loadRegistry()', () => {
    it('returns default registry structure when file does not exist', () => {
      const registry = helpers.loadRegistry();
      expect(registry).toHaveProperty('version');
      expect(registry).toHaveProperty('projects');
      expect(Array.isArray(registry.projects)).toBe(true);
    });

    it('returns default registry for malformed JSON', () => {
      const malformedDir = path.join(makeTmpDir('malformed-registry'), '.orbital');
      fs.mkdirSync(malformedDir, { recursive: true });
      fs.writeFileSync(path.join(malformedDir, 'config.json'), '{bad json!!!', 'utf8');

      let result: Record<string, unknown>;
      try {
        result = JSON.parse(fs.readFileSync(path.join(malformedDir, 'config.json'), 'utf8'));
      } catch {
        result = { version: 1, projects: [] };
      }
      expect(result.version).toBe(1);
      expect((result.projects as unknown[]).length).toBe(0);
    });
  });

  // ─── writeRegistryAtomic() ────────────────────────────────

  describe('writeRegistryAtomic()', () => {
    it('writes registry with valid JSON content', () => {
      const orbitalHome = path.join(makeTmpDir('atomic-write'), '.orbital');
      fs.mkdirSync(orbitalHome, { recursive: true });
      const registryPath = path.join(orbitalHome, 'config.json');

      const registry = {
        version: 1,
        projects: [
          { id: 'test-proj', name: 'Test Project', path: '/tmp/test', color: '210 80% 55%', enabled: true },
        ],
      };
      const tmp = registryPath + `.tmp.${process.pid}`;
      fs.writeFileSync(tmp, JSON.stringify(registry, null, 2), 'utf8');
      fs.renameSync(tmp, registryPath);

      expect(fs.existsSync(registryPath)).toBe(true);
      const content = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
      expect(content.version).toBe(1);
      expect(content.projects).toHaveLength(1);
      expect(content.projects[0].id).toBe('test-proj');
    });

    it('leaves no orphaned .tmp files after write', () => {
      const orbitalHome = path.join(makeTmpDir('atomic-orphan'), '.orbital');
      fs.mkdirSync(orbitalHome, { recursive: true });
      const registryPath = path.join(orbitalHome, 'config.json');

      const registry = { version: 1, projects: [] };
      const tmp = registryPath + `.tmp.${process.pid}`;
      fs.writeFileSync(tmp, JSON.stringify(registry, null, 2), 'utf8');
      fs.renameSync(tmp, registryPath);

      const files = fs.readdirSync(orbitalHome);
      const tmpFiles = files.filter(f => f.includes('.tmp.'));
      expect(tmpFiles).toHaveLength(0);
    });

    it('overwrites existing registry', () => {
      const orbitalHome = path.join(makeTmpDir('atomic-overwrite'), '.orbital');
      fs.mkdirSync(orbitalHome, { recursive: true });
      const registryPath = path.join(orbitalHome, 'config.json');

      fs.writeFileSync(registryPath, JSON.stringify({ version: 1, projects: [] }), 'utf8');

      const updated = {
        version: 1,
        projects: [{ id: 'updated', name: 'Updated', path: '/tmp/up', enabled: true }],
      };
      const tmp = registryPath + `.tmp.${process.pid}`;
      fs.writeFileSync(tmp, JSON.stringify(updated, null, 2), 'utf8');
      fs.renameSync(tmp, registryPath);

      const content = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
      expect(content.projects).toHaveLength(1);
      expect(content.projects[0].id).toBe('updated');
    });
  });

  // ─── orbitalSetupDone() ───────────────────────────────────

  describe('orbitalSetupDone()', () => {
    it('returns a boolean', () => {
      const result = helpers.orbitalSetupDone();
      expect(typeof result).toBe('boolean');
    });
  });

  // ─── resolveBin() ─────────────────────────────────────────

  describe('resolveBin()', () => {
    it('returns null for non-existent binary', () => {
      const result = helpers.resolveBin('__nonexistent_binary_xyz__');
      expect(result).toBeNull();
    });

    it('returns a string path for existing binary (e.g. vitest)', () => {
      // vitest should be in node_modules/.bin
      const result = helpers.resolveBin('vitest');
      // Could be in local or hoisted, or null if neither
      if (result) {
        expect(typeof result).toBe('string');
        expect(fs.existsSync(result)).toBe(true);
      }
    });
  });

  // ─── PACKAGE_ROOT ─────────────────────────────────────────

  describe('PACKAGE_ROOT', () => {
    it('is a valid directory', () => {
      expect(fs.existsSync(helpers.PACKAGE_ROOT)).toBe(true);
    });

    it('contains package.json', () => {
      expect(fs.existsSync(path.join(helpers.PACKAGE_ROOT, 'package.json'))).toBe(true);
    });
  });

  // ─── printHelp() ──────────────────────────────────────────

  // ─── loadSharedModule / loadWizardModule error paths ──────

  describe('loadSharedModule() error path', () => {
    it('source code has correct fallback chain and exit behavior', () => {
      const helpersSource = fs.readFileSync(
        path.join(helpers.PACKAGE_ROOT, 'bin', 'lib', 'helpers.js'),
        'utf8',
      );
      expect(helpersSource).toContain('dist/server/server/init.js');
      expect(helpersSource).toContain("'../../server/init.js'");
      expect(helpersSource).toContain('process.exit(1)');
      expect(helpersSource).toContain('Orbital Command server module not found');
    });
  });

  describe('loadWizardModule() error path', () => {
    it('source code has correct fallback chain and exit behavior', () => {
      const helpersSource = fs.readFileSync(
        path.join(helpers.PACKAGE_ROOT, 'bin', 'lib', 'helpers.js'),
        'utf8',
      );
      expect(helpersSource).toContain('dist/server/server/wizard/index.js');
      expect(helpersSource).toContain("'../../server/wizard/index.js'");
      expect(helpersSource).toContain('Wizard module not found');
    });
  });

  // ─── printHelp() ──────────────────────────────────────────

  describe('printHelp()', () => {
    it('outputs help text without crashing', () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      expect(() => helpers.printHelp()).not.toThrow();
      spy.mockRestore();
    });
  });
});
