import { describe, it, expect, afterEach } from 'vitest';
import { parseEventFile } from './event-parser.js';
import fs from 'fs';
import os from 'os';
import path from 'path';

describe('parseEventFile', () => {
  let tmpFile: string;

  function writeEvent(data: Record<string, unknown>): string {
    tmpFile = path.join(os.tmpdir(), `test-event-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
    fs.writeFileSync(tmpFile, JSON.stringify(data));
    return tmpFile;
  }

  afterEach(() => {
    if (tmpFile && fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
  });

  // ─── Full format parsing ─────────────────────────────────

  describe('full format (top-level fields)', () => {
    it('extracts all fields correctly', () => {
      const file = writeEvent({
        id: 'evt-1', type: 'SCOPE_STATUS_CHANGED', scope_id: 42,
        session_id: 'sess-abc', agent: 'architect',
        data: { from: 'backlog', to: 'implementing' },
        timestamp: '2026-04-08T10:00:00Z',
      });
      const result = parseEventFile(file);
      expect(result).not.toBeNull();
      expect(result!.id).toBe('evt-1');
      expect(result!.type).toBe('SCOPE_STATUS_CHANGED');
      expect(result!.scope_id).toBe(42);
      expect(result!.session_id).toBe('sess-abc');
      expect(result!.agent).toBe('architect');
      expect(result!.data).toEqual({ from: 'backlog', to: 'implementing' });
    });

    it('preserves data payload as-is', () => {
      const file = writeEvent({
        id: 'evt-2', type: 'CUSTOM', timestamp: '2026-04-08T10:00:00Z',
        data: { nested: { deep: true }, arr: [1, 2, 3] },
      });
      const result = parseEventFile(file)!;
      expect(result.data).toEqual({ nested: { deep: true }, arr: [1, 2, 3] });
    });
  });

  // ─── Minimal format parsing ──────────────────────────────

  describe('minimal format (fields in data)', () => {
    it('extracts scope_id and session_id from data', () => {
      const file = writeEvent({
        id: 'evt-3', type: 'AGENT_STARTED', timestamp: '2026-04-08T10:00:00Z',
        data: { scope_id: 99, session_id: 'sess-xyz' },
      });
      const result = parseEventFile(file)!;
      expect(result.scope_id).toBe(99);
      expect(result.session_id).toBe('sess-xyz');
    });

    it('extracts agent from data.agents[0]', () => {
      const file = writeEvent({
        id: 'evt-4', type: 'AGENT_COMPLETED', timestamp: '2026-04-08T10:00:00Z',
        data: { agents: ['attacker', 'chaos'] },
      });
      const result = parseEventFile(file)!;
      expect(result.agent).toBe('attacker');
    });
  });

  // ─── Field fallback priority ─────────────────────────────

  describe('field fallback priority', () => {
    it('top-level scope_id wins over data.scope_id', () => {
      const file = writeEvent({
        id: 'evt-5', type: 'TEST', timestamp: 'now',
        scope_id: 10, data: { scope_id: 20 },
      });
      expect(parseEventFile(file)!.scope_id).toBe(10);
    });

    it('top-level agent wins over data.agent', () => {
      const file = writeEvent({
        id: 'evt-6', type: 'TEST', timestamp: 'now',
        agent: 'top', data: { agent: 'nested' },
      });
      expect(parseEventFile(file)!.agent).toBe('top');
    });

    it('data.agent wins over data.agents[0]', () => {
      const file = writeEvent({
        id: 'evt-7', type: 'TEST', timestamp: 'now',
        data: { agent: 'single', agents: ['array-first'] },
      });
      expect(parseEventFile(file)!.agent).toBe('single');
    });
  });

  // ─── Edge cases ──────────────────────────────────────────

  describe('edge cases', () => {
    it('empty string scope_id falls through to data', () => {
      const file = writeEvent({
        id: 'evt-8', type: 'TEST', timestamp: 'now',
        scope_id: '', data: { scope_id: 42 },
      });
      expect(parseEventFile(file)!.scope_id).toBe(42);
    });

    it('null scope_id with no data fallback returns null', () => {
      const file = writeEvent({
        id: 'evt-9', type: 'TEST', timestamp: 'now',
        scope_id: null, data: {},
      });
      expect(parseEventFile(file)!.scope_id).toBeNull();
    });

    it('returns null for malformed JSON', () => {
      tmpFile = path.join(os.tmpdir(), `test-bad-${Date.now()}.json`);
      fs.writeFileSync(tmpFile, '{ not valid json');
      expect(parseEventFile(tmpFile)).toBeNull();
    });

    it('returns null for missing required fields', () => {
      const file = writeEvent({ id: 'evt-10' }); // missing type and timestamp
      expect(parseEventFile(file)).toBeNull();
    });

    it('returns null for non-existent file', () => {
      expect(parseEventFile('/tmp/nonexistent-event-file.json')).toBeNull();
    });
  });
});
