import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import type { Emitter } from '../project-emitter.js';
import type { ParsedScope } from '../parsers/scope-parser.js';
import { normalizeStatus, parseAllScopes, parseScopeFile, setValidStatuses, inferStatusFromDir } from '../parsers/scope-parser.js';
import type { WorkflowEngine } from '../../shared/workflow-engine.js';
import type { TransitionContext, TransitionResult } from '../../shared/workflow-config.js';
import type { ScopeCache } from './scope-cache.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('scope');

export class ScopeService {
  private onStatusChangeCallbacks: Array<(id: number, status: string) => void> = [];
  private activeGroupCheck: ((scopeId: number) => { sprint_id: number; group_type: string } | null) | null = null;
  private suppressedPaths = new Set<string>();
  /** Stash old status when removeByFilePath fires before updateFromFile (chokidar unlink→add) */
  private recentlyRemoved = new Map<number, string>();

  constructor(
    private cache: ScopeCache,
    private io: Emitter,
    private scopesDir: string,
    private engine: WorkflowEngine,
  ) {}

  /** Register a callback that checks if a scope is in an active group (sprint/batch).
   *  Used to guard patch-context status changes. */
  setActiveGroupCheck(fn: (scopeId: number) => { sprint_id: number; group_type: string } | null): void {
    this.activeGroupCheck = fn;
  }

  /** Register a callback fired after every successful status update */
  onStatusChange(cb: (id: number, status: string) => void): void {
    this.onStatusChangeCallbacks.push(cb);
  }

  /** Load all scopes from the filesystem into the in-memory cache */
  syncFromFilesystem(): number {
    // Push the engine's valid list IDs to the scope parser so
    // inferStatusFromDir doesn't rely on a hardcoded set.
    setValidStatuses(this.engine.getLists().map(l => l.id));
    const scopes = parseAllScopes(this.scopesDir);
    this.cache.loadAll(scopes);
    return scopes.length;
  }

  /** Check if a path is suppressed from watcher processing (during programmatic moves) */
  isSuppressed(filePath: string): boolean {
    return this.suppressedPaths.has(filePath);
  }

  /** Re-parse a single scope file and update the cache */
  updateFromFile(filePath: string): void {
    const scope = parseScopeFile(filePath);
    if (!scope) return;

    const previous = this.cache.getById(scope.id);
    const previousStatus = previous?.status ?? this.recentlyRemoved.get(scope.id);
    const existing = previous != null;
    this.cache.set(scope);
    this.recentlyRemoved.delete(scope.id);

    const event = existing ? 'scope:updated' : 'scope:created';
    this.io.emit(event, scope);

    // Fire onStatusChange callbacks when status changed via external file move
    // (e.g. scope-transition.sh, manual mv). This ensures batch/sprint
    // orchestrators are notified even when the change bypasses updateStatus().
    // Chokidar fires unlink→add for moves, so the cache entry may already be
    // removed by removeByFilePath — check recentlyRemoved for the old status.
    if (previousStatus != null && previousStatus !== scope.status) {
      for (const cb of this.onStatusChangeCallbacks) cb(scope.id, scope.status);
    }
  }

  /** Remove a scope when its file is deleted */
  removeByFilePath(filePath: string): void {
    // Stash status before removal so updateFromFile can detect external moves
    // (chokidar fires unlink before add when a file is moved between directories)
    const scopeId = this.cache.idByFilePath(filePath);
    const previous = scopeId != null ? this.cache.getById(scopeId) : undefined;
    const id = this.cache.removeByFilePath(filePath);
    if (id !== undefined) {
      if (previous) this.recentlyRemoved.set(id, previous.status);
      this.io.emit('scope:deleted', id);
      // Clean up stash after a short window (if add never fires, this was a real delete)
      setTimeout(() => this.recentlyRemoved.delete(id), 5000);
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

      // Guard: block manual moves for scopes in active groups (sprint/batch)
      if (context === 'patch' && this.activeGroupCheck) {
        const group = this.activeGroupCheck(id);
        if (group) {
          return { ok: false, error: `Scope is in an active ${group.group_type} (ID: ${group.sprint_id})`, code: 'SCOPE_IN_ACTIVE_GROUP' };
        }
      }

      const check = this.engine.validateTransition(current.status, status, context);
      if (!check.ok) return check;
    }

    // Fetch current scope for fromStatus logging. In bulk-sync/rollback contexts
    // the validation block above is skipped, so this may be the first lookup.
    const current = this.cache.getById(id);
    const fromStatus = current?.status ?? 'unknown';
    const result = this.updateScopeFrontmatter(id, { status }, context);
    if (result.ok) {
      log.info('Status updated', { id, from: fromStatus, to: status, context });
      for (const cb of this.onStatusChangeCallbacks) cb(id, status);
    }
    return result;
  }

  /** Compute the next sequential scope ID by scanning all non-icebox scopes.
   *  Checks both filesystem (all subdirs except icebox) and cache to prevent collisions.
   *  Skips IDs >= 500 to handle legacy icebox-origin files during migration. */
  private getNextScopeId(): number {
    let maxId = 0;

    // Scan all scope subdirectories except icebox
    if (fs.existsSync(this.scopesDir)) {
      for (const dir of fs.readdirSync(this.scopesDir, { withFileTypes: true })) {
        if (!dir.isDirectory() || dir.name === 'icebox') continue;
        const dirPath = path.join(this.scopesDir, dir.name);
        for (const file of fs.readdirSync(dirPath)) {
          const m = file.match(/^(\d+)-/);
          if (!m) continue;
          const id = parseInt(m[1], 10);
          // Skip legacy icebox-origin IDs (500+) to prevent namespace pollution
          if (id >= 500) continue;
          maxId = Math.max(maxId, id);
        }
      }
    }

    // Cross-check cache (catches scopes in unexpected locations)
    const cacheMax = this.cache.maxNonIceboxId();
    maxId = Math.max(maxId, cacheMax);

    return maxId + 1;
  }

  // ─── Idea CRUD (filesystem-backed icebox cards) ────────────

  /** Normalize Date objects in gray-matter frontmatter to YYYY-MM-DD strings */
  private normalizeFrontmatterDates(data: Record<string, unknown>): void {
    for (const key of Object.keys(data)) {
      if (data[key] instanceof Date) {
        data[key] = (data[key] as Date).toISOString().split('T')[0];
      }
    }
  }

  /** Generate a slug from a title */
  private slugify(title: string): string {
    const slug = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60);
    if (!slug) return 'untitled';
    return slug;
  }

  /** Find an icebox file by its slug.
   *  Matches slug-only files ({slug}.md) and legacy numeric-prefixed files ({NNN}-{slug}.md). */
  private findIdeaFile(iceboxDir: string, slug: string): string | null {
    if (!fs.existsSync(iceboxDir)) return null;
    const match = fs.readdirSync(iceboxDir).find((f) => {
      if (!f.endsWith('.md')) return false;
      // Match slug-only: {slug}.md
      if (f === `${slug}.md`) return true;
      // Match legacy numeric-prefixed: {NNN}-{slug}.md
      return f.match(/^\d+-/) && f.slice(f.indexOf('-') + 1) === `${slug}.md`;
    });
    return match ? path.join(iceboxDir, match) : null;
  }

  /** Create an icebox idea as a slug-only markdown file. */
  createIdeaFile(title: string, description: string): { slug: string; title: string } {
    const iceboxDir = path.join(this.scopesDir, 'icebox');
    if (!fs.existsSync(iceboxDir)) fs.mkdirSync(iceboxDir, { recursive: true });

    const slug = this.slugify(title);
    let fileName = `${slug}.md`;
    let filePath = path.join(iceboxDir, fileName);

    // Handle slug collisions by appending -2, -3, etc.
    if (fs.existsSync(filePath)) {
      let suffix = 2;
      while (fs.existsSync(path.join(iceboxDir, `${slug}-${suffix}.md`))) suffix++;
      fileName = `${slug}-${suffix}.md`;
      filePath = path.join(iceboxDir, fileName);
    }

    const finalSlug = fileName.replace(/\.md$/, '');
    const now = new Date().toISOString().split('T')[0];

    const content = [
      '---',
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
    log.info('Idea created', { slug: finalSlug, title });
    return { slug: finalSlug, title };
  }

  /** Update an icebox idea's title and description in-place. Renames the file if the title slug changes. */
  updateIdeaFile(slug: string, title: string, description: string): boolean {
    const iceboxDir = path.join(this.scopesDir, 'icebox');
    const filePath = this.findIdeaFile(iceboxDir, slug);
    if (!filePath) return false;

    // Preserve the original created date from existing frontmatter
    const existing = fs.readFileSync(filePath, 'utf-8');
    const parsed = matter(existing);
    const created = parsed.data.created ? String(parsed.data.created) : new Date().toISOString().split('T')[0];
    const now = new Date().toISOString().split('T')[0];

    // Update frontmatter fields while preserving other data (like ghost)
    parsed.data.title = title;
    parsed.data.updated = now;
    parsed.data.created = created;
    this.normalizeFrontmatterDates(parsed.data);

    const newContent = matter.stringify(description ? `\n${description}\n` : '\n', parsed.data);
    fs.writeFileSync(filePath, newContent, 'utf-8');

    // If title changed, rename file to new slug
    const newSlug = this.slugify(title);
    if (newSlug !== slug) {
      const newFileName = `${newSlug}.md`;
      const newPath = path.join(iceboxDir, newFileName);
      if (!fs.existsSync(newPath)) {
        this.removeByFilePath(filePath);
        fs.renameSync(filePath, newPath);
        this.updateFromFile(newPath);
      } else {
        // Collision with existing slug — keep old filename, still sync content changes
        log.warn('Slug collision during rename, keeping old filename', { slug, newSlug });
        this.updateFromFile(filePath);
      }
    } else {
      // Eagerly sync content changes to cache
      this.updateFromFile(filePath);
    }

    return true;
  }

  /** Delete an icebox idea by removing its file */
  deleteIdeaFile(slug: string): boolean {
    const iceboxDir = path.join(this.scopesDir, 'icebox');
    const filePath = this.findIdeaFile(iceboxDir, slug);
    if (!filePath) return false;

    fs.unlinkSync(filePath);
    // Eagerly remove from cache + emit scope:deleted
    this.removeByFilePath(filePath);
    log.info('Idea deleted', { slug });
    return true;
  }

  /** Promote an icebox idea to planning — assigns a proper sequential scope ID,
   *  moves the file, and syncs cache. Returns the new scope ID. */
  promoteIdea(slug: string): { id: number; filePath: string; title: string; description: string } | null {
    const iceboxDir = path.join(this.scopesDir, 'icebox');
    const oldPath = this.findIdeaFile(iceboxDir, slug);
    if (!oldPath) return null;

    // Read existing file for metadata
    const raw = fs.readFileSync(oldPath, 'utf-8');
    const parsed = matter(raw);
    const title = parsed.data.title ? String(parsed.data.title) : 'Untitled';
    const created = parsed.data.created ? String(parsed.data.created) : new Date().toISOString().split('T')[0];
    const description = parsed.content.trim();

    // Assign the next sequential scope ID (excludes icebox items)
    const newId = this.getNextScopeId();
    const paddedId = String(newId).padStart(3, '0');

    // Build new path
    const titleSlug = this.slugify(title);
    const planningDir = path.join(this.scopesDir, 'planning');
    if (!fs.existsSync(planningDir)) fs.mkdirSync(planningDir, { recursive: true });
    const newFileName = `${paddedId}-${titleSlug}.md`;
    const newPath = path.join(planningDir, newFileName);
    const now = new Date().toISOString().split('T')[0];

    // Update frontmatter in-place: assign ID and change status (preserve other fields)
    parsed.data.id = newId;
    parsed.data.status = 'planning';
    parsed.data.updated = now;
    parsed.data.created = created;
    delete parsed.data.ghost;
    this.normalizeFrontmatterDates(parsed.data);

    const newContent = matter.stringify(parsed.content, parsed.data);

    // Write updated content to old path, then rename/move (no intermediate missing state)
    const originalContent = fs.readFileSync(oldPath, 'utf-8');
    fs.writeFileSync(oldPath, newContent, 'utf-8');
    try {
      fs.renameSync(oldPath, newPath);
    } catch (err) {
      // Restore original content on rename failure
      fs.writeFileSync(oldPath, originalContent, 'utf-8');
      log.error('Failed to rename during promote', { oldPath, newPath, error: String(err) });
      return null;
    }
    this.updateFromFile(newPath);
    this.removeByFilePath(oldPath);

    const relPath = path.relative(path.resolve(this.scopesDir, '..'), newPath);
    log.info('Idea promoted', { slug, newId, title });
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
    const dirName = path.basename(path.dirname(filePath));
    const rawOldStatus = String(parsed.data.status ?? inferStatusFromDir(dirName));
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
      log.info('Frontmatter updated', { id, fields: Object.keys(fields) });
      return { ok: true };
    }

    // Status change → move file to new directory
    const targetDir = path.join(this.scopesDir, newStatus!);
    if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

    const fileName = path.basename(filePath);
    const newPath = path.join(targetDir, fileName);
    const newContent = matter.stringify(parsed.content, parsed.data);

    // Suppress watcher events during programmatic move to prevent race conditions
    this.suppressedPaths.add(filePath);
    this.suppressedPaths.add(newPath);

    // Update content in-place, then atomic rename (no window where file is missing)
    fs.writeFileSync(filePath, newContent, 'utf-8');
    fs.renameSync(filePath, newPath);
    this.updateFromFile(newPath);
    this.removeByFilePath(filePath);

    // Clear suppression after watcher events have drained
    setTimeout(() => {
      this.suppressedPaths.delete(filePath);
      this.suppressedPaths.delete(newPath);
    }, 500);

    return { ok: true, moved: true };
  }

  /** Approve a ghost idea — removes ghost:true from frontmatter and refreshes cache */
  approveGhostIdea(slug: string): boolean {
    const iceboxDir = path.join(this.scopesDir, 'icebox');
    const filePath = this.findIdeaFile(iceboxDir, slug);
    if (!filePath) return false;

    const content = fs.readFileSync(filePath, 'utf-8');
    // Remove ghost: true line from frontmatter
    const updated = content.replace(/^ghost:\s*true\n/m, '');
    fs.writeFileSync(filePath, updated, 'utf-8');

    // Re-parse file to refresh cache with is_ghost=false
    this.updateFromFile(filePath);
    log.info('Ghost approved', { slug });

    return true;
  }
}
