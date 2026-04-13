import fs from 'fs';
import { createLogger } from '../utils/logger.js';

const log = createLogger('event');

export interface RawEvent {
  id: string;
  type: string;
  scope_id?: number | null;
  session_id?: string | null;
  agent?: string | null;
  data?: Record<string, unknown>;
  timestamp: string;
}

/**
 * Parse a JSON event file from .claude/orbital-events/
 *
 * Handles two formats:
 * - Full format: top-level scope_id, agent, session_id fields
 * - Minimal format: all info nested inside `data` (from orbital-emit.sh)
 *
 * When top-level fields are missing, extracts them from `data`:
 * - data.agent or data.agents[0] → agent
 * - data.scope_id → scope_id
 * - data.session_id → session_id
 */
export function parseEventFile(filePath: string): RawEvent | null {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(content) as Record<string, unknown>;

    if (!parsed.id || !parsed.type || !parsed.timestamp) {
      return null;
    }

    const data = (parsed.data ?? {}) as Record<string, unknown>;

    return {
      id: String(parsed.id),
      type: String(parsed.type),
      scope_id: extractScopeId(parsed.scope_id, data),
      session_id: extractString(parsed.session_id, data.session_id),
      agent: extractAgent(parsed.agent, data),
      data,
      timestamp: String(parsed.timestamp),
    };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== 'ENOENT') {
      log.warn('Failed to parse event file', { file: filePath, error: (err as Error).message });
    }
    return null;
  }
}

/** Extract scope_id from top-level or data payload */
function extractScopeId(topLevel: unknown, data: Record<string, unknown>): number | null {
  if (topLevel != null && topLevel !== '') return Number(topLevel);
  if (data.scope_id != null && data.scope_id !== '') return Number(data.scope_id);
  return null;
}

/** Extract agent name from top-level or data.agent / data.agents[0] */
function extractAgent(topLevel: unknown, data: Record<string, unknown>): string | null {
  if (typeof topLevel === 'string' && topLevel !== '') return topLevel;
  if (typeof data.agent === 'string' && data.agent !== '') return data.agent;
  if (Array.isArray(data.agents) && data.agents.length > 0) return String(data.agents[0]);
  return null;
}

/** Extract a string value from top-level or data fallback */
function extractString(topLevel: unknown, fallback: unknown): string | null {
  if (typeof topLevel === 'string' && topLevel !== '') return topLevel;
  if (typeof fallback === 'string' && fallback !== '') return fallback;
  return null;
}
