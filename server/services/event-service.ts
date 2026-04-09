import type Database from 'better-sqlite3';
import type { Emitter } from '../project-emitter.js';
import type { RawEvent } from '../parsers/event-parser.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('event');

export type EventIngestCallback = (type: string, scopeId: unknown, data: Record<string, unknown>) => void;

export interface EventRow {
  id: string;
  type: string;
  scope_id: number | null;
  session_id: string | null;
  agent: string | null;
  data: string;
  timestamp: string;
  processed: number;
}

export class EventService {
  private onIngestCallbacks: EventIngestCallback[] = [];

  constructor(
    private db: Database.Database,
    private io: Emitter
  ) {}

  /** Register a callback to be called after each successful event ingest */
  onIngest(callback: EventIngestCallback): void {
    this.onIngestCallbacks.push(callback);
  }

  /** Ingest a parsed event into the database and broadcast it */
  ingest(event: RawEvent): void {
    const result = this.db.prepare(
      `INSERT OR IGNORE INTO events (id, type, scope_id, session_id, agent, data, timestamp, processed)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1)`
    ).run(
      event.id,
      event.type,
      event.scope_id ?? null,
      event.session_id ?? null,
      event.agent ?? null,
      JSON.stringify(event.data ?? {}),
      event.timestamp
    );

    // Only broadcast if this was a new insert (not a duplicate)
    if (result.changes === 0) {
      log.debug('Event duplicate skipped', { id: event.id });
      return;
    }

    log.debug('Event ingested', { type: event.type, id: event.id, scope_id: event.scope_id });
    const data = event.data ?? {};
    this.io.emit('event:new', {
      id: event.id,
      type: event.type,
      scope_id: event.scope_id ?? null,
      session_id: event.session_id ?? null,
      agent: event.agent ?? null,
      data,
      timestamp: event.timestamp,
    });

    // Trigger event-driven inference
    for (const cb of this.onIngestCallbacks) {
      cb(event.type, event.scope_id ?? data.scope_id, data);
    }
  }

  /** Get recent events, optionally filtered by type */
  getRecent(limit: number = 50, type?: string): EventRow[] {
    if (type) {
      return this.db
        .prepare('SELECT * FROM events WHERE type = ? ORDER BY timestamp DESC LIMIT ?')
        .all(type, limit) as EventRow[];
    }
    return this.db
      .prepare('SELECT * FROM events ORDER BY timestamp DESC LIMIT ?')
      .all(limit) as EventRow[];
  }

  /** Get events for a specific agent */
  getByAgent(agent: string, limit: number = 50): EventRow[] {
    return this.db
      .prepare('SELECT * FROM events WHERE agent = ? ORDER BY timestamp DESC LIMIT ?')
      .all(agent, limit) as EventRow[];
  }

  /** Get events for a specific scope */
  getByScope(scopeId: number, limit: number = 50): EventRow[] {
    return this.db
      .prepare('SELECT * FROM events WHERE scope_id = ? ORDER BY timestamp DESC LIMIT ?')
      .all(scopeId, limit) as EventRow[];
  }

  /** Get filtered events with optional type and scope_id filters */
  getFiltered(options: { limit?: number; type?: string; scopeId?: number }): EventRow[] {
    const { limit = 50, type, scopeId } = options;
    let query = 'SELECT * FROM events WHERE 1=1';
    const params: unknown[] = [];
    if (type) { query += ' AND type = ?'; params.push(type); }
    if (scopeId) { query += ' AND scope_id = ?'; params.push(scopeId); }
    query += ' ORDER BY timestamp DESC LIMIT ?';
    params.push(limit);
    return this.db.prepare(query).all(...params) as EventRow[];
  }

  /** Get violation summary: by rule, by file, overrides, and totals */
  getViolationSummary(): {
    byRule: Array<{ rule: string; count: number; last_seen: string }>;
    byFile: Array<{ file: string; count: number }>;
    overrides: Array<{ rule: string; reason: string; date: string }>;
    totalViolations: number;
    totalOverrides: number;
  } {
    const byRule = this.db.prepare(
      `SELECT JSON_EXTRACT(data, '$.rule') as rule, COUNT(*) as count, MAX(timestamp) as last_seen
       FROM events WHERE type = 'VIOLATION' GROUP BY rule ORDER BY count DESC`
    ).all() as Array<{ rule: string; count: number; last_seen: string }>;

    const byFile = this.db.prepare(
      `SELECT JSON_EXTRACT(data, '$.file') as file, COUNT(*) as count FROM events
       WHERE type = 'VIOLATION' AND JSON_EXTRACT(data, '$.file') IS NOT NULL AND JSON_EXTRACT(data, '$.file') != ''
       GROUP BY file ORDER BY count DESC LIMIT 20`
    ).all() as Array<{ file: string; count: number }>;

    const overrides = this.db.prepare(
      `SELECT JSON_EXTRACT(data, '$.rule') as rule, JSON_EXTRACT(data, '$.reason') as reason, timestamp as date
       FROM events WHERE type = 'OVERRIDE' ORDER BY timestamp DESC LIMIT 50`
    ).all() as Array<{ rule: string; reason: string; date: string }>;

    const totalViolations = (this.db.prepare(`SELECT COUNT(*) as count FROM events WHERE type = 'VIOLATION'`).get() as { count: number }).count;
    const totalOverrides = (this.db.prepare(`SELECT COUNT(*) as count FROM events WHERE type = 'OVERRIDE'`).get() as { count: number }).count;

    return { byRule, byFile, overrides, totalViolations, totalOverrides };
  }

  /** Get per-rule violation and override counts (for enforcement rules view) */
  getViolationStatsByRule(): {
    violations: Map<string, { count: number; last_seen: string }>;
    overrides: Map<string, { count: number }>;
  } {
    const violationStats = this.db.prepare(
      `SELECT JSON_EXTRACT(data, '$.rule') as rule, COUNT(*) as count, MAX(timestamp) as last_seen
       FROM events WHERE type = 'VIOLATION' GROUP BY rule`
    ).all() as Array<{ rule: string; count: number; last_seen: string }>;

    const overrideStats = this.db.prepare(
      `SELECT JSON_EXTRACT(data, '$.rule') as rule, COUNT(*) as count
       FROM events WHERE type = 'OVERRIDE' GROUP BY rule`
    ).all() as Array<{ rule: string; count: number }>;

    return {
      violations: new Map(violationStats.map(v => [v.rule, v])),
      overrides: new Map(overrideStats.map(o => [o.rule, o])),
    };
  }

  /** Get violation trend data grouped by day and rule */
  getViolationTrend(days: number = 30): Array<{ day: string; rule: string; count: number }> {
    return this.db.prepare(
      `SELECT date(timestamp) as day, JSON_EXTRACT(data, '$.rule') as rule, COUNT(*) as count
       FROM events WHERE type = 'VIOLATION' AND timestamp >= datetime('now', ? || ' days')
       GROUP BY day, rule ORDER BY day ASC`
    ).all(`-${days}`) as Array<{ day: string; rule: string; count: number }>;
  }

  /** Get deployment frequency by week and environment */
  getDeployFrequency(): Array<{ week: string; staging: number; production: number }> {
    const rows = this.db.prepare(
      `SELECT environment, strftime('%Y-W%W', started_at) as week, COUNT(*) as count
       FROM deployments WHERE started_at > datetime('now', '-56 days') GROUP BY environment, week ORDER BY week ASC`
    ).all() as Array<{ environment: string; week: string; count: number }>;

    const weekMap = new Map<string, { week: string; staging: number; production: number }>();
    for (const row of rows) {
      if (!weekMap.has(row.week)) weekMap.set(row.week, { week: row.week, staging: 0, production: 0 });
      const entry = weekMap.get(row.week)!;
      if (row.environment === 'staging') entry.staging = row.count;
      if (row.environment === 'production') entry.production = row.count;
    }
    return [...weekMap.values()];
  }
}
