import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { createLogger } from '../utils/logger.js';

const log = createLogger('scope');

export interface ParsedScope {
  id: number;
  title: string;
  slug?: string;
  status: string;
  priority: string | null;
  effort_estimate: string | null;
  category: string | null;
  tags: string[];
  blocked_by: number[];
  blocks: number[];
  file_path: string;
  created_at: string | null;
  updated_at: string | null;
  raw_content: string;
  sessions: Record<string, string[]>;
  is_ghost: boolean;
}

const VALID_PRIORITIES = new Set(['critical', 'high', 'medium', 'low']);

const VALID_SESSION_KEYS = new Set([
  'createScope', 'reviewScope', 'implementScope',
  'verifyScope', 'reviewGate', 'fixReview', 'commit',
  'pushToMain', 'pushToDev', 'pushToStaging', 'pushToProduction',
]);

/** Parse and validate the sessions frontmatter field */
function parseSessions(raw: unknown): Record<string, string[]> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const result: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (VALID_SESSION_KEYS.has(key) && Array.isArray(value)) {
      result[key] = value.filter((v): v is string => typeof v === 'string');
    }
  }
  return result;
}

// Map frontmatter statuses to 9-column board states
export const STATUS_MAP: Record<string, string> = {
  'icebox': 'icebox',
  'exploring': 'planning',
  'planning': 'planning',
  'ready': 'backlog',
  'backlog': 'backlog',
  'blocked': 'backlog',
  'in_progress': 'implementing',
  'in-progress': 'implementing',
  'implementing': 'implementing',
  'testing': 'review',
  'review': 'review',
  'complete': 'completed',
  'completed': 'completed',
  'done': 'production',
  'dev': 'dev',
  'staging': 'staging',
  'production': 'production',
};

/** Normalize a raw frontmatter status to a valid board status */
export function normalizeStatus(raw: string): string {
  return STATUS_MAP[raw] ?? raw;
}

/** Generate a stable positive integer hash from a string (for synthetic icebox IDs) */
function slugHash(s: string): number {
  let hash = 5381;
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) + hash + s.charCodeAt(i)) >>> 0;
  }
  // Keep in range 10000-2147483647 to avoid collisions with real scope IDs and suffix-encoded IDs
  return 10000 + (hash % 2137483647);
}

/**
 * Parse a scope markdown file into structured data.
 * Handles both YAML frontmatter and plain markdown formats.
 */
export function parseScopeFile(filePath: string): ParsedScope | null {
  const content = fs.readFileSync(filePath, 'utf-8');
  const fileName = path.basename(filePath, '.md');
  const dirName = path.basename(path.dirname(filePath));

  // Extract ID from filename pattern: NNN[suffix]-description.md
  // Suffixes (a-d, X) encode as thousands offset for unique DB keys
  const idMatch = fileName.match(/^(\d+)([a-dA-DxX])?/);
  const fileId = idMatch ? scopeFileId(parseInt(idMatch[1], 10), idMatch[2]) : 0;

  // Slug-only icebox files: no numeric prefix, e.g. "onboarding-flow.md"
  const isSlugOnly = !idMatch && dirName === 'icebox';

  // Skip non-scope files (but allow slug-only icebox files)
  if (fileId === 0 && !fileName.startsWith('0') && !isSlugOnly) {
    // Files like _template.md, technical-debt.md, backlog_plan.md
    if (fileName.startsWith('_') || !idMatch) return null;
  }

  // For slug-only icebox files, generate a stable negative ID for internal cache indexing.
  // This avoids collisions with real scope IDs (positive) and between icebox items.
  const effectiveId = isSlugOnly ? -slugHash(fileName) : fileId;

  // Try YAML frontmatter first
  const { data: frontmatter, content: markdownBody } = matter(content);

  if (frontmatter && Object.keys(frontmatter).length > 0) {
    const scope = parseFrontmatterScope(frontmatter, markdownBody, filePath, effectiveId, dirName);
    // Populate slug for icebox items
    if (isSlugOnly || dirName === 'icebox') {
      scope.slug = isSlugOnly ? fileName : fileName.replace(/^\d+[a-dA-DxX]?-/, '');
    }
    return scope;
  }

  // Fallback: extract from markdown structure
  const fallbackScope = parseMarkdownScope(content, filePath, effectiveId, dirName);
  if (isSlugOnly || dirName === 'icebox') {
    fallbackScope.slug = isSlugOnly ? fileName : fileName.replace(/^\d+[a-dA-DxX]?-/, '');
  }
  return fallbackScope;
}

function parseFrontmatterScope(
  fm: Record<string, unknown>,
  body: string,
  filePath: string,
  fallbackId: number,
  dirName: string
): ParsedScope {
  // Prefer filename-derived ID (includes suffix encoding) over frontmatter
  const id = fallbackId || ((fm.id as number) ?? 0);
  const rawStatus = String(fm.status ?? inferStatusFromDir(dirName));
  const status = STATUS_MAP[rawStatus] ?? rawStatus;

  return {
    id,
    title: String(fm.title ?? `Scope ${id}`),
    status,
    priority: fm.priority && VALID_PRIORITIES.has(String(fm.priority)) ? String(fm.priority) : null,
    effort_estimate: fm.effort_estimate ? String(fm.effort_estimate) : null,
    category: fm.category ? String(fm.category) : null,
    tags: Array.isArray(fm.tags) ? fm.tags.map(String) : [],
    blocked_by: Array.isArray(fm.blocked_by) ? fm.blocked_by.map(Number) : [],
    blocks: Array.isArray(fm.blocks) ? fm.blocks.map(Number) : [],
    file_path: filePath,
    created_at: fm.created ? String(fm.created) : null,
    updated_at: fm.updated ? String(fm.updated) : null,
    raw_content: body.trim(),
    sessions: parseSessions(fm.sessions),
    is_ghost: fm.ghost === true,
  };
}

function parseMarkdownScope(
  content: string,
  filePath: string,
  id: number,
  dirName: string
): ParsedScope {
  // Extract title from first # heading
  const titleMatch = content.match(/^#\s+(?:Scope\s+\d+:\s*)?(.+)/m);
  const title = titleMatch ? titleMatch[1].trim() : `Scope ${id}`;

  // Extract priority from markdown
  const priorityMatch = content.match(/##\s*Priority:\s*(?:[🔴🟡🟢⚪]\s*)?(\w+)/i);
  const rawPriority = priorityMatch ? priorityMatch[1].toLowerCase() : null;
  const priority = rawPriority && VALID_PRIORITIES.has(rawPriority) ? rawPriority : null;

  // Extract effort estimate
  const effortMatch = content.match(/##\s*(?:Estimated\s+)?Effort:\s*(.+)/i);
  const effort_estimate = effortMatch ? effortMatch[1].trim() : null;

  // Extract category
  const categoryMatch = content.match(/##\s*Category:\s*(.+)/i);
  const category = categoryMatch ? categoryMatch[1].trim() : null;

  // Determine status from directory or content
  const status = inferStatusFromDir(dirName);

  return {
    id,
    title,
    status,
    priority,
    effort_estimate,
    category,
    tags: [],
    blocked_by: [],
    blocks: [],
    file_path: filePath,
    created_at: null,
    updated_at: null,
    raw_content: content,
    sessions: {},
    is_ghost: false,
  };
}

/** Map filename suffix (a-d, X) to a thousands-digit offset for unique IDs */
function scopeFileId(base: number, suffix?: string): number {
  if (!suffix) return base;
  const lower = suffix.toLowerCase();
  if (lower === 'x') return 9000 + base;
  // a=1000, b=2000, c=3000, d=4000
  const offset = (lower.charCodeAt(0) - 96) * 1000;
  return offset + base;
}

/** Valid directory statuses — updated at startup from the workflow engine */
let validDirStatuses: Set<string> | null = null;

/** Initialize the valid status set from the workflow engine's list IDs */
export function setValidStatuses(statuses: Iterable<string>): void {
  validDirStatuses = new Set(statuses);
}

export function inferStatusFromDir(dirName: string): string {
  if (validDirStatuses) {
    return validDirStatuses.has(dirName) ? dirName : 'planning';
  }
  // Fallback for when engine hasn't initialized yet (shouldn't happen in practice)
  return dirName;
}

/**
 * Scan all scope directories and parse all scope files.
 */
export function parseAllScopes(scopesDir: string): ParsedScope[] {
  const scopes: ParsedScope[] = [];

  if (!fs.existsSync(scopesDir)) return scopes;

  // Recursively find all .md files
  function scanDir(dir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        scanDir(fullPath);
      } else if (entry.name.endsWith('.md') && !entry.name.startsWith('_')) {
        const parsed = parseScopeFile(fullPath);
        if (parsed) scopes.push(parsed);
      }
    }
  }

  scanDir(scopesDir);

  // Detect ID collisions — last-write-wins but warn on stderr
  const seen = new Map<number, string>();
  for (const scope of scopes) {
    const existing = seen.get(scope.id);
    if (existing) {
      log.error('Scope ID collision — renumber one of them', { id: scope.id, existing, duplicate: scope.file_path });
    }
    seen.set(scope.id, scope.file_path);
  }

  return scopes.sort((a, b) => a.id - b.id);
}
