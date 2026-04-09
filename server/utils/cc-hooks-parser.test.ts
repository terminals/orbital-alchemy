import { describe, it, expect, afterEach } from 'vitest';
import { parseCcHooks } from './cc-hooks-parser.js';
import fs from 'fs';
import os from 'os';
import path from 'path';

describe('parseCcHooks', () => {
  let tmpFile: string;

  function writeSettings(data: Record<string, unknown>): string {
    tmpFile = path.join(os.tmpdir(), `test-settings-${Date.now()}.json`);
    fs.writeFileSync(tmpFile, JSON.stringify(data));
    return tmpFile;
  }

  afterEach(() => {
    if (tmpFile && fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
  });

  it('parses all 4 event types', () => {
    const file = writeSettings({
      hooks: {
        SessionStart: [{ hooks: [{ type: 'command', command: '$CLAUDE_PROJECT_DIR/.claude/hooks/init.sh', statusMessage: 'Initializing' }] }],
        SessionEnd: [{ hooks: [{ type: 'command', command: '$CLAUDE_PROJECT_DIR/.claude/hooks/end.sh' }] }],
        PreToolUse: [{ matcher: 'Edit', hooks: [{ type: 'command', command: '$CLAUDE_PROJECT_DIR/.claude/hooks/guard.sh', statusMessage: 'Checking' }] }],
        PostToolUse: [{ hooks: [{ type: 'command', command: '$CLAUDE_PROJECT_DIR/.claude/hooks/log.sh' }] }],
      },
    });
    const hooks = parseCcHooks(file);
    expect(hooks).toHaveLength(4);
    expect(hooks.map(h => h.event)).toEqual(['SessionStart', 'SessionEnd', 'PreToolUse', 'PostToolUse']);
  });

  it('extracts script path stripping $CLAUDE_PROJECT_DIR', () => {
    const file = writeSettings({
      hooks: {
        SessionStart: [{ hooks: [{ type: 'command', command: '$CLAUDE_PROJECT_DIR/.claude/hooks/init-session.sh' }] }],
      },
    });
    const hooks = parseCcHooks(file);
    expect(hooks[0].scriptPath).toBe('.claude/hooks/init-session.sh');
    expect(hooks[0].scriptName).toBe('init-session.sh');
  });

  it('derives ID from script filename', () => {
    const file = writeSettings({
      hooks: {
        SessionStart: [{ hooks: [{ type: 'command', command: '$CLAUDE_PROJECT_DIR/.claude/hooks/init-session.sh' }] }],
      },
    });
    const hooks = parseCcHooks(file);
    expect(hooks[0].id).toBe('init-session');
  });

  it('extracts matcher from group', () => {
    const file = writeSettings({
      hooks: {
        PreToolUse: [{ matcher: 'Edit', hooks: [{ type: 'command', command: 'test.sh' }] }],
      },
    });
    const hooks = parseCcHooks(file);
    expect(hooks[0].matcher).toBe('Edit');
  });

  it('sets matcher to null when absent', () => {
    const file = writeSettings({
      hooks: {
        SessionStart: [{ hooks: [{ type: 'command', command: 'test.sh' }] }],
      },
    });
    const hooks = parseCcHooks(file);
    expect(hooks[0].matcher).toBeNull();
  });

  it('skips non-command entries', () => {
    const file = writeSettings({
      hooks: {
        SessionStart: [{ hooks: [
          { type: 'command', command: 'test.sh' },
          { type: 'url', command: 'https://example.com' },
        ] }],
      },
    });
    const hooks = parseCcHooks(file);
    expect(hooks).toHaveLength(1);
  });

  it('returns empty array for file not found', () => {
    expect(parseCcHooks('/tmp/nonexistent-settings.json')).toEqual([]);
  });

  it('returns empty array when no hooks key in settings', () => {
    const file = writeSettings({ other: 'config' });
    expect(parseCcHooks(file)).toEqual([]);
  });
});
