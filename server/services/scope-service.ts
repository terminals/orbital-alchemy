import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import type { Server } from 'socket.io';
import type { ParsedScope } from '../parsers/scope-parser.js';
import { normalizeStatus, parseAllScopes, parseScopeFile } from '../parsers/scope-parser.js';
import type { WorkflowEngine } from '../../shared/workflow-engine.js';
import type { TransitionContext, TransitionResult } from '../../shared/workflow-config.js';
import type { ScopeCache } from './scope-cache.js';

export class ScopeService {
  private onStatusChangeCallbacks: Array<(id: number, status: string) => void> = [];

  constructor(
    private cache: ScopeCache,
    private io: Server,
    private scopesDir: string,
    private engine: WorkflowEngine,
  ) {}

  /** Register a callback fired after every successful status update */
  onStatusChange(cb: (id: number, status: string) => void): void {
    this.onStatusChangeCallbacks.push(cb);
  }

  /** Load all scopes from the filesystem into the in-memory cache */
  syncFromFilesystem(): number {
    const scopes = parseAllScopes(this.scopesDir);
    this.cache.loadAll(scopes);
    return scopes.length;
  }

  /** Re-parse a single scope file and update the cache */
  updateFromFile(filePath: string): void {
    const scope = parseScopeFile(filePath);
    if (!scope) return;

    const existing = this.cache.has(scope.id);
    this.cache.set(scope);

    const event = existing ? 'scope:updated' : 'scope:created';
    this.io.emit(event, scope);
  }

  /** Remove a scope when its file is deleted */
  removeByFilePath(filePath: string): void {
    const id = this.cache.removeByFilePath(filePath);
    if (id !== undefined) {
      this.io.emit('scope:deleted', id);
    }
  }

  /** Get all scopes (already native arrays/objects — no JSON parsing needed) */
  getAll(): ParsedScope[] {
    return this.cache.getAll();
  }

  /** Get a single scope by ID */
  getById(id: number): ParsedScope | undefined {
    return this.cache.getById(id);
  }

  /** Update a scope's status with transition validation.
   *  Writes the new status to the frontmatter file and updates the cache.
   *  @param context - caller trust level: 'patch', 'dispatch', 'event', 'bulk-sync', 'rollback' */
  updateStatus(
    id: number,
    status: string,
    context: TransitionContext = 'patch',
  ): TransitionResult {
    if (!this.engine.isValidStatus(status)) {
      return { ok: false, error: `Invalid status: '${status}'`, code: 'INVALID_STATUS' };
    }

    // For non-skip contexts, validate the transition
    if (context !== 'bulk-sync' && context !== 'rollback') {
      const current = this.cache.getById(id);
      if (!current) {
        return { ok: false, error: 'Scope not found', code: 'NOT_FOUND' };
      }
      const check = this.engine.validateTransition(current.status, status, context);
      if (!check.ok) return check;
    }

    // Write to filesystem via updateScopeFrontmatter (which updates cache + emits)
    const result = this.updateScopeFrontmatter(id, { status }, context);
    if (result.ok) {
      for (const cb of this.onStatusChangeCallbacks) cb(id, status);
    }
    return result;
  }

  /** Compute the next sequential scope ID by scanning all non-icebox scopes.
   *  Checks both filesystem (all subdirs except icebox) and cache to prevent collisions. */
  private getNextScopeId(): number {
    let maxId = 0;

    // Scan all scope subdirectories except icebox
    if (fs.existsSync(this.scopesDir)) {
      for (const dir of fs.readdirSync(this.scopesDir, { withFileTypes: true })) {
        if (!dir.isDirectory() || dir.name === 'icebox') continue;
        const dirPath = path.join(this.scopesDir, dir.name);
        for (const file of fs.readdirSync(dirPath)) {
          const m = file.match(/^(\d+)-/);
          if (m) maxId = Math.max(maxId, parseInt(m[1], 10));
        }
      }
    }

    // Cross-check cache (catches scopes in unexpected locations)
    const cacheMax = this.cache.maxNonIceboxId();
    maxId = Math.max(maxId, cacheMax);

    return maxId + 1;
  }

  // ─── Idea CRUD (filesystem-backed icebox cards) ────────────

  /** Get the next available icebox ID (starts at 501, increments from max found) */
  getNextIceboxId(): number {
    const iceboxDir = path.join(this.scopesDir, 'icebox');
    if (!fs.existsSync(iceboxDir)) return 501;
    let maxId = 500;
    for (const file of fs.readdirSync(iceboxDir)) {
      const m = file.match(/^(\d+)-/);
      if (m) maxId = Math.max(maxId, parseInt(m[1], 10));
    }
    return maxId + 1;
  }

  /** Find an icebox file by its ID prefix.
   *  Matches both padded (091-) and unpadded (91-) filenames
   *  since demoted scopes keep their 3-digit-padded names. */
  private findIdeaFile(iceboxDir: string, id: number): string | null {
    if (!fs.existsSync(iceboxDir)) return null;
    const match = fs.readdirSync(iceboxDir).find((f) => {
      if (!f.endsWith('.md')) return false;
      const m = f.match(/^(\d+)-/);
      return m != null && parseInt(m[1], 10) === id;
    });
    return match ? path.join(iceboxDir, match) : null;
  }

  /** Create an icebox idea as a markdown file. IDs start at 501. */
  createIdeaFile(title: string, description: string): { id: number; title: string } {
    const iceboxDir = path.join(this.scopesDir, 'icebox');
    if (!fs.existsSync(iceboxDir)) fs.mkdirSync(iceboxDir, { recursive: true });

    const nextId = this.getNextIceboxId();

    const slug = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60);
    const fileName = `${nextId}-${slug}.md`;
    const filePath = path.join(iceboxDir, fileName);
    const now = new Date().toISOString().split('T')[0];

    const content = [
      '---',
      `id: ${nextId}`,
      `title: "${title.replace(/"/g, '\\"')}"`,
      'status: icebox',
      `created: ${now}`,
      `updated: ${now}`,
      'blocked_by: []',
      'blocks: []',
      'tags: []',
      '---',
      '',
      description || '',
      '',
    ].join('\n');

    fs.writeFileSync(filePath, content, 'utf-8');

    // Eagerly sync to cache + emit scope:created
    this.updateFromFile(filePath);
    return { id: nextId, title };
  }

  /** Update an icebox idea's title and description by rewriting its file */
  updateIdeaFile(id: number, title: string, description: string): boolean {
    const iceboxDir = path.join(this.scopesDir, 'icebox');
    const filePath = this.findIdeaFile(iceboxDir, id);
    if (!filePath) return false;

    // Preserve the original created date from existing frontmatter
    const existing = fs.readFileSync(filePath, 'utf-8');
    const createdMatch = existing.match(/^created:\s*(.+)$/m);
    const created = createdMatch?.[1]?.trim() ?? new Date().toISOString().split('T')[0];
    const now = new Date().toISOString().split('T')[0];

    const content = [
      '---',
      `id: ${id}`,
      `title: "${title.replace(/"/g, '\\"')}"`,
      'status: icebox',
      `created: ${created}`,
      `updated: ${now}`,
      'blocked_by: []',
      'blocks: []',
      'tags: []',
      '---',
      '',
      description || '',
      '',
    ].join('\n');

    fs.writeFileSync(filePath, content, 'utf-8');
    // Watcher handles cache sync + scope:updated event
    return true;
  }

  /** Delete an icebox idea by removing its file */
  deleteIdeaFile(id: number): boolean {
    const iceboxDir = path.join(this.scopesDir, 'icebox');
    const filePath = this.findIdeaFile(iceboxDir, id);
    if (!filePath) return false;

    fs.unlinkSync(filePath);
    // Eagerly remove from cache + emit scope:deleted
    this.removeByFilePath(filePath);
    return true;
  }

  /** Promote an icebox idea to planning — assigns a proper sequential scope ID,
   *  moves the file, and syncs cache. Returns the new scope ID. */
  promoteIdea(id: number): { id: number; filePath: string; title: string; description: string } | null {
    const iceboxDir = path.join(this.scopesDir, 'icebox');
    const oldPath = this.findIdeaFile(iceboxDir, id);
    if (!oldPath) return null;

    // Read existing file for metadata
    const content = fs.readFileSync(oldPath, 'utf-8');
    const titleMatch = content.match(/^title:\s*"?([^"\n]+)"?\s*$/m);
    const createdMatch = content.match(/^created:\s*(.+)$/m);
    const title = titleMatch?.[1]?.trim() ?? 'Untitled';
    const created = createdMatch?.[1]?.trim() ?? new Date().toISOString().split('T')[0];

    // Extract body after frontmatter
    const fmEnd = content.indexOf('---', content.indexOf('---') + 3);
    const description = fmEnd !== -1 ? content.slice(fmEnd + 3).trim() : '';

    // Assign the next sequential scope ID (excludes icebox items)
    const newId = this.getNextScopeId();
    const paddedId = String(newId).padStart(3, '0');

    // Build slug and new path
    const slug = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60);
    const planningDir = path.join(this.scopesDir, 'planning');
    if (!fs.existsSync(planningDir)) fs.mkdirSync(planningDir, { recursive: true });
    const newFileName = `${paddedId}-${slug}.md`;
    const newPath = path.join(planningDir, newFileName);
    const now = new Date().toISOString().split('T')[0];

    // Write new file with planning status and new sequential ID
    const newContent = [
      '---',
      `id: ${paddedId}`,
      `title: "${title.replace(/"/g, '\\"')}"`,
      'status: planning',
      `created: ${created}`,
      `updated: ${now}`,
      'blocked_by: []',
      'blocks: []',
      'tags: []',
      '---',
      '',
      description || '',
      '',
    ].join('\n');

    fs.writeFileSync(newPath, newContent, 'utf-8');
    fs.unlinkSync(oldPath);

    // Sync cache: remove old icebox entry, ingest new scope with proper ID
    this.removeByFilePath(oldPath);
    this.updateFromFile(newPath);

    const relPath = path.relative(path.resolve(this.scopesDir, '..'), newPath);
    return { id: newId, filePath: relPath, title, description };
  }

  /** Find a scope file by its numeric ID prefix across all status directories */
  findScopeFile(id: number): string | null {
    if (!fs.existsSync(this.scopesDir)) return null;
    const paddedId = String(id).padStart(3, '0');
    const prefixes = [`${id}-`, `${paddedId}-`];

    for (const dir of fs.readdirSync(this.scopesDir, { withFileTypes: true })) {
      if (!dir.isDirectory()) continue;
      const dirPath = path.join(this.scopesDir, dir.name);
      for (const file of fs.readdirSync(dirPath)) {
        if (file.endsWith('.md') && prefixes.some((p) => file.startsWith(p))) {
          return path.join(dirPath, file);
        }
      }
    }
    return null;
  }

  /** Update a scope's frontmatter fields and write back to the .md file.
   *  If status changes, validates the transition and moves the file to the new status directory.
   *  @param context - transition context for validation (default 'patch') */
  updateScopeFrontmatter(
    id: number,
    fields: Record<string, unknown>,
    context: TransitionContext = 'patch',
  ): TransitionResult & { moved?: boolean } {
    const filePath = this.findScopeFile(id);
    if (!filePath) {
      return { ok: false, error: 'Scope file not found', code: 'NOT_FOUND' };
    }

    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = matter(raw);
    const today = new Date().toISOString().split('T')[0];

    // Validate status transition before any writes
    const newStatus = fields.status as string | undefined;
    const rawOldStatus = String(parsed.data.status ?? 'planning');
    const oldStatus = normalizeStatus(rawOldStatus);
    let needsMove = false;

    if (newStatus && newStatus !== oldStatus) {
      if (!this.engine.isValidStatus(newStatus)) {
        return { ok: false, error: `Invalid status: '${newStatus}'`, code: 'INVALID_STATUS' };
      }
      const check = this.engine.validateTransition(oldStatus, newStatus, context);
      if (!check.ok) return check;
      needsMove = true;
      // Auto-unlock spec when reverting backlog → planning
      if (newStatus === 'planning' && oldStatus === 'backlog') fields.spec_locked = false;
    }

    // Merge editable fields into frontmatter
    const editableKeys = ['title', 'status', 'priority', 'effort_estimate', 'category', 'tags', 'blocked_by', 'blocks', 'spec_locked'];
    for (const key of editableKeys) {
      if (key in fields) {
        const val = fields[key];
        // Treat empty strings / null as removal (delete the key)
        if (val === null || val === '' || val === 'none') {
          delete parsed.data[key];
        } else {
          parsed.data[key] = val;
        }
      }
    }
    parsed.data.updated = today;

    // Normalize Date objects to YYYY-MM-DD strings to prevent matter.stringify
    // from converting them to full ISO timestamps (gray-matter auto-parses bare dates)
    for (const key of Object.keys(parsed.data)) {
      const val = parsed.data[key];
      if (val instanceof Date) {
        parsed.data[key] = val.toISOString().split('T')[0];
      }
    }

    if (!needsMove) {
      // Simple in-place rewrite
      fs.writeFileSync(filePath, matter.stringify(parsed.content, parsed.data), 'utf-8');
      // Chokidar will pick this up, but eagerly sync for instant feedback
      this.updateFromFile(filePath);
      return { ok: true };
    }

    // Status change → move file to new directory (pattern: promoteIdea)
    const targetDir = path.join(this.scopesDir, newStatus!);
    if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

    const fileName = path.basename(filePath);
    const newPath = path.join(targetDir, fileName);
    const newContent = matter.stringify(parsed.content, parsed.data);

    // Write new → sync cache → delete old (avoids delete flash)
    fs.writeFileSync(newPath, newContent, 'utf-8');
    this.updateFromFile(newPath);
    fs.unlinkSync(filePath);
    this.removeByFilePath(filePath);

    return { ok: true, moved: true };
  }

  /** Approve a ghost idea — removes ghost:true from frontmatter and refreshes cache */
  approveGhostIdea(id: number): boolean {
    const iceboxDir = path.join(this.scopesDir, 'icebox');
    const filePath = this.findIdeaFile(iceboxDir, id);
    if (!filePath) return false;

    const content = fs.readFileSync(filePath, 'utf-8');
    // Remove ghost: true line from frontmatter
    const updated = content.replace(/^ghost:\s*true\n/m, '');
    fs.writeFileSync(filePath, updated, 'utf-8');

    // Re-parse file to refresh cache with is_ghost=false
    this.updateFromFile(filePath);

    return true;
  }
}
