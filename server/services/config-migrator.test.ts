import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  migrateConfig,
  getPendingMigrations,
  getAllMigrations,
} from '../config-migrator.js';

describe('config-migrator', () => {
  let tmpDir: string;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orbital-config-migrator-'));
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  /** Write a config file and return its path. */
  function writeConfig(name: string, config: Record<string, unknown>): string {
    const dir = path.join(tmpDir, name);
    fs.mkdirSync(dir, { recursive: true });
    const configPath = path.join(dir, 'orbital.config.json');
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf8');
    return configPath;
  }

  /** Read a config file back. */
  function readConfig(configPath: string): Record<string, unknown> {
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  }

  // ─── getPendingMigrations ─────────────────────────────────

  describe('getPendingMigrations()', () => {
    it('returns empty array when all migrations are applied', () => {
      // Since MIGRATIONS is currently empty, all applied = none pending
      const allIds = getAllMigrations().map(m => m.id);
      const pending = getPendingMigrations(allIds);
      expect(pending).toEqual([]);
    });

    it('returns empty array with empty appliedMigrations when no migrations exist', () => {
      const pending = getPendingMigrations([]);
      expect(pending).toEqual([]);
    });

    it('handles extra applied IDs gracefully (future-proofing)', () => {
      const pending = getPendingMigrations(['0.2.0->0.3.0', '0.3.0->0.4.0']);
      expect(pending).toEqual([]);
    });
  });

  // ─── getAllMigrations ─────────────────────────────────────

  describe('getAllMigrations()', () => {
    it('returns an array (possibly empty if no migrations registered)', () => {
      const migrations = getAllMigrations();
      expect(Array.isArray(migrations)).toBe(true);
      for (const m of migrations) {
        expect(m).toHaveProperty('id');
        expect(m).toHaveProperty('description');
      }
    });
  });

  // ─── Schema defaults filling ──────────────────────────────

  describe('schema defaults filling', () => {
    it('fills all missing top-level keys', () => {
      const configPath = writeConfig('empty-config', {});

      const result = migrateConfig(configPath, []);

      expect(result.errors).toHaveLength(0);
      expect(result.defaultsFilled.length).toBeGreaterThan(0);

      const config = readConfig(configPath);
      expect(config.projectName).toBe('My Project');
      expect(config.scopesDir).toBe('scopes');
      expect(config.eventsDir).toBe('.claude/orbital-events');
      expect(config.dbDir).toBe('.claude/orbital');
      expect(config.configDir).toBe('.claude/config');
      expect(config.serverPort).toBe(4444);
      expect(config.clientPort).toBe(4445);
      expect(config.logLevel).toBe('info');
      expect(config.categories).toEqual(['feature', 'bugfix', 'refactor', 'infrastructure', 'docs']);
    });

    it('fills nested defaults for missing sections', () => {
      const configPath = writeConfig('no-nested', {
        projectName: 'Existing',
      });

      const result = migrateConfig(configPath, []);

      const config = readConfig(configPath);
      // Terminal section should be created
      expect(config.terminal).toEqual({ adapter: 'auto', profilePrefix: 'Orbital' });
      // Claude section should be created
      expect(config.claude).toEqual({ executable: 'claude', flags: ['--dangerously-skip-permissions'] });
      // Commands section should be created
      expect(config.commands).toEqual({ typeCheck: null, lint: null, build: null, test: null });

      expect(result.defaultsFilled).toContain('terminal');
      expect(result.defaultsFilled).toContain('claude');
      expect(result.defaultsFilled).toContain('commands');
    });

    it('fills missing keys within existing nested sections', () => {
      const configPath = writeConfig('partial-nested', {
        terminal: { adapter: 'iterm2' },
        claude: { executable: '/usr/local/bin/claude' },
      });

      const result = migrateConfig(configPath, []);

      const config = readConfig(configPath);
      // Existing values preserved
      expect((config.terminal as Record<string, unknown>).adapter).toBe('iterm2');
      expect((config.claude as Record<string, unknown>).executable).toBe('/usr/local/bin/claude');
      // Missing nested keys filled
      expect((config.terminal as Record<string, unknown>).profilePrefix).toBe('Orbital');
      expect((config.claude as Record<string, unknown>).flags).toEqual(['--dangerously-skip-permissions']);

      expect(result.defaultsFilled).toContain('terminal.profilePrefix');
      expect(result.defaultsFilled).toContain('claude.flags');
    });

    it('does not overwrite existing top-level values', () => {
      const configPath = writeConfig('has-values', {
        projectName: 'Custom',
        serverPort: 5555,
        logLevel: 'debug',
      });

      migrateConfig(configPath, []);

      const config = readConfig(configPath);
      expect(config.projectName).toBe('Custom');
      expect(config.serverPort).toBe(5555);
      expect(config.logLevel).toBe('debug');
    });
  });

  // ─── migrateConfig with file I/O ─────────────────────────

  describe('migrateConfig()', () => {
    it('returns empty result when config file does not exist', () => {
      const result = migrateConfig(path.join(tmpDir, 'nonexistent', 'config.json'), []);

      expect(result.applied).toHaveLength(0);
      expect(result.defaultsFilled).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    });

    it('returns error for malformed JSON', () => {
      const dir = path.join(tmpDir, 'malformed');
      fs.mkdirSync(dir, { recursive: true });
      const configPath = path.join(dir, 'orbital.config.json');
      fs.writeFileSync(configPath, '{not valid json!!', 'utf8');

      const result = migrateConfig(configPath, []);

      expect(result.errors.length).toBe(1);
      expect(result.errors[0]).toContain('Failed to parse');
    });

    it('does not write file when no changes are made', () => {
      // Build a config that already has all defaults filled
      const fullConfig: Record<string, unknown> = {
        projectName: 'My Project',
        scopesDir: 'scopes',
        eventsDir: '.claude/orbital-events',
        dbDir: '.claude/orbital',
        configDir: '.claude/config',
        serverPort: 4444,
        clientPort: 4445,
        logLevel: 'info',
        categories: ['feature', 'bugfix', 'refactor', 'infrastructure', 'docs'],
        terminal: { adapter: 'auto', profilePrefix: 'Orbital' },
        claude: { executable: 'claude', flags: ['--dangerously-skip-permissions'] },
        commands: { typeCheck: null, lint: null, build: null, test: null },
      };

      const configPath = writeConfig('already-complete', fullConfig);
      const originalContent = fs.readFileSync(configPath, 'utf8');

      // Small delay to ensure mtime differs if written
      const result = migrateConfig(configPath, []);

      expect(result.applied).toHaveLength(0);
      expect(result.defaultsFilled).toHaveLength(0);
      // File should not have been rewritten
      const newContent = fs.readFileSync(configPath, 'utf8');
      expect(newContent).toBe(originalContent);
    });

    it('writes file when defaults are filled', () => {
      const configPath = writeConfig('needs-defaults', {
        projectName: 'Test',
      });

      const result = migrateConfig(configPath, []);

      expect(result.defaultsFilled.length).toBeGreaterThan(0);
      const config = readConfig(configPath);
      // Verify the file was updated
      expect(config.serverPort).toBe(4444);
    });

    it('preserves extra user-defined keys', () => {
      const configPath = writeConfig('extra-keys', {
        projectName: 'Custom',
        customField: 'user-value',
        nested: { deep: true },
      });

      migrateConfig(configPath, []);

      const config = readConfig(configPath);
      expect(config.customField).toBe('user-value');
      expect(config.nested).toEqual({ deep: true });
    });
  });
});
