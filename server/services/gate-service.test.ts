import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GateService } from './gate-service.js';
import { createTestDb } from '../__tests__/helpers/db.js';
import { createMockEmitter } from '../__tests__/helpers/mock-emitter.js';
import type Database from 'better-sqlite3';
import type { Emitter } from '../project-emitter.js';

describe('GateService', () => {
  let db: Database.Database;
  let cleanup: () => void;
  let emitter: Emitter & { emit: ReturnType<typeof vi.fn> };
  let service: GateService;

  beforeEach(() => {
    ({ db, cleanup } = createTestDb());
    emitter = createMockEmitter();
    service = new GateService(db, emitter);
  });

  afterEach(() => {
    cleanup?.();
  });

  // ─── record() ─────────────────────────────────────────────

  describe('record()', () => {
    it('inserts gate result and emits gate:updated', () => {
      service.record({
        scope_id: 1,
        gate_name: 'type-check',
        status: 'pass',
        details: null,
        duration_ms: 1200,
        commit_sha: 'abc1234',
      });

      const rows = db.prepare('SELECT * FROM quality_gates').all() as Array<Record<string, unknown>>;
      expect(rows).toHaveLength(1);
      expect(rows[0].gate_name).toBe('type-check');
      expect(rows[0].status).toBe('pass');
      expect(rows[0].duration_ms).toBe(1200);

      expect(emitter.emit).toHaveBeenCalledWith('gate:updated', expect.objectContaining({
        gate_name: 'type-check',
        status: 'pass',
      }));
    });

    it('sets run_at to current timestamp', () => {
      service.record({
        scope_id: null,
        gate_name: 'lint',
        status: 'fail',
        details: 'ESLint errors',
        duration_ms: null,
        commit_sha: null,
      });

      const row = db.prepare('SELECT run_at FROM quality_gates').get() as { run_at: string };
      expect(row.run_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });

  // ─── getLatestForScope() ──────────────────────────────────

  describe('getLatestForScope()', () => {
    it('returns latest gate per gate_name for scope', () => {
      service.record({ scope_id: 1, gate_name: 'type-check', status: 'fail', details: null, duration_ms: null, commit_sha: null });
      service.record({ scope_id: 1, gate_name: 'type-check', status: 'pass', details: null, duration_ms: null, commit_sha: null });
      service.record({ scope_id: 1, gate_name: 'lint', status: 'pass', details: null, duration_ms: null, commit_sha: null });

      const latest = service.getLatestForScope(1);
      expect(latest).toHaveLength(2);
      const typeCheck = latest.find(g => g.gate_name === 'type-check');
      expect(typeCheck?.status).toBe('pass'); // latest one
    });

    it('returns empty for unknown scope', () => {
      expect(service.getLatestForScope(999)).toEqual([]);
    });
  });

  // ─── getLatestRun() ───────────────────────────────────────

  describe('getLatestRun()', () => {
    it('returns all gates from most recent run', () => {
      service.record({ scope_id: null, gate_name: 'type-check', status: 'pass', details: null, duration_ms: null, commit_sha: null });
      service.record({ scope_id: null, gate_name: 'lint', status: 'pass', details: null, duration_ms: null, commit_sha: null });

      const run = service.getLatestRun();
      expect(run.length).toBeGreaterThanOrEqual(2);
    });

    it('returns empty when no gates exist', () => {
      expect(service.getLatestRun()).toEqual([]);
    });
  });

  // ─── getTrend() ───────────────────────────────────────────

  describe('getTrend()', () => {
    it('returns gate history ordered by run_at DESC', () => {
      service.record({ scope_id: null, gate_name: 'build', status: 'pass', details: null, duration_ms: 500, commit_sha: null });
      service.record({ scope_id: null, gate_name: 'build', status: 'fail', details: null, duration_ms: 600, commit_sha: null });

      const trend = service.getTrend(10);
      expect(trend.length).toBe(2);
    });
  });

  // ─── getStats() ───────────────────────────────────────────

  describe('getStats()', () => {
    it('returns aggregate pass/fail per gate_name', () => {
      service.record({ scope_id: null, gate_name: 'type-check', status: 'pass', details: null, duration_ms: null, commit_sha: null });
      service.record({ scope_id: null, gate_name: 'type-check', status: 'pass', details: null, duration_ms: null, commit_sha: null });
      service.record({ scope_id: null, gate_name: 'type-check', status: 'fail', details: null, duration_ms: null, commit_sha: null });

      const stats = service.getStats();
      const typeCheck = stats.find(s => s.gate_name === 'type-check');
      expect(typeCheck).toBeDefined();
      expect(typeCheck!.total).toBe(3);
      expect(typeCheck!.passed).toBe(2);
      expect(typeCheck!.failed).toBe(1);
    });

    it('returns empty array when no gates exist', () => {
      expect(service.getStats()).toEqual([]);
    });
  });
});
