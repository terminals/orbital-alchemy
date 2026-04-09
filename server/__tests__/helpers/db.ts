import Database from 'better-sqlite3';
import { SCHEMA_DDL } from '../../schema.js';

/**
 * Create an in-memory SQLite database with the full Orbital schema.
 * Returns the db handle and a cleanup function.
 */
export function createTestDb(): { db: Database.Database; cleanup: () => void } {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA_DDL);

  return {
    db,
    cleanup: () => db.close(),
  };
}
