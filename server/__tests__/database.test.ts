import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { SCHEMA_DDL } from '../schema.js';

describe('database schema', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
  });

  afterEach(() => {
    db.close();
  });

  // ─── Schema DDL ───────────────────────────────────────────

  describe('SCHEMA_DDL', () => {
    it('creates all expected tables', () => {
      db.exec(SCHEMA_DDL);
      const tables = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
      ).all() as Array<{ name: string }>;
      const names = tables.map(t => t.name);

      expect(names).toContain('events');
      expect(names).toContain('quality_gates');
      expect(names).toContain('deployments');
      expect(names).toContain('sessions');
      expect(names).toContain('sprints');
      expect(names).toContain('sprint_scopes');
    });

    it('creates all expected indexes', () => {
      db.exec(SCHEMA_DDL);
      const indexes = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%' ORDER BY name"
      ).all() as Array<{ name: string }>;
      const names = indexes.map(i => i.name);

      expect(names).toContain('idx_events_type');
      expect(names).toContain('idx_events_timestamp');
      expect(names).toContain('idx_events_scope_id');
      expect(names).toContain('idx_events_type_timestamp');
      expect(names).toContain('idx_gates_scope_id');
      expect(names).toContain('idx_gates_run_at');
      expect(names).toContain('idx_deployments_env');
      expect(names).toContain('idx_sessions_scope');
      expect(names).toContain('idx_sessions_claude_id');
      expect(names).toContain('idx_sprints_status');
      expect(names).toContain('idx_sprint_scopes_sprint');
      expect(names).toContain('idx_events_dispatch_unresolved');
    });
  });

  // ─── WAL mode pragma ──────────────────────────────────────

  describe('pragmas', () => {
    it('sets WAL mode (memory db stays memory mode)', () => {
      // In-memory databases ignore WAL and remain in memory mode.
      // The openProjectDatabase function uses file-backed DB where WAL works.
      db.pragma('journal_mode = WAL');
      const mode = db.pragma('journal_mode') as Array<{ journal_mode: string }>;
      // In-memory can be either 'wal' or 'memory' depending on SQLite version
      expect(['wal', 'memory']).toContain(mode[0].journal_mode);
    });

    it('enables foreign keys', () => {
      db.pragma('foreign_keys = ON');
      const fk = db.pragma('foreign_keys') as Array<{ foreign_keys: number }>;
      expect(fk[0].foreign_keys).toBe(1);
    });
  });

  // ─── Idempotent schema application ────────────────────────

  describe('idempotent schema', () => {
    it('applying SCHEMA_DDL twice does not error', () => {
      db.exec(SCHEMA_DDL);
      expect(() => db.exec(SCHEMA_DDL)).not.toThrow();
    });

    it('tables are identical after double application', () => {
      db.exec(SCHEMA_DDL);
      const tablesFirst = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
      ).all();

      db.exec(SCHEMA_DDL);
      const tablesSecond = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
      ).all();

      expect(tablesFirst).toEqual(tablesSecond);
    });
  });

  // ─── Data preservation through schema re-apply ────────────

  describe('data preservation', () => {
    it('existing data survives schema reapplication', () => {
      db.exec(SCHEMA_DDL);

      db.prepare(
        `INSERT INTO events (id, type, data, timestamp) VALUES (?, ?, ?, ?)`
      ).run('test-1', 'STATUS_CHANGE', '{}', '2026-01-01T00:00:00Z');

      db.prepare(
        `INSERT INTO quality_gates (gate_name, status, run_at) VALUES (?, ?, ?)`
      ).run('type-check', 'pass', '2026-01-01T00:00:00Z');

      db.exec(SCHEMA_DDL);

      const events = db.prepare('SELECT * FROM events').all();
      expect(events).toHaveLength(1);

      const gates = db.prepare('SELECT * FROM quality_gates').all();
      expect(gates).toHaveLength(1);
    });
  });

  // ─── Table structure ──────────────────────────────────────

  describe('table structure', () => {
    it('events table has expected columns', () => {
      db.exec(SCHEMA_DDL);
      const cols = db.pragma('table_info(events)') as Array<{ name: string }>;
      const names = cols.map(c => c.name);

      expect(names).toContain('id');
      expect(names).toContain('type');
      expect(names).toContain('scope_id');
      expect(names).toContain('session_id');
      expect(names).toContain('agent');
      expect(names).toContain('data');
      expect(names).toContain('timestamp');
      expect(names).toContain('processed');
    });

    it('sessions table has expected columns', () => {
      db.exec(SCHEMA_DDL);
      const cols = db.pragma('table_info(sessions)') as Array<{ name: string }>;
      const names = cols.map(c => c.name);

      expect(names).toContain('id');
      expect(names).toContain('scope_id');
      expect(names).toContain('claude_session_id');
      expect(names).toContain('action');
      expect(names).toContain('started_at');
      expect(names).toContain('ended_at');
      expect(names).toContain('summary');
      expect(names).toContain('discoveries');
      expect(names).toContain('next_steps');
      expect(names).toContain('progress_pct');
    });

    it('sprints table has expected columns', () => {
      db.exec(SCHEMA_DDL);
      const cols = db.pragma('table_info(sprints)') as Array<{ name: string }>;
      const names = cols.map(c => c.name);

      expect(names).toContain('id');
      expect(names).toContain('name');
      expect(names).toContain('status');
      expect(names).toContain('concurrency_cap');
      expect(names).toContain('created_at');
      expect(names).toContain('updated_at');
    });

    it('sprint_scopes enforces foreign key on sprint_id', () => {
      db.exec(SCHEMA_DDL);
      expect(() => {
        db.prepare(
          `INSERT INTO sprint_scopes (sprint_id, scope_id) VALUES (?, ?)`
        ).run(9999, 1);
      }).toThrow();
    });
  });

  // ─── openProjectDatabase integration ──────────────────────

  describe('openProjectDatabase', () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orbital-db-test-'));
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('creates directory and database file', async () => {
      const { openProjectDatabase } = await import('../database.js');
      const projDb = openProjectDatabase(tmpDir);

      expect(fs.existsSync(path.join(tmpDir, 'orbital.db'))).toBe(true);

      const tables = projDb.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
      ).all() as Array<{ name: string }>;
      expect(tables.map(t => t.name)).toContain('events');

      projDb.close();
    });

    it('running twice on same directory is idempotent', async () => {
      const { openProjectDatabase } = await import('../database.js');
      const db1 = openProjectDatabase(tmpDir);
      db1.prepare(
        `INSERT INTO events (id, type, data, timestamp) VALUES (?, ?, ?, ?)`
      ).run('persist-test', 'TEST', '{}', '2026-01-01T00:00:00Z');
      db1.close();

      const db2 = openProjectDatabase(tmpDir);
      const row = db2.prepare('SELECT id FROM events WHERE id = ?').get('persist-test');
      expect(row).toBeDefined();
      db2.close();
    });
  });
});
