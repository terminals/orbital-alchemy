import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { loadConfig, resetConfig } from '../config.js';

// We need a real temp directory for loading config
describe('config', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orbital-config-test-'));
    resetConfig();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    resetConfig();
  });

  describe('loadConfig', () => {
    it('returns defaults when no config file exists', () => {
      const config = loadConfig(tmpDir);
      expect(config.projectRoot).toBe(tmpDir);
      expect(config.serverPort).toBe(4444);
      expect(config.clientPort).toBe(4445);
      expect(config.logLevel).toBe('info');
    });

    it('derives project name from directory basename', () => {
      const projectDir = path.join(tmpDir, 'my-cool-project');
      fs.mkdirSync(projectDir, { recursive: true });
      const config = loadConfig(projectDir);
      expect(config.projectName).toBe('My Cool Project');
    });

    it('resolves scopesDir relative to project root', () => {
      const config = loadConfig(tmpDir);
      expect(config.scopesDir).toBe(path.resolve(tmpDir, 'scopes'));
    });

    it('resolves eventsDir relative to project root', () => {
      const config = loadConfig(tmpDir);
      expect(config.eventsDir).toBe(path.resolve(tmpDir, '.claude/orbital-events'));
    });

    it('loads user config when present', () => {
      const claudeDir = path.join(tmpDir, '.claude');
      fs.mkdirSync(claudeDir, { recursive: true });
      fs.writeFileSync(
        path.join(claudeDir, 'orbital.config.json'),
        JSON.stringify({ projectName: 'Custom Project', serverPort: 5555 }),
      );

      const config = loadConfig(tmpDir);
      expect(config.projectName).toBe('Custom Project');
      expect(config.serverPort).toBe(5555);
    });

    it('handles malformed JSON gracefully', () => {
      const claudeDir = path.join(tmpDir, '.claude');
      fs.mkdirSync(claudeDir, { recursive: true });
      fs.writeFileSync(path.join(claudeDir, 'orbital.config.json'), '{invalid json!}');

      // Should not throw, returns defaults
      const config = loadConfig(tmpDir);
      expect(config.serverPort).toBe(4444);
    });

    it('merges partial config with defaults', () => {
      const claudeDir = path.join(tmpDir, '.claude');
      fs.mkdirSync(claudeDir, { recursive: true });
      fs.writeFileSync(
        path.join(claudeDir, 'orbital.config.json'),
        JSON.stringify({ logLevel: 'debug' }),
      );

      const config = loadConfig(tmpDir);
      expect(config.logLevel).toBe('debug');
      // Other fields should be defaults
      expect(config.serverPort).toBe(4444);
      expect(config.clientPort).toBe(4445);
    });

    it('merges terminal config', () => {
      const claudeDir = path.join(tmpDir, '.claude');
      fs.mkdirSync(claudeDir, { recursive: true });
      fs.writeFileSync(
        path.join(claudeDir, 'orbital.config.json'),
        JSON.stringify({ terminal: { adapter: 'iterm2' } }),
      );

      const config = loadConfig(tmpDir);
      expect(config.terminal.adapter).toBe('iterm2');
      expect(config.terminal.profilePrefix).toBe('Orbital'); // default
    });

    it('merges commands config', () => {
      const claudeDir = path.join(tmpDir, '.claude');
      fs.mkdirSync(claudeDir, { recursive: true });
      fs.writeFileSync(
        path.join(claudeDir, 'orbital.config.json'),
        JSON.stringify({ commands: { typeCheck: 'tsc --noEmit' } }),
      );

      const config = loadConfig(tmpDir);
      expect(config.commands.typeCheck).toBe('tsc --noEmit');
      expect(config.commands.lint).toBeNull(); // default
    });

    it('includes default categories', () => {
      const config = loadConfig(tmpDir);
      expect(config.categories).toEqual(['feature', 'bugfix', 'refactor', 'infrastructure', 'docs']);
    });

    it('includes default agents', () => {
      const config = loadConfig(tmpDir);
      expect(config.agents).toHaveLength(5);
      expect(config.agents[0].id).toBe('attacker');
    });

    it('respects ORBITAL_TELEMETRY=false environment variable', () => {
      const prev = process.env.ORBITAL_TELEMETRY;
      process.env.ORBITAL_TELEMETRY = 'false';
      try {
        const config = loadConfig(tmpDir);
        expect(config.telemetry.enabled).toBe(false);
      } finally {
        if (prev !== undefined) process.env.ORBITAL_TELEMETRY = prev;
        else delete process.env.ORBITAL_TELEMETRY;
      }
    });
  });
});
