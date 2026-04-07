import type Database from 'better-sqlite3';
import type { Emitter } from '../project-emitter.js';
import type { GateStatus } from '../../shared/api-types.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('gate');

export interface GateResult {
  scope_id: number | null;
  gate_name: string;
  status: GateStatus;
  details: string | null;
  duration_ms: number | null;
  commit_sha: string | null;
}

export interface GateRow {
  id: number;
  scope_id: number | null;
  gate_name: string;
  status: GateStatus;
  details: string | null;
  duration_ms: number | null;
  run_at: string;
  commit_sha: string | null;
}

// The 13 quality gates from /test-checks
export const GATE_NAMES = [
  'type-check',
  'lint',
  'build',
  'template-validation',
  'doc-links',
  'doc-freshness',
  'rule-enforcement',
  'no-placeholders',
  'no-mock-data',
  'no-shortcuts',
  'no-default-secrets',
  'no-stale-scopes',
  'tests',
] as const;

export class GateService {
  constructor(
    private db: Database.Database,
    private io: Emitter
  ) {}

  /** Record a gate result */
  record(gate: GateResult): void {
    const result = this.db.prepare(
      `INSERT INTO quality_gates (scope_id, gate_name, status, details, duration_ms, run_at, commit_sha)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      gate.scope_id,
      gate.gate_name,
      gate.status,
      gate.details,
      gate.duration_ms,
      new Date().toISOString(),
      gate.commit_sha
    );

    log.info('Gate recorded', { scope_id: gate.scope_id, gate: gate.gate_name, status: gate.status, duration_ms: gate.duration_ms });
    const inserted = this.db.prepare('SELECT * FROM quality_gates WHERE id = ?').get(result.lastInsertRowid);
    if (inserted) {
      this.io.emit('gate:updated', inserted);
    }
  }

  /** Get latest gate results for a scope */
  getLatestForScope(scopeId: number): GateRow[] {
    return this.db.prepare(`
      SELECT * FROM quality_gates
      WHERE scope_id = ? AND id IN (
        SELECT MAX(id) FROM quality_gates
        WHERE scope_id = ?
        GROUP BY gate_name
      )
      ORDER BY gate_name
    `).all(scopeId, scopeId) as GateRow[];
  }

  /** Get latest gate run (all gates from most recent execution) */
  getLatestRun(): GateRow[] {
    // Get the most recent run_at timestamp
    const latest = this.db.prepare(
      'SELECT run_at FROM quality_gates ORDER BY run_at DESC LIMIT 1'
    ).get() as { run_at: string } | undefined;

    if (!latest) return [];

    // Get all gates from that run (within 60 seconds of each other)
    return this.db.prepare(`
      SELECT * FROM quality_gates
      WHERE run_at >= datetime(?, '-60 seconds')
      ORDER BY gate_name
    `).all(latest.run_at) as GateRow[];
  }

  /** Get gate history for trend chart */
  getTrend(limit: number = 30): GateRow[] {
    return this.db.prepare(`
      SELECT gate_name, status, run_at, duration_ms
      FROM quality_gates
      ORDER BY run_at DESC
      LIMIT ?
    `).all(limit * GATE_NAMES.length) as GateRow[]; // Get enough to cover N runs
  }

  /** Get aggregate pass/fail stats */
  getStats(): { gate_name: string; total: number; passed: number; failed: number }[] {
    return this.db.prepare(`
      SELECT
        gate_name,
        COUNT(*) as total,
        SUM(CASE WHEN status = 'pass' THEN 1 ELSE 0 END) as passed,
        SUM(CASE WHEN status = 'fail' THEN 1 ELSE 0 END) as failed
      FROM quality_gates
      GROUP BY gate_name
      ORDER BY gate_name
    `).all() as { gate_name: string; total: number; passed: number; failed: number }[];
  }
}
