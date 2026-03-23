import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { SCHEMA_DDL } from './schema.js';
import { getConfig } from './config.js';
import { createLogger } from './utils/logger.js';

const log = createLogger('database');

function getDbPaths(): { dir: string; file: string } {
  const config = getConfig();
  return { dir: config.dbDir, file: path.join(config.dbDir, 'orbital.db') };
}

let db: Database.Database | null = null;

export function getDatabase(): Database.Database {
  if (db) return db;

  const { dir, file } = getDbPaths();
  fs.mkdirSync(dir, { recursive: true });

  db = new Database(file);
  log.info('Database initialized', { path: file });

  // Performance pragmas for a local dev tool
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');

  // Run schema migrations (SQLite db.exec, not child_process)
  db.exec(SCHEMA_DDL);

  // Incremental migrations for existing databases
  runMigrations(db);

  return db;
}

/** Check if a table exists in the database */
function tableExists(database: Database.Database, tableName: string): boolean {
  const row = database.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
  ).get(tableName) as { name: string } | undefined;
  return row !== undefined;
}

/** Run incremental migrations for schema changes on existing databases */
function runMigrations(database: Database.Database): void {
  log.debug('Running database migrations');
  // Migration 2: Add claude_session_id column to sessions
  const sessionCols = database.pragma('table_info(sessions)') as Array<{ name: string }>;
  if (!sessionCols.some((c) => c.name === 'claude_session_id')) {
    database.exec('ALTER TABLE sessions ADD COLUMN claude_session_id TEXT');
  }

  // Migration 6: Add action column to sessions for frontmatter lifecycle phase
  if (!sessionCols.some((c) => c.name === 'action')) {
    database.exec('ALTER TABLE sessions ADD COLUMN action TEXT');
  }

  // Migration 8: Add batch group columns to sprints
  const sprintCols = database.pragma('table_info(sprints)') as Array<{ name: string }>;
  if (!sprintCols.some((c) => c.name === 'target_column')) {
    database.exec("ALTER TABLE sprints ADD COLUMN target_column TEXT DEFAULT 'backlog'");
    database.exec("ALTER TABLE sprints ADD COLUMN group_type TEXT DEFAULT 'sprint'");
    database.exec("ALTER TABLE sprints ADD COLUMN dispatch_result TEXT DEFAULT '{}'");
    database.exec('CREATE INDEX IF NOT EXISTS idx_sprints_target_column ON sprints(target_column)');
  }

  // Migration 7: Drop scopes table — scopes are now served from in-memory cache.
  // Recreate sprint_scopes without the FK to scopes.
  if (tableExists(database, 'scopes')) {
    database.exec(`
      -- Backup sprint_scopes data
      CREATE TABLE IF NOT EXISTS sprint_scopes_backup AS SELECT * FROM sprint_scopes;
      -- Drop tables with FK dependencies first
      DROP TABLE IF EXISTS sprint_scopes;
      -- Drop the scopes table
      DROP TABLE IF EXISTS scopes;
      -- Recreate sprint_scopes without FK to scopes
      CREATE TABLE IF NOT EXISTS sprint_scopes (
        sprint_id INTEGER NOT NULL,
        scope_id INTEGER NOT NULL,
        layer INTEGER,
        dispatch_status TEXT NOT NULL DEFAULT 'pending',
        dispatched_at TEXT,
        completed_at TEXT,
        error TEXT,
        PRIMARY KEY (sprint_id, scope_id),
        FOREIGN KEY (sprint_id) REFERENCES sprints(id) ON DELETE CASCADE
      );
      -- Restore data
      INSERT OR IGNORE INTO sprint_scopes SELECT * FROM sprint_scopes_backup;
      -- Cleanup
      DROP TABLE IF EXISTS sprint_scopes_backup;
    `);
  }
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
    log.debug('Database closed');
  }
}
