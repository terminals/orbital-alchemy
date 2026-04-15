import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  syncSettingsHooks,
  removeAllOrbitalHooks,
  validateHookPaths,
  getTemplateChecksum,
} from '../settings-sync.js';

describe('settings-sync', () => {
  let tmpDir: string;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orbital-settings-sync-'));
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  /** Create a settings-hooks.json template file. */
  function writeTemplate(
    name: string,
    hooks: Record<string, Array<{ matcher?: string; hooks: Array<{ type?: string; command: string; _orbital?: boolean }> }>>,
  ): string {
    const dir = path.join(tmpDir, name);
    fs.mkdirSync(dir, { recursive: true });
    const filePath = path.join(dir, 'settings-hooks.json');
    fs.writeFileSync(filePath, JSON.stringify({ hooks }, null, 2) + '\n', 'utf8');
    return filePath;
  }

  /** Create a settings.local.json file. */
  function writeSettings(
    name: string,
    content: Record<string, unknown>,
  ): string {
    const dir = path.join(tmpDir, name);
    fs.mkdirSync(dir, { recursive: true });
    const filePath = path.join(dir, 'settings.local.json');
    fs.writeFileSync(filePath, JSON.stringify(content, null, 2) + '\n', 'utf8');
    return filePath;
  }

  /** Read a settings file back as parsed JSON. */
  function readSettings(filePath: string): Record<string, unknown> {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  }

  // ─── syncSettingsHooks ────────────────────────────────────

  describe('syncSettingsHooks()', () => {
    it('returns skipped=true when template does not exist', () => {
      const settingsPath = path.join(tmpDir, 'no-template', 'settings.local.json');
      const result = syncSettingsHooks(settingsPath, '/nonexistent/path', '', undefined);
      expect(result.skipped).toBe(true);
      expect(result.added).toBe(0);
    });

    it('returns skipped=true when template checksum has not changed', () => {
      const templatePath = writeTemplate('no-change', {
        PreToolUse: [{ hooks: [{ command: 'echo test', _orbital: true }] }],
      });
      const settingsPath = writeSettings('no-change', {});
      const checksum = getTemplateChecksum(templatePath);

      const result = syncSettingsHooks(settingsPath, templatePath, checksum, undefined);
      expect(result.skipped).toBe(true);
    });

    it('adds new hooks from template to empty settings', () => {
      const templatePath = writeTemplate('add-hooks', {
        PreToolUse: [{
          hooks: [
            { type: 'command', command: '"$CLAUDE_PROJECT_DIR"/.claude/hooks/pre-tool.sh' },
          ],
        }],
      });
      const settingsPath = writeSettings('add-hooks', {});

      const result = syncSettingsHooks(settingsPath, templatePath, '', undefined);
      expect(result.skipped).toBe(false);
      expect(result.added).toBe(1);

      const settings = readSettings(settingsPath) as { hooks?: Record<string, unknown> };
      expect(settings.hooks).toBeDefined();
      const preToolUse = (settings.hooks as Record<string, Array<{ hooks?: Array<{ command: string; _orbital?: boolean }> }>>).PreToolUse;
      expect(preToolUse).toBeDefined();
      expect(preToolUse[0].hooks?.[0].command).toContain('pre-tool.sh');
      expect(preToolUse[0].hooks?.[0]._orbital).toBe(true);
    });

    it('preserves user hooks while adding orbital hooks', () => {
      const templatePath = writeTemplate('preserve-user', {
        PreToolUse: [{
          hooks: [
            { type: 'command', command: '"$CLAUDE_PROJECT_DIR"/.claude/hooks/orbital.sh' },
          ],
        }],
      });
      const settingsPath = writeSettings('preserve-user', {
        hooks: {
          PreToolUse: [{
            hooks: [
              { type: 'command', command: 'echo user-hook' },
            ],
          }],
        },
      });

      const result = syncSettingsHooks(settingsPath, templatePath, '', undefined);
      expect(result.added).toBe(1);

      const settings = readSettings(settingsPath) as { hooks: Record<string, Array<{ hooks: Array<{ command: string; _orbital?: boolean }> }>> };
      const hooks = settings.hooks.PreToolUse[0].hooks;
      // User hook preserved
      expect(hooks.some(h => h.command === 'echo user-hook')).toBe(true);
      // Orbital hook added
      expect(hooks.some(h => h.command.includes('orbital.sh') && h._orbital)).toBe(true);
    });

    it('removes stale orbital hooks not in template', () => {
      // Template has only hook-b, settings has hook-a (orbital) and hook-b (orbital)
      const templatePath = writeTemplate('remove-stale', {
        PostToolUse: [{
          hooks: [
            { command: 'hook-b' },
          ],
        }],
      });
      const settingsPath = writeSettings('remove-stale', {
        hooks: {
          PostToolUse: [{
            hooks: [
              { command: 'hook-a', _orbital: true },
              { command: 'hook-b', _orbital: true },
            ],
          }],
        },
      });

      const result = syncSettingsHooks(settingsPath, templatePath, '', undefined);
      expect(result.removed).toBe(1); // hook-a removed

      const settings = readSettings(settingsPath) as { hooks: Record<string, Array<{ hooks: Array<{ command: string }> }>> };
      const hooks = settings.hooks.PostToolUse[0].hooks;
      expect(hooks.some(h => h.command === 'hook-a')).toBe(false);
      expect(hooks.some(h => h.command === 'hook-b')).toBe(true);
    });

    it('applies command renames from file rename map', () => {
      const templatePath = writeTemplate('rename-cmds', {
        PreToolUse: [{
          hooks: [
            { command: '"$CLAUDE_PROJECT_DIR"/.claude/hooks/renamed.sh' },
          ],
        }],
      });
      const settingsPath = writeSettings('rename-cmds', {
        hooks: {
          PreToolUse: [{
            hooks: [
              { command: '"$CLAUDE_PROJECT_DIR"/.claude/hooks/old-name.sh', _orbital: true },
            ],
          }],
        },
      });

      const renameMap = new Map([['hooks/old-name.sh', 'hooks/renamed.sh']]);
      const result = syncSettingsHooks(settingsPath, templatePath, '', renameMap);

      expect(result.updated).toBe(1);
      const settings = readSettings(settingsPath) as { hooks: Record<string, Array<{ hooks: Array<{ command: string }> }>> };
      const cmd = settings.hooks.PreToolUse[0].hooks[0].command;
      expect(cmd).toContain('renamed.sh');
    });

    it('handles malformed settings file gracefully', () => {
      const templatePath = writeTemplate('malformed-settings', {
        PreToolUse: [{
          hooks: [{ command: 'echo test' }],
        }],
      });
      const dir = path.join(tmpDir, 'malformed-settings');
      const settingsPath = path.join(dir, 'settings.local.json');
      fs.writeFileSync(settingsPath, 'not-json!!!', 'utf8');

      const result = syncSettingsHooks(settingsPath, templatePath, '', undefined);
      expect(result.added).toBe(1);
      expect(result.skipped).toBe(false);
    });

    it('creates settings from scratch when file does not exist', () => {
      const templatePath = writeTemplate('new-settings', {
        PreToolUse: [{
          hooks: [{ command: 'echo new' }],
        }],
      });
      const dir = path.join(tmpDir, 'new-settings');
      fs.mkdirSync(dir, { recursive: true });
      const settingsPath = path.join(dir, 'settings.local.json');

      const result = syncSettingsHooks(settingsPath, templatePath, '', undefined);
      expect(result.added).toBe(1);
      expect(fs.existsSync(settingsPath)).toBe(true);
    });

    it('cleans up empty hook groups after removal', () => {
      const templatePath = writeTemplate('cleanup-empty', {
        // Template has no hooks in PostToolUse
      });
      const settingsPath = writeSettings('cleanup-empty', {
        hooks: {
          PostToolUse: [{
            hooks: [
              { command: 'old-cmd', _orbital: true },
            ],
          }],
        },
      });

      syncSettingsHooks(settingsPath, templatePath, '', undefined);

      const settings = readSettings(settingsPath) as { hooks?: Record<string, unknown> };
      // The PostToolUse event should be cleaned up since all hooks were removed
      if (settings.hooks) {
        expect(settings.hooks).not.toHaveProperty('PostToolUse');
      }
    });

    it('does not duplicate existing hooks', () => {
      const templatePath = writeTemplate('no-dup', {
        PreToolUse: [{
          hooks: [{ command: 'existing-cmd' }],
        }],
      });
      const settingsPath = writeSettings('no-dup', {
        hooks: {
          PreToolUse: [{
            hooks: [
              { command: 'existing-cmd', _orbital: true },
            ],
          }],
        },
      });

      const result = syncSettingsHooks(settingsPath, templatePath, '', undefined);
      // Should not add since it already exists
      expect(result.added).toBe(0);
    });
  });

  // ─── removeAllOrbitalHooks ────────────────────────────────

  describe('removeAllOrbitalHooks()', () => {
    it('removes all orbital hooks while preserving user hooks', () => {
      const settingsPath = writeSettings('remove-all', {
        hooks: {
          PreToolUse: [{
            hooks: [
              { command: 'orbital-hook', _orbital: true },
              { command: 'user-hook' },
            ],
          }],
          PostToolUse: [{
            hooks: [
              { command: 'another-orbital', _orbital: true },
            ],
          }],
        },
      });

      const removed = removeAllOrbitalHooks(settingsPath);
      expect(removed).toBe(2);

      const settings = readSettings(settingsPath) as { hooks?: Record<string, Array<{ hooks: Array<{ command: string }> }>> };
      // User hook preserved
      expect(settings.hooks?.PreToolUse[0].hooks.some(h => h.command === 'user-hook')).toBe(true);
      // PostToolUse should be cleaned up (empty after removal)
      expect(settings.hooks?.PostToolUse).toBeUndefined();
    });

    it('returns 0 when settings file does not exist', () => {
      const result = removeAllOrbitalHooks(path.join(tmpDir, 'nonexistent', 'settings.json'));
      expect(result).toBe(0);
    });

    it('returns 0 when settings has no hooks', () => {
      const settingsPath = writeSettings('no-hooks', {
        someOtherKey: true,
      });
      const result = removeAllOrbitalHooks(settingsPath);
      expect(result).toBe(0);
    });
  });

  // ─── validateHookPaths ────────────────────────────────────

  describe('validateHookPaths()', () => {
    it('returns empty array when settings file does not exist', () => {
      const result = validateHookPaths('/nonexistent/settings.json', tmpDir);
      expect(result).toEqual([]);
    });

    it('returns empty array when no hooks section exists', () => {
      const settingsPath = writeSettings('no-hooks-section', { other: 1 });
      const result = validateHookPaths(settingsPath, tmpDir);
      expect(result).toEqual([]);
    });

    it('detects broken hook paths', () => {
      const projectRoot = path.join(tmpDir, 'broken-paths-project');
      fs.mkdirSync(projectRoot, { recursive: true });

      const settingsPath = writeSettings('broken-paths', {
        hooks: {
          PreToolUse: [{
            hooks: [
              { command: '"$CLAUDE_PROJECT_DIR"/.claude/hooks/nonexistent.sh', _orbital: true },
            ],
          }],
        },
      });

      const result = validateHookPaths(settingsPath, projectRoot);
      expect(result.length).toBe(1);
      expect(result[0]).toContain('nonexistent.sh');
    });

    it('returns empty when all hook paths resolve', () => {
      const projectRoot = path.join(tmpDir, 'valid-paths-project');
      fs.mkdirSync(path.join(projectRoot, '.claude', 'hooks'), { recursive: true });
      fs.writeFileSync(
        path.join(projectRoot, '.claude', 'hooks', 'valid.sh'),
        '#!/bin/bash\necho hi',
        'utf8',
      );

      const settingsPath = writeSettings('valid-paths', {
        hooks: {
          PreToolUse: [{
            hooks: [
              { command: '"$CLAUDE_PROJECT_DIR"/.claude/hooks/valid.sh', _orbital: true },
            ],
          }],
        },
      });

      const result = validateHookPaths(settingsPath, projectRoot);
      expect(result).toHaveLength(0);
    });

    it('only checks _orbital hooks, ignores user hooks', () => {
      const projectRoot = path.join(tmpDir, 'user-hooks-project');
      fs.mkdirSync(projectRoot, { recursive: true });

      const settingsPath = writeSettings('user-hooks-only', {
        hooks: {
          PreToolUse: [{
            hooks: [
              { command: 'some-user-cmd-that-does-not-resolve' },
            ],
          }],
        },
      });

      const result = validateHookPaths(settingsPath, projectRoot);
      expect(result).toHaveLength(0);
    });
  });

  // ─── getTemplateChecksum ──────────────────────────────────

  describe('getTemplateChecksum()', () => {
    it('returns empty string when template does not exist', () => {
      expect(getTemplateChecksum('/nonexistent/template.json')).toBe('');
    });

    it('returns a hex hash string for existing template', () => {
      const templatePath = writeTemplate('checksum-test', {
        PreToolUse: [{ hooks: [{ command: 'echo test' }] }],
      });
      const checksum = getTemplateChecksum(templatePath);
      expect(checksum).toMatch(/^[0-9a-f]+$/);
      expect(checksum.length).toBe(16);
    });

    it('returns different checksums for different content', () => {
      const path1 = writeTemplate('checksum-a', {
        PreToolUse: [{ hooks: [{ command: 'echo a' }] }],
      });
      const path2 = writeTemplate('checksum-b', {
        PreToolUse: [{ hooks: [{ command: 'echo b' }] }],
      });
      expect(getTemplateChecksum(path1)).not.toBe(getTemplateChecksum(path2));
    });
  });
});
