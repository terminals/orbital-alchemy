import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventService } from './event-service.js';
import { createTestDb } from '../__tests__/helpers/db.js';
import { createMockEmitter } from '../__tests__/helpers/mock-emitter.js';
import type Database from 'better-sqlite3';
import type { Emitter } from '../project-emitter.js';

describe('EventService', () => {
  let db: Database.Database;
  let cleanup: () => void;
  let emitter: Emitter & { emit: ReturnType<typeof vi.fn> };
  let service: EventService;

  beforeEach(() => {
    ({ db, cleanup } = createTestDb());
    emitter = createMockEmitter();
    service = new EventService(db, emitter);
  });

  afterEach(() => {
    cleanup?.();
  });

  const makeEvent = (overrides: Record<string, unknown> = {}) => ({
    id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    type: 'TEST_EVENT',
    scope_id: 1,
    session_id: 'sess-1',
    agent: 'test-agent',
    data: {},
    timestamp: new Date().toISOString(),
    ...overrides,
  });

  // ─── ingest() ───────────────────────────────────────────────

  describe('ingest()', () => {
    it('inserts event into DB and emits event:new', () => {
      const event = makeEvent();
      service.ingest(event);

      const row = db.prepare('SELECT * FROM events WHERE id = ?').get(event.id) as Record<string, unknown>;
      expect(row).toBeDefined();
      expect(row.type).toBe('TEST_EVENT');

      expect(emitter.emit).toHaveBeenCalledWith('event:new', expect.objectContaining({
        id: event.id,
        type: 'TEST_EVENT',
      }));
    });

    it('skips duplicate events (no emit)', () => {
      const event = makeEvent();
      service.ingest(event);
      emitter.emit.mockClear();

      service.ingest(event); // same id
      expect(emitter.emit).not.toHaveBeenCalled();
    });

    it('calls registered onIngest callbacks', () => {
      const callback = vi.fn();
      service.onIngest(callback);

      const event = makeEvent({ type: 'SCOPE_STATUS_CHANGED', data: { to: 'review' } });
      service.ingest(event);

      expect(callback).toHaveBeenCalledWith('SCOPE_STATUS_CHANGED', 1, { to: 'review' });
    });

    it('handles null optional fields', () => {
      const event = makeEvent({ scope_id: undefined, session_id: undefined, agent: undefined });
      service.ingest(event);

      const row = db.prepare('SELECT * FROM events WHERE id = ?').get(event.id) as Record<string, unknown>;
      expect(row.scope_id).toBeNull();
      expect(row.session_id).toBeNull();
      expect(row.agent).toBeNull();
    });
  });

  // ─── getRecent() ────────────────────────────────────────────

  describe('getRecent()', () => {
    it('returns events ordered by timestamp DESC with limit', () => {
      for (let i = 0; i < 5; i++) {
        service.ingest(makeEvent({ id: `evt-${i}`, timestamp: `2026-01-0${i + 1}T00:00:00Z` }));
      }

      const recent = service.getRecent(3);
      expect(recent).toHaveLength(3);
      expect(recent[0].timestamp).toBe('2026-01-05T00:00:00Z');
    });

    it('filters by type when provided', () => {
      service.ingest(makeEvent({ id: 'a', type: 'TYPE_A' }));
      service.ingest(makeEvent({ id: 'b', type: 'TYPE_B' }));
      service.ingest(makeEvent({ id: 'c', type: 'TYPE_A' }));

      const result = service.getRecent(50, 'TYPE_A');
      expect(result).toHaveLength(2);
      expect(result.every(r => r.type === 'TYPE_A')).toBe(true);
    });
  });

  // ─── getFiltered() ──────────────────────────────────────────

  describe('getFiltered()', () => {
    beforeEach(() => {
      service.ingest(makeEvent({ id: 'f1', type: 'A', scope_id: 1 }));
      service.ingest(makeEvent({ id: 'f2', type: 'B', scope_id: 1 }));
      service.ingest(makeEvent({ id: 'f3', type: 'A', scope_id: 2 }));
    });

    it('filters by type', () => {
      const result = service.getFiltered({ type: 'A' });
      expect(result).toHaveLength(2);
    });

    it('filters by scopeId', () => {
      const result = service.getFiltered({ scopeId: 2 });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('f3');
    });

    it('combines type + scopeId', () => {
      const result = service.getFiltered({ type: 'A', scopeId: 1 });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('f1');
    });
  });

  // ─── getByAgent() / getByScope() ───────────────────────────

  describe('getByAgent()', () => {
    it('filters by agent name', () => {
      service.ingest(makeEvent({ id: 'a1', agent: 'attacker' }));
      service.ingest(makeEvent({ id: 'a2', agent: 'architect' }));
      service.ingest(makeEvent({ id: 'a3', agent: 'attacker' }));

      const result = service.getByAgent('attacker');
      expect(result).toHaveLength(2);
    });
  });

  describe('getByScope()', () => {
    it('filters by scope_id', () => {
      service.ingest(makeEvent({ id: 's1', scope_id: 42 }));
      service.ingest(makeEvent({ id: 's2', scope_id: 99 }));

      const result = service.getByScope(42);
      expect(result).toHaveLength(1);
    });
  });

  // ─── getViolationSummary() ──────────────────────────────────

  describe('getViolationSummary()', () => {
    it('returns zeros when no violation events exist', () => {
      const summary = service.getViolationSummary();
      expect(summary.totalViolations).toBe(0);
      expect(summary.totalOverrides).toBe(0);
      expect(summary.byRule).toEqual([]);
      expect(summary.byFile).toEqual([]);
    });

    it('aggregates violation data', () => {
      service.ingest(makeEvent({ id: 'v1', type: 'VIOLATION', data: { rule: 'no-todo', file: 'src/app.ts' } }));
      service.ingest(makeEvent({ id: 'v2', type: 'VIOLATION', data: { rule: 'no-todo', file: 'src/app.ts' } }));
      service.ingest(makeEvent({ id: 'v3', type: 'VIOLATION', data: { rule: 'no-mock', file: 'src/lib.ts' } }));
      service.ingest(makeEvent({ id: 'o1', type: 'OVERRIDE', data: { rule: 'no-todo', reason: 'legitimate use' } }));

      const summary = service.getViolationSummary();
      expect(summary.totalViolations).toBe(3);
      expect(summary.totalOverrides).toBe(1);
      expect(summary.byRule).toHaveLength(2);
      expect(summary.byRule[0].rule).toBe('no-todo');
      expect(summary.byRule[0].count).toBe(2);
      expect(summary.byFile).toHaveLength(2);
      expect(summary.overrides).toHaveLength(1);
    });
  });

  // ─── getViolationStatsByRule() ──────────────────────────────

  describe('getViolationStatsByRule()', () => {
    it('returns maps keyed by rule name', () => {
      service.ingest(makeEvent({ id: 'v1', type: 'VIOLATION', data: { rule: 'no-todo' } }));
      service.ingest(makeEvent({ id: 'o1', type: 'OVERRIDE', data: { rule: 'no-todo' } }));

      const stats = service.getViolationStatsByRule();
      expect(stats.violations.get('no-todo')?.count).toBe(1);
      expect(stats.overrides.get('no-todo')?.count).toBe(1);
    });
  });

  // ─── getViolationTrend() ────────────────────────────────────

  describe('getViolationTrend()', () => {
    it('returns violations grouped by day and rule', () => {
      service.ingest(makeEvent({ id: 'vt1', type: 'VIOLATION', data: { rule: 'no-todo' }, timestamp: '2026-04-01T10:00:00Z' }));
      service.ingest(makeEvent({ id: 'vt2', type: 'VIOLATION', data: { rule: 'no-todo' }, timestamp: '2026-04-01T14:00:00Z' }));
      service.ingest(makeEvent({ id: 'vt3', type: 'VIOLATION', data: { rule: 'no-mock' }, timestamp: '2026-04-02T10:00:00Z' }));

      const trend = service.getViolationTrend(365);
      expect(trend.length).toBeGreaterThanOrEqual(2);
      const day1 = trend.find(t => t.day === '2026-04-01' && t.rule === 'no-todo');
      expect(day1?.count).toBe(2);
    });

    it('returns empty array when no violations exist', () => {
      expect(service.getViolationTrend()).toEqual([]);
    });
  });

  // ─── getDeployFrequency() ───────────────────────────────────

  describe('getDeployFrequency()', () => {
    it('returns deployment counts grouped by week and environment', () => {
      const now = new Date();
      const ts = now.toISOString();
      // Insert deployments directly into the DB (EventService queries the deployments table)
      db.prepare(
        `INSERT INTO deployments (environment, status, commit_sha, branch, started_at, details) VALUES (?, ?, ?, ?, ?, ?)`
      ).run('staging', 'healthy', 'abc', 'main', ts, '{}');
      db.prepare(
        `INSERT INTO deployments (environment, status, commit_sha, branch, started_at, details) VALUES (?, ?, ?, ?, ?, ?)`
      ).run('production', 'healthy', 'def', 'main', ts, '{}');

      const freq = service.getDeployFrequency();
      expect(freq.length).toBeGreaterThanOrEqual(1);
      const week = freq[0];
      expect(week).toHaveProperty('week');
      expect(week).toHaveProperty('staging');
      expect(week).toHaveProperty('production');
    });

    it('returns empty array when no deployments exist', () => {
      expect(service.getDeployFrequency()).toEqual([]);
    });
  });
});
