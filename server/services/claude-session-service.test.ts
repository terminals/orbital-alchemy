import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Mock config to return our test sessions dir
let testSessionsDir: string;
vi.mock('../config.js', () => ({
  getClaudeSessionsDir: () => testSessionsDir,
}));

import { getSessionStats } from './claude-session-service.js';

describe('claude-session-service', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-session-test-'));
    testSessionsDir = tmpDir;
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeSession(sessionId: string, lines: string[]): void {
    const filePath = path.join(tmpDir, `${sessionId}.jsonl`);
    fs.writeFileSync(filePath, lines.join('\n') + '\n', 'utf-8');
  }

  // ─── getSessionStats() ──────────────────────────────────────

  describe('getSessionStats()', () => {
    it('returns null for non-existent session', () => {
      const result = getSessionStats('nonexistent', '/fake/root');
      expect(result).toBeNull();
    });

    it('parses valid JSONL lines and counts types', () => {
      writeSession('sess-1', [
        JSON.stringify({ type: 'user', timestamp: '2026-01-01T10:00:00Z', message: { content: 'hello' } }),
        JSON.stringify({ type: 'assistant', timestamp: '2026-01-01T10:01:00Z', message: { model: 'claude-opus-4-20250514', content: [], usage: { input_tokens: 100, output_tokens: 50 } } }),
        JSON.stringify({ type: 'system', timestamp: '2026-01-01T10:02:00Z', subtype: 'init', durationMs: 500 }),
      ]);

      const stats = getSessionStats('sess-1', '/fake/root');
      expect(stats).not.toBeNull();
      expect(stats!.typeCounts['user']).toBe(1);
      expect(stats!.typeCounts['assistant']).toBe(1);
      expect(stats!.typeCounts['system']).toBe(1);
    });

    it('computes user stats', () => {
      writeSession('sess-2', [
        JSON.stringify({ type: 'user', timestamp: '2026-01-01T10:00:00Z', message: { content: 'hello' }, cwd: '/project', version: '1.0.0', permissionMode: 'bypass' }),
        JSON.stringify({ type: 'user', timestamp: '2026-01-01T10:01:00Z', isMeta: true, message: { content: 'meta command' } }),
        JSON.stringify({ type: 'user', timestamp: '2026-01-01T10:02:00Z', toolUseResult: true, message: { content: 'result' } }),
        JSON.stringify({ type: 'user', timestamp: '2026-01-01T10:03:00Z', message: { content: '<command-name>/scope-implement</command-name><command-args>1</command-args>' } }),
      ]);

      const stats = getSessionStats('sess-2', '/fake/root');
      expect(stats!.user.totalMessages).toBe(4);
      expect(stats!.user.metaMessages).toBe(1);
      expect(stats!.user.toolResults).toBe(1);
      expect(stats!.user.cwd).toBe('/project');
      expect(stats!.user.version).toBe('1.0.0');
      expect(stats!.user.permissionModes).toEqual(['bypass']);
      expect(stats!.user.commands).toEqual(['/scope-implement']);
    });

    it('computes assistant stats with token usage', () => {
      writeSession('sess-3', [
        JSON.stringify({
          type: 'assistant',
          timestamp: '2026-01-01T10:00:00Z',
          message: {
            model: 'claude-opus-4-20250514',
            content: [
              { type: 'tool_use', name: 'Read' },
              { type: 'tool_use', name: 'Write' },
              { type: 'tool_use', name: 'Read' },
            ],
            usage: {
              input_tokens: 1000,
              output_tokens: 500,
              cache_read_input_tokens: 200,
              cache_creation_input_tokens: 100,
            },
          },
        }),
        JSON.stringify({
          type: 'assistant',
          timestamp: '2026-01-01T10:05:00Z',
          message: {
            model: 'claude-opus-4-20250514',
            content: [{ type: 'tool_use', name: 'Bash' }],
            usage: { input_tokens: 500, output_tokens: 250 },
          },
        }),
      ]);

      const stats = getSessionStats('sess-3', '/fake/root');
      expect(stats!.assistant.totalMessages).toBe(2);
      expect(stats!.assistant.models).toEqual(['claude-opus-4-20250514']);
      expect(stats!.assistant.totalInputTokens).toBe(1500);
      expect(stats!.assistant.totalOutputTokens).toBe(750);
      expect(stats!.assistant.totalCacheReadTokens).toBe(200);
      expect(stats!.assistant.totalCacheCreationTokens).toBe(100);
      expect(stats!.assistant.toolsUsed).toEqual({ Read: 2, Write: 1, Bash: 1 });
    });

    it('computes system stats', () => {
      writeSession('sess-4', [
        JSON.stringify({ type: 'system', timestamp: '2026-01-01T10:00:00Z', subtype: 'init', stopReason: 'end_turn', durationMs: 1000, hookCount: 2, hookErrors: 0 }),
        JSON.stringify({ type: 'system', timestamp: '2026-01-01T10:05:00Z', subtype: 'turn', stopReason: 'tool_use', durationMs: 3000, hookCount: 1, hookErrors: 1 }),
      ]);

      const stats = getSessionStats('sess-4', '/fake/root');
      expect(stats!.system.totalMessages).toBe(2);
      expect(stats!.system.subtypes).toContain('init');
      expect(stats!.system.subtypes).toContain('turn');
      expect(stats!.system.stopReasons).toContain('end_turn');
      expect(stats!.system.stopReasons).toContain('tool_use');
      expect(stats!.system.totalDurationMs).toBe(4000);
      expect(stats!.system.hookCount).toBe(3);
      expect(stats!.system.hookErrors).toBe(1);
    });

    it('computes progress line count', () => {
      writeSession('sess-5', [
        JSON.stringify({ type: 'progress', timestamp: '2026-01-01T10:00:00Z' }),
        JSON.stringify({ type: 'progress', timestamp: '2026-01-01T10:00:01Z' }),
        JSON.stringify({ type: 'progress', timestamp: '2026-01-01T10:00:02Z' }),
      ]);

      const stats = getSessionStats('sess-5', '/fake/root');
      expect(stats!.progress.totalLines).toBe(3);
    });

    it('computes session duration from first and last timestamps', () => {
      writeSession('sess-6', [
        JSON.stringify({ type: 'user', timestamp: '2026-01-01T10:00:00Z', message: { content: 'start' } }),
        JSON.stringify({ type: 'assistant', timestamp: '2026-01-01T10:30:00Z', message: {} }),
      ]);

      const stats = getSessionStats('sess-6', '/fake/root');
      expect(stats!.timing.firstTimestamp).toBe('2026-01-01T10:00:00Z');
      expect(stats!.timing.lastTimestamp).toBe('2026-01-01T10:30:00Z');
      expect(stats!.timing.durationMs).toBe(30 * 60 * 1000);
    });

    it('skips malformed JSONL lines without crashing', () => {
      writeSession('sess-7', [
        'this is not json',
        '{ bad json: }',
        JSON.stringify({ type: 'user', timestamp: '2026-01-01T10:00:00Z', message: { content: 'valid' } }),
        '  ',
        JSON.stringify({ type: 'assistant', timestamp: '2026-01-01T10:01:00Z', message: {} }),
      ]);

      const stats = getSessionStats('sess-7', '/fake/root');
      expect(stats).not.toBeNull();
      expect(stats!.user.totalMessages).toBe(1);
      expect(stats!.assistant.totalMessages).toBe(1);
    });

    it('handles empty session file', () => {
      writeSession('sess-8', ['']);

      const stats = getSessionStats('sess-8', '/fake/root');
      expect(stats).not.toBeNull();
      expect(stats!.user.totalMessages).toBe(0);
      expect(stats!.assistant.totalMessages).toBe(0);
      expect(stats!.timing.durationMs).toBe(0);
    });

    it('handles session with no tool usage', () => {
      writeSession('sess-9', [
        JSON.stringify({ type: 'assistant', timestamp: '2026-01-01T10:00:00Z', message: { content: 'just text', usage: { input_tokens: 50, output_tokens: 25 } } }),
      ]);

      const stats = getSessionStats('sess-9', '/fake/root');
      expect(stats!.assistant.toolsUsed).toEqual({});
      expect(stats!.assistant.totalInputTokens).toBe(50);
    });

    it('handles lines without timestamps', () => {
      writeSession('sess-10', [
        JSON.stringify({ type: 'user', message: { content: 'no ts' } }),
      ]);

      const stats = getSessionStats('sess-10', '/fake/root');
      expect(stats!.timing.firstTimestamp).toBeNull();
      expect(stats!.timing.lastTimestamp).toBeNull();
      expect(stats!.timing.durationMs).toBe(0);
    });

    it('deduplicates model names and permission modes', () => {
      writeSession('sess-11', [
        JSON.stringify({ type: 'user', timestamp: '2026-01-01T10:00:00Z', permissionMode: 'bypass', message: { content: '' } }),
        JSON.stringify({ type: 'user', timestamp: '2026-01-01T10:01:00Z', permissionMode: 'bypass', message: { content: '' } }),
        JSON.stringify({ type: 'assistant', timestamp: '2026-01-01T10:02:00Z', message: { model: 'claude-opus-4-20250514', usage: {} } }),
        JSON.stringify({ type: 'assistant', timestamp: '2026-01-01T10:03:00Z', message: { model: 'claude-opus-4-20250514', usage: {} } }),
      ]);

      const stats = getSessionStats('sess-11', '/fake/root');
      expect(stats!.user.permissionModes).toEqual(['bypass']);
      expect(stats!.assistant.models).toEqual(['claude-opus-4-20250514']);
    });

    it('extracts multiple unique slash commands', () => {
      writeSession('sess-12', [
        JSON.stringify({ type: 'user', timestamp: '2026-01-01T10:00:00Z', message: { content: '<command-name>/scope-implement</command-name>' } }),
        JSON.stringify({ type: 'user', timestamp: '2026-01-01T10:01:00Z', message: { content: '<command-name>/git-commit</command-name>' } }),
        JSON.stringify({ type: 'user', timestamp: '2026-01-01T10:02:00Z', message: { content: '<command-name>/scope-implement</command-name>' } }),
      ]);

      const stats = getSessionStats('sess-12', '/fake/root');
      expect(stats!.user.commands).toEqual(['/scope-implement', '/git-commit']);
    });
  });
});
