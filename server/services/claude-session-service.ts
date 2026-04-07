import fs from 'fs';
import path from 'path';
import readline from 'readline';
import type Database from 'better-sqlite3';
import type { ScopeService } from './scope-service.js';
import { getClaudeSessionsDir } from '../config.js';

export interface ClaudeSession {
  id: string;
  slug: string;
  branch: string;
  startedAt: string;
  lastActiveAt: string;
  summary: string | null;
  fileSize: number;
}

export interface SessionStats {
  /** Count of each JSONL line type */
  typeCounts: Record<string, number>;
  /** Fields extracted from 'user' lines */
  user: {
    totalMessages: number;
    metaMessages: number;
    toolResults: number;
    commands: string[];
    permissionModes: string[];
    cwd: string | null;
    version: string | null;
  };
  /** Fields extracted from 'assistant' lines */
  assistant: {
    totalMessages: number;
    models: string[];
    totalInputTokens: number;
    totalOutputTokens: number;
    totalCacheReadTokens: number;
    totalCacheCreationTokens: number;
    toolsUsed: Record<string, number>;
  };
  /** Fields extracted from 'system' lines */
  system: {
    totalMessages: number;
    subtypes: string[];
    stopReasons: string[];
    totalDurationMs: number;
    hookCount: number;
    hookErrors: number;
  };
  /** Fields extracted from 'progress' lines */
  progress: {
    totalLines: number;
  };
  /** Timing */
  timing: {
    firstTimestamp: string | null;
    lastTimestamp: string | null;
    durationMs: number;
  };
}

/** Module-level projectRoot fallback for single-project mode. */
let _projectRoot: string | null = null;

/** Set the project root fallback (single-project mode only). */
export function setSessionProjectRoot(projectRoot: string): void {
  _projectRoot = projectRoot;
}

function getSessionsDir(projectRoot?: string): string {
  const root = projectRoot ?? _projectRoot;
  if (!root) throw new Error('Session project root not set — pass projectRoot or call setSessionProjectRoot()');
  return getClaudeSessionsDir(root);
}

const cacheByDir = new Map<string, { sessions: ClaudeSession[]; expiry: number }>();
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

  // Read file content for summary extraction
  try {
    const fullContent = fs.readFileSync(filePath, 'utf-8');
    const lines = fullContent.trimEnd().split('\n');

    // Prefer explicit summary line from Claude
    const lastLine = JSON.parse(lines[lines.length - 1]);
    if (lastLine.type === 'summary' && lastLine.summary) {
      summary = lastLine.summary;
    }

    // Fall back to first user message
    if (!summary) {
      summary = extractFirstUserMessage(lines, 120);
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

export async function getClaudeSessions(since?: string, projectRoot?: string): Promise<ClaudeSession[]> {
  const sessionsDir = getSessionsDir(projectRoot);
  const cached = cacheByDir.get(sessionsDir);
  if (cached && Date.now() < cached.expiry) {
    return filterSince(cached.sessions, since);
  }

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

  cacheByDir.set(sessionsDir, { sessions, expiry: Date.now() + CACHE_TTL_MS });
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
 * Extract a meaningful session name from JSONL lines.
 *
 * Priority:
 * 1. First non-meta user message (what the user actually typed)
 * 2. Slash command name from the first command-message (e.g. "/scope review 1")
 * 3. null if nothing useful found
 *
 * Skips isMeta messages (skill prompts injected by the system),
 * tool_result lines, and raw command XML.
 */
function extractFirstUserMessage(lines: string[], max: number): string | null {
  let slashCommand: string | null = null;

  for (const line of lines) {
    try {
      const data = JSON.parse(line);
      if (data.type !== 'user') continue;

      const content = data.message?.content;
      let text = '';

      if (typeof content === 'string') {
        text = content;
      } else if (Array.isArray(content)) {
        for (const block of content) {
          if (block?.type === 'text' && typeof block.text === 'string') {
            text = block.text;
            break;
          }
        }
      }

      if (!text) continue;

      // Capture slash command as fallback (e.g. "/scope review 1")
      if (!slashCommand && text.includes('<command-name>')) {
        const cmdMatch = text.match(/<command-name>\/?(.+?)<\/command-name>/);
        const argsMatch = text.match(/<command-args>(.+?)<\/command-args>/);
        if (cmdMatch) {
          slashCommand = '/' + cmdMatch[1] + (argsMatch ? ' ' + argsMatch[1] : '');
        }
      }

      // Skip system-injected lines: commands, meta/skill prompts, tool results
      if (text.startsWith('<command') || text.startsWith('<tool_result')) continue;
      if (data.isMeta) continue;

      return truncate(text.trim(), max);
    } catch {
      // skip unparseable lines
    }
  }

  return slashCommand ?? null;
}

/**
 * Parse a full JSONL file and return detailed stats grouped by line type.
 * This is heavier than parseSessionFile — only called for the detail view.
 */
export function getSessionStats(claudeSessionId: string, projectRoot?: string): SessionStats | null {
  const filePath = path.join(getSessionsDir(projectRoot), `${claudeSessionId}.jsonl`);
  if (!fs.existsSync(filePath)) return null;

  const stats: SessionStats = {
    typeCounts: {},
    user: { totalMessages: 0, metaMessages: 0, toolResults: 0, commands: [], permissionModes: [], cwd: null, version: null },
    assistant: { totalMessages: 0, models: [], totalInputTokens: 0, totalOutputTokens: 0, totalCacheReadTokens: 0, totalCacheCreationTokens: 0, toolsUsed: {} },
    system: { totalMessages: 0, subtypes: [], stopReasons: [], totalDurationMs: 0, hookCount: 0, hookErrors: 0 },
    progress: { totalLines: 0 },
    timing: { firstTimestamp: null, lastTimestamp: null, durationMs: 0 },
  };

  let content: string;
  try { content = fs.readFileSync(filePath, 'utf-8'); } catch { return null; }

  const lines = content.trimEnd().split('\n');

  for (const line of lines) {
    let data: Record<string, unknown>;
    try { data = JSON.parse(line); } catch { continue; }

    const type = (data.type as string) ?? 'unknown';
    stats.typeCounts[type] = (stats.typeCounts[type] ?? 0) + 1;

    // Track timestamps
    const ts = (data.timestamp as string) ?? null;
    if (ts) {
      if (!stats.timing.firstTimestamp) stats.timing.firstTimestamp = ts;
      stats.timing.lastTimestamp = ts;
    }

    if (type === 'user') {
      stats.user.totalMessages++;
      if (data.isMeta) stats.user.metaMessages++;
      if (data.toolUseResult) stats.user.toolResults++;
      if (!stats.user.cwd && data.cwd) stats.user.cwd = data.cwd as string;
      if (!stats.user.version && data.version) stats.user.version = data.version as string;

      const pm = data.permissionMode as string | undefined;
      if (pm && !stats.user.permissionModes.includes(pm)) stats.user.permissionModes.push(pm);

      // Extract slash commands
      const content = (data.message as Record<string, unknown>)?.content;
      const text = typeof content === 'string' ? content : '';
      const cmdMatch = text.match(/<command-name>\/?(.+?)<\/command-name>/);
      if (cmdMatch) {
        const cmd = '/' + cmdMatch[1];
        if (!stats.user.commands.includes(cmd)) stats.user.commands.push(cmd);
      }
    }

    if (type === 'assistant') {
      stats.assistant.totalMessages++;
      const msg = data.message as Record<string, unknown> | undefined;
      if (msg) {
        const model = msg.model as string | undefined;
        if (model && !stats.assistant.models.includes(model)) stats.assistant.models.push(model);

        const usage = msg.usage as Record<string, unknown> | undefined;
        if (usage) {
          stats.assistant.totalInputTokens += Number(usage.input_tokens) || 0;
          stats.assistant.totalOutputTokens += Number(usage.output_tokens) || 0;
          stats.assistant.totalCacheReadTokens += Number(usage.cache_read_input_tokens) || 0;
          stats.assistant.totalCacheCreationTokens += Number(usage.cache_creation_input_tokens) || 0;
        }

        // Track tool usage
        const msgContent = msg.content;
        if (Array.isArray(msgContent)) {
          for (const block of msgContent) {
            if (block?.type === 'tool_use' && block.name) {
              const name = block.name as string;
              stats.assistant.toolsUsed[name] = (stats.assistant.toolsUsed[name] ?? 0) + 1;
            }
          }
        }
      }
    }

    if (type === 'system') {
      stats.system.totalMessages++;
      const subtype = data.subtype as string | undefined;
      if (subtype && !stats.system.subtypes.includes(subtype)) stats.system.subtypes.push(subtype);
      const stopReason = data.stopReason as string | undefined;
      if (stopReason && !stats.system.stopReasons.includes(stopReason)) stats.system.stopReasons.push(stopReason);
      stats.system.totalDurationMs += Number(data.durationMs) || 0;
      stats.system.hookCount += Number(data.hookCount) || 0;
      stats.system.hookErrors += Number(data.hookErrors) || 0;
    }

    if (type === 'progress') {
      stats.progress.totalLines++;
    }
  }

  // Compute session duration
  if (stats.timing.firstTimestamp && stats.timing.lastTimestamp) {
    stats.timing.durationMs = new Date(stats.timing.lastTimestamp).getTime() - new Date(stats.timing.firstTimestamp).getTime();
  }

  return stats;
}

/**
 * Sync sessions into the DB from scope frontmatter.
 *
 * Algorithm:
 * 1. Read scopes with non-empty sessions JSON from DB
 * 2. For each scope, parse the sessions JSON: Record<phase, uuid[]>
 * 3. For each (phase, uuid), UPSERT into sessions table with JSONL metadata if available
 */
export async function syncClaudeSessionsToDB(db: Database.Database, scopeService: ScopeService, projectRoot?: string): Promise<number> {
  cacheByDir.clear(); // Force fresh read from filesystem

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
          const jsonlPath = path.join(getSessionsDir(projectRoot), `${uuid}.jsonl`);
          let startedAt: string | null = null;
          let endedAt: string | null = null;
          let summary: string | null = null;

          if (fs.existsSync(jsonlPath)) {
            try {
              const stat = fs.statSync(jsonlPath);
              startedAt = stat.birthtime.toISOString();
              endedAt = stat.mtime.toISOString();

              const content = fs.readFileSync(jsonlPath, 'utf-8');
              const lines = content.trimEnd().split('\n');

              // Prefer explicit summary line from Claude
              const lastLine = JSON.parse(lines[lines.length - 1]);
              if (lastLine.type === 'summary' && lastLine.summary) {
                summary = truncate(lastLine.summary, 200);
              }

              // Fall back to first user message
              if (!summary) {
                summary = extractFirstUserMessage(lines, 200);
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
