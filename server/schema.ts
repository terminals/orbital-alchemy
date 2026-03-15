export const SCHEMA_DDL = `
-- Events from hooks/watchers
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  scope_id INTEGER,
  session_id TEXT,
  agent TEXT,
  data TEXT DEFAULT '{}',
  timestamp TEXT NOT NULL,
  processed INTEGER DEFAULT 0
);

-- Quality gate results per scope
CREATE TABLE IF NOT EXISTS quality_gates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scope_id INTEGER,
  gate_name TEXT NOT NULL,
  status TEXT NOT NULL,
  details TEXT,
  duration_ms INTEGER,
  run_at TEXT NOT NULL,
  commit_sha TEXT
);

-- Deployment tracking
CREATE TABLE IF NOT EXISTS deployments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  environment TEXT NOT NULL,
  status TEXT NOT NULL,
  commit_sha TEXT,
  branch TEXT,
  pr_number INTEGER,
  health_check_url TEXT,
  started_at TEXT,
  completed_at TEXT,
  details TEXT DEFAULT '{}'
);

-- Session history
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  scope_id INTEGER,
  claude_session_id TEXT,
  action TEXT,
  started_at TEXT,
  ended_at TEXT,
  handoff_file TEXT,
  summary TEXT,
  discoveries TEXT DEFAULT '[]',
  next_steps TEXT DEFAULT '[]',
  progress_pct INTEGER
);

-- Sprint containers for batching scope dispatch
CREATE TABLE IF NOT EXISTS sprints (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'assembling',
  concurrency_cap INTEGER NOT NULL DEFAULT 5,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  dispatched_at TEXT,
  completed_at TEXT,
  dispatch_meta TEXT DEFAULT '{}'
);

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

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);
CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);
CREATE INDEX IF NOT EXISTS idx_events_scope_id ON events(scope_id);
CREATE INDEX IF NOT EXISTS idx_gates_scope_id ON quality_gates(scope_id);
CREATE INDEX IF NOT EXISTS idx_gates_run_at ON quality_gates(run_at);
CREATE INDEX IF NOT EXISTS idx_deployments_env ON deployments(environment);
CREATE INDEX IF NOT EXISTS idx_sessions_scope ON sessions(scope_id);
CREATE INDEX IF NOT EXISTS idx_sprints_status ON sprints(status);
CREATE INDEX IF NOT EXISTS idx_sprint_scopes_sprint ON sprint_scopes(sprint_id);
`;
