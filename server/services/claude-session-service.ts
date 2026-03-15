import fs from 'fs';
import path from 'path';
import readline from 'readline';
import type Database from 'better-sqlite3';
import type { ScopeService } from './scope-service.js';
import { getConfig, getClaudeSessionsDir } from '../config.js';

export interface ClaudeSession {
  id: string;
  slug: string;
  branch: string;
  startedAt: string;
  lastActiveAt: string;
  summary: string | null;
  fileSize: number;
}

function getSessionsDir(): string {
  return getClaudeSessionsDir(getConfig().projectRoot);
}

let cache: { sessions: ClaudeSession[]; expiry: number } | null = null;
const CACHE_TTL_MS = 60_000;

/**
 * Extract metadata from a JSONL session file by reading the first few
 * lines and the last line (avoids parsing the entire file).
 */
async function parseSessionFile(filePath: string): Promise<ClaudeSession | null> {
  const stat = fs.statSync(filePath);
  const filename = path.basename(filePath, '.jsonl');

  let sessionId = filename;
  let slug = '';
  let branch = '';
  let startedAt = '';
  let summary: string | null = null;

  // Read first 20 lines for metadata
  const stream = fs.createReadStream(filePath, { encoding: 'utf-8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  let lineNum = 0;

  for await (const line of rl) {
    if (lineNum > 20) break;
    lineNum++;

    try {
      const data = JSON.parse(line);

      if (data.sessionId && !sessionId) sessionId = data.sessionId;
      if (data.slug && !slug) slug = data.slug;
      if (data.gitBranch && !branch) branch = data.gitBranch;

      // Capture the earliest timestamp
      if (!startedAt) {
        const ts =
          data.timestamp ??
          data.snapshot?.timestamp;
        if (ts) startedAt = ts;
      }

      // If we have all fields, stop early
      if (sessionId && slug && branch && startedAt) break;
    } catch {
      // skip unparseable lines
    }
  }

  rl.close();
  stream.destroy();

  if (!sessionId) return null;

  // Read last line for summary
  try {
    const fullContent = fs.readFileSync(filePath, 'utf-8');
    const lines = fullContent.trimEnd().split('\n');
    const lastLine = JSON.parse(lines[lines.length - 1]);
    if (lastLine.type === 'summary' && lastLine.summary) {
      summary = lastLine.summary;
    }
  } catch {
    // ignore
  }

  return {
    id: sessionId,
    slug: slug || filename,
    branch: branch || 'unknown',
    startedAt: startedAt || stat.birthtime.toISOString(),
    lastActiveAt: stat.mtime.toISOString(),
    summary,
    fileSize: stat.size,
  };
}

export async function getClaudeSessions(since?: string): Promise<ClaudeSession[]> {
  if (cache && Date.now() < cache.expiry) {
    return filterSince(cache.sessions, since);
  }

  const sessionsDir = getSessionsDir();
  if (!fs.existsSync(sessionsDir)) return [];

  const files = fs
    .readdirSync(sessionsDir)
    .filter((f) => f.endsWith('.jsonl'))
    .map((f) => path.join(sessionsDir, f));

  const sessions: ClaudeSession[] = [];

  for (const file of files) {
    const session = await parseSessionFile(file);
    if (session) sessions.push(session);
  }

  // Sort by most recent first
  sessions.sort(
    (a, b) => new Date(b.lastActiveAt).getTime() - new Date(a.lastActiveAt).getTime(),
  );

  cache = { sessions, expiry: Date.now() + CACHE_TTL_MS };
  return filterSince(sessions, since);
}

function filterSince(sessions: ClaudeSession[], since?: string): ClaudeSession[] {
  if (!since) return sessions;
  const cutoff = new Date(since).getTime();
  return sessions.filter((s) => new Date(s.lastActiveAt).getTime() >= cutoff);
}

/** Truncate text to max length with ellipsis */
function truncate(text: string | null | undefined, max: number): string {
  if (!text) return '';
  return text.length > max ? text.slice(0, max) + '...' : text;
}

/**
 * Sync sessions into the DB from scope frontmatter.
 *
 * Algorithm:
 * 1. Read scopes with non-empty sessions JSON from DB
 * 2. For each scope, parse the sessions JSON: Record<phase, uuid[]>
 * 3. For each (phase, uuid), UPSERT into sessions table with JSONL metadata if available
 */
export async function syncClaudeSessionsToDB(db: Database.Database, scopeService: ScopeService): Promise<number> {
  cache = null; // Force fresh read from filesystem

  const scopeRows = scopeService.getAll()
    .filter(s => Object.keys(s.sessions).length > 0)
    .map(s => ({ id: s.id, sessions: s.sessions }));

  const upsert = db.prepare(`
    INSERT INTO sessions (id, scope_id, claude_session_id, action, started_at, ended_at, summary, handoff_file, discoveries, next_steps)
    VALUES (?, ?, ?, ?, ?, ?, ?, NULL, '[]', '[]')
    ON CONFLICT(id) DO UPDATE SET
      started_at = excluded.started_at,
      ended_at = excluded.ended_at,
      summary = excluded.summary,
      claude_session_id = excluded.claude_session_id,
      action = excluded.action
  `);

  let count = 0;

  const insertAll = db.transaction(() => {
    for (const row of scopeRows) {
      for (const [phase, uuids] of Object.entries(row.sessions)) {
        if (!Array.isArray(uuids)) continue;

        for (const uuid of uuids) {
          if (typeof uuid !== 'string' || !uuid) continue;

          // Check if JSONL file exists for metadata enrichment
          const jsonlPath = path.join(getSessionsDir(), `${uuid}.jsonl`);
          let startedAt: string | null = null;
          let endedAt: string | null = null;
          let summary: string | null = null;

          if (fs.existsSync(jsonlPath)) {
            try {
              const stat = fs.statSync(jsonlPath);
              startedAt = stat.birthtime.toISOString();
              endedAt = stat.mtime.toISOString();

              // Quick summary extraction from last line
              const content = fs.readFileSync(jsonlPath, 'utf-8');
              const lines = content.trimEnd().split('\n');
              const lastLine = JSON.parse(lines[lines.length - 1]);
              if (lastLine.type === 'summary' && lastLine.summary) {
                summary = truncate(lastLine.summary, 200);
              }
            } catch {
              // Metadata unavailable — row still created with nulls
            }
          }

          // Composite key includes phase so same UUID under different phases creates distinct rows
          const compositeId = `${uuid}-scope-${row.id}-${phase}`;

          upsert.run(
            compositeId,
            row.id,
            uuid,
            phase,
            startedAt,
            endedAt,
            summary,
          );
          count++;
        }
      }
    }
  });

  insertAll();
  return count;
}
