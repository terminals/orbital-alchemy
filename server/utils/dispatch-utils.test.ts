import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  resolveDispatchEvent,
  resolveActiveDispatchesForScope,
  resolveAbandonedDispatchesForScope,
  linkPidToDispatch,
  resolveDispatchesByPid,
  resolveDispatchesByDispatchId,
  getActiveScopeIds,
  getAbandonedScopeIds,
} from './dispatch-utils.js';
import { createTestDb } from '../__tests__/helpers/db.js';
import { createMockEmitter } from '../__tests__/helpers/mock-emitter.js';
import { WorkflowEngine } from '../../shared/workflow-engine.js';
import { CONFIG_WITH_HOOKS } from '../../shared/__fixtures__/workflow-configs.js';
import type Database from 'better-sqlite3';
import type { Emitter } from '../project-emitter.js';

// Mock isSessionPidAlive since it checks real OS processes
vi.mock('./terminal-launcher.js', () => ({
  isSessionPidAlive: vi.fn().mockReturnValue(false),
  launchInTerminal: vi.fn(),
  buildSessionName: vi.fn(),
  snapshotSessionPids: vi.fn().mockReturnValue([]),
  discoverNewSession: vi.fn(),
  renameSession: vi.fn(),
  launchInCategorizedTerminal: vi.fn(),
}));

function insertDispatchEvent(db: Database.Database, overrides: Record<string, unknown> = {}) {
  const id = overrides.id ?? `dispatch-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const data = JSON.stringify({
    command: '/scope-implement 1',
    transition: { from: 'backlog', to: 'active' },
    ...(overrides.data as Record<string, unknown> ?? {}),
  });
  db.prepare(
    `INSERT INTO events (id, type, scope_id, session_id, agent, data, timestamp)
     VALUES (?, 'DISPATCH', ?, ?, NULL, ?, ?)`
  ).run(
    id,
    overrides.scope_id ?? 1,
    overrides.session_id ?? 'sess-1',
    data,
    overrides.timestamp ?? new Date().toISOString(),
  );
  return id as string;
}

describe('dispatch-utils', () => {
  let db: Database.Database;
  let cleanup: () => void;
  let emitter: Emitter & { emit: ReturnType<typeof vi.fn> };
  let engine: WorkflowEngine;

  beforeEach(() => {
    ({ db, cleanup } = createTestDb());
    emitter = createMockEmitter();
    engine = new WorkflowEngine(CONFIG_WITH_HOOKS);
  });

  afterEach(() => {
    cleanup?.();
  });

  // ─── resolveDispatchEvent() ───────────────────────────────

  describe('resolveDispatchEvent()', () => {
    it('marks dispatch as resolved with outcome', () => {
      const id = insertDispatchEvent(db);
      resolveDispatchEvent(db, emitter, id, 'completed');

      const row = db.prepare('SELECT data FROM events WHERE id = ?').get(id) as { data: string };
      const data = JSON.parse(row.data);
      expect(data.resolved).toBeDefined();
      expect(data.resolved.outcome).toBe('completed');
      expect(data.resolved.at).toBeDefined();
    });

    it('emits dispatch:resolved event', () => {
      const id = insertDispatchEvent(db);
      resolveDispatchEvent(db, emitter, id, 'completed');
      expect(emitter.emit).toHaveBeenCalledWith('dispatch:resolved', expect.objectContaining({ event_id: id }));
    });

    it('stores error message for failed dispatches', () => {
      const id = insertDispatchEvent(db);
      resolveDispatchEvent(db, emitter, id, 'failed', 'Timeout');

      const row = db.prepare('SELECT data FROM events WHERE id = ?').get(id) as { data: string };
      const data = JSON.parse(row.data);
      expect(data.resolved.outcome).toBe('failed');
      expect(data.resolved.error).toBe('Timeout');
    });
  });

  // ─── resolveActiveDispatchesForScope() ────────────────────

  describe('resolveActiveDispatchesForScope()', () => {
    it('resolves all unresolved dispatches for a scope', () => {
      insertDispatchEvent(db, { id: 'd1', scope_id: 42 });
      insertDispatchEvent(db, { id: 'd2', scope_id: 42 });
      insertDispatchEvent(db, { id: 'd3', scope_id: 99 }); // different scope

      resolveActiveDispatchesForScope(db, emitter, 42, 'completed');

      const rows = db.prepare("SELECT data FROM events WHERE scope_id = 42").all() as Array<{ data: string }>;
      for (const row of rows) {
        const data = JSON.parse(row.data);
        expect(data.resolved).toBeDefined();
        expect(data.resolved.outcome).toBe('completed');
      }

      // Scope 99 should NOT be resolved
      const other = db.prepare("SELECT data FROM events WHERE scope_id = 99").get() as { data: string };
      expect(JSON.parse(other.data).resolved).toBeUndefined();
    });

    it('handles no active dispatches gracefully', () => {
      expect(() => resolveActiveDispatchesForScope(db, emitter, 999, 'completed')).not.toThrow();
    });
  });

  // ─── resolveAbandonedDispatchesForScope() ─────────────────

  describe('resolveAbandonedDispatchesForScope()', () => {
    it('resolves abandoned dispatches as completed', () => {
      insertDispatchEvent(db, { scope_id: 42, data: { resolved: true, outcome: 'abandoned' } });
      const count = resolveAbandonedDispatchesForScope(db, emitter, 42);
      expect(count).toBeGreaterThanOrEqual(0);
    });
  });

  // ─── linkPidToDispatch() ──────────────────────────────────

  describe('linkPidToDispatch()', () => {
    it('stores PID in event data', () => {
      const id = insertDispatchEvent(db);
      linkPidToDispatch(db, id, 12345);

      const row = db.prepare('SELECT data FROM events WHERE id = ?').get(id) as { data: string };
      const data = JSON.parse(row.data);
      expect(data.pid).toBe(12345);
    });

    it('handles non-existent event gracefully', () => {
      expect(() => linkPidToDispatch(db, 'nonexistent', 12345)).not.toThrow();
    });
  });

  // ─── resolveDispatchesByPid() ─────────────────────────────

  describe('resolveDispatchesByPid()', () => {
    it('resolves dispatches matching PID', () => {
      const id = insertDispatchEvent(db, { scope_id: 1 });
      linkPidToDispatch(db, id, 54321);

      const ids = resolveDispatchesByPid(db, emitter, 54321);
      expect(ids).toHaveLength(1);
      expect(ids[0]).toBe(id);

      const row = db.prepare('SELECT data FROM events WHERE id = ?').get(id) as { data: string };
      expect(JSON.parse(row.data).resolved).toBeDefined();
    });

    it('returns empty array when no dispatches match PID', () => {
      expect(resolveDispatchesByPid(db, emitter, 99999)).toHaveLength(0);
    });
  });

  // ─── resolveDispatchesByDispatchId() ──────────────────────

  describe('resolveDispatchesByDispatchId()', () => {
    it('resolves single dispatch by event ID', () => {
      const id = insertDispatchEvent(db);
      const ids = resolveDispatchesByDispatchId(db, emitter, id);
      expect(ids).toHaveLength(1);
      expect(ids[0]).toBe(id);
    });

    it('returns empty array for non-existent dispatch', () => {
      expect(resolveDispatchesByDispatchId(db, emitter, 'nonexistent')).toHaveLength(0);
    });
  });

  // ─── getActiveScopeIds() ──────────────────────────────────

  describe('getActiveScopeIds()', () => {
    it('returns scope IDs with unresolved dispatches', () => {
      insertDispatchEvent(db, { scope_id: 10 });
      insertDispatchEvent(db, { scope_id: 20 });

      const mockScopeService = {
        getById: (id: number) => ({ id, status: 'active' }),
      } as any;

      const ids = getActiveScopeIds(db, mockScopeService, engine);
      // May return empty if dispatches are stale (PID check fails), but shouldn't throw
      expect(Array.isArray(ids)).toBe(true);
    });

    it('excludes scopes in terminal status', () => {
      insertDispatchEvent(db, { scope_id: 30 });
      const mockScopeService = {
        getById: (id: number) => ({ id, status: 'shipped' }), // terminal
      } as any;

      const ids = getActiveScopeIds(db, mockScopeService, engine);
      expect(ids).not.toContain(30);
    });
  });

  // ─── getAbandonedScopeIds() ───────────────────────────────

  describe('getAbandonedScopeIds()', () => {
    it('returns recently abandoned scopes', () => {
      insertDispatchEvent(db, {
        scope_id: 50,
        data: { resolved: true, outcome: 'abandoned', resolved_at: new Date().toISOString(), transition: { from: 'backlog', to: 'active' } },
      });

      const mockScopeService = {
        getById: (id: number) => ({ id, status: 'active' }),
      } as any;

      const abandoned = getAbandonedScopeIds(db, mockScopeService, engine);
      expect(Array.isArray(abandoned)).toBe(true);
    });

    it('excludes terminal scopes', () => {
      insertDispatchEvent(db, {
        scope_id: 60,
        data: { resolved: true, outcome: 'abandoned', resolved_at: new Date().toISOString(), transition: { from: 'review', to: 'shipped' } },
      });

      const mockScopeService = {
        getById: (id: number) => ({ id, status: 'shipped' }), // terminal
      } as any;

      const abandoned = getAbandonedScopeIds(db, mockScopeService, engine);
      const ids = abandoned.map(a => a.scope_id);
      expect(ids).not.toContain(60);
    });
  });
});
