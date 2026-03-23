import type Database from 'better-sqlite3';
import type { Server } from 'socket.io';
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
    private io: Server
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

    log.info('Event ingested', { type: event.type, id: event.id, scope_id: event.scope_id, agent: event.agent });
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
}
