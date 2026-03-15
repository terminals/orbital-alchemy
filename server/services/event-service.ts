import type Database from 'better-sqlite3';
import type { Server } from 'socket.io';
import type { RawEvent } from '../parsers/event-parser.js';

export type EventIngestCallback = (type: string, scopeId: unknown, data: Record<string, unknown>) => void;

export class EventService {
  private onIngestCallback: EventIngestCallback | null = null;

  constructor(
    private db: Database.Database,
    private io: Server
  ) {}

  /** Register a callback to be called after each successful event ingest */
  onIngest(callback: EventIngestCallback): void {
    this.onIngestCallback = callback;
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
    if (result.changes > 0) {
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
      if (this.onIngestCallback) {
        this.onIngestCallback(event.type, event.scope_id ?? data.scope_id, data);
      }
    }
  }

  /** Get recent events, optionally filtered by type */
  getRecent(limit: number = 50, type?: string): unknown[] {
    if (type) {
      return this.db
        .prepare('SELECT * FROM events WHERE type = ? ORDER BY timestamp DESC LIMIT ?')
        .all(type, limit);
    }
    return this.db
      .prepare('SELECT * FROM events ORDER BY timestamp DESC LIMIT ?')
      .all(limit);
  }

  /** Get events for a specific agent */
  getByAgent(agent: string, limit: number = 50): unknown[] {
    return this.db
      .prepare('SELECT * FROM events WHERE agent = ? ORDER BY timestamp DESC LIMIT ?')
      .all(agent, limit);
  }

  /** Get events for a specific scope */
  getByScope(scopeId: number, limit: number = 50): unknown[] {
    return this.db
      .prepare('SELECT * FROM events WHERE scope_id = ? ORDER BY timestamp DESC LIMIT ?')
      .all(scopeId, limit);
  }
}
