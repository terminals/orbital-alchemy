import type { ParsedScope } from '../parsers/scope-parser.js';

/**
 * In-memory cache for parsed scopes.
 * Dual-indexed: ID lookups (API, sprint orchestrator) and file-path reverse index (watcher deletions).
 * Replaces the SQLite `scopes` table — filesystem frontmatter is the single source of truth.
 */
export class ScopeCache {
  private byId = new Map<number, ParsedScope>();
  private filePathToId = new Map<string, number>();

  /** Bulk-load all scopes (called at startup from parseAllScopes result) */
  loadAll(scopes: ParsedScope[]): void {
    this.byId.clear();
    this.filePathToId.clear();
    for (const scope of scopes) {
      this.byId.set(scope.id, scope);
      this.filePathToId.set(scope.file_path, scope.id);
    }
  }

  /** Insert or update a single scope */
  set(scope: ParsedScope): void {
    // Clean up old file_path mapping if the scope moved directories
    const existing = this.byId.get(scope.id);
    if (existing && existing.file_path !== scope.file_path) {
      this.filePathToId.delete(existing.file_path);
    }
    this.byId.set(scope.id, scope);
    this.filePathToId.set(scope.file_path, scope.id);
  }

  /** Remove a scope by its file path (used by watcher on file deletion) */
  removeByFilePath(filePath: string): number | undefined {
    const id = this.filePathToId.get(filePath);
    if (id !== undefined) {
      this.byId.delete(id);
      this.filePathToId.delete(filePath);
    }
    return id;
  }

  /** Look up scope ID by file path (used before removal to stash status) */
  idByFilePath(filePath: string): number | undefined {
    return this.filePathToId.get(filePath);
  }

  /** Check if scope exists by ID */
  has(id: number): boolean {
    return this.byId.has(id);
  }

  /** Get a scope by ID */
  getById(id: number): ParsedScope | undefined {
    return this.byId.get(id);
  }

  /** Get all scopes sorted by ID */
  getAll(): ParsedScope[] {
    return [...this.byId.values()].sort((a, b) => a.id - b.id);
  }

  /** Get the maximum raw scope number excluding icebox scopes (for next-ID generation).
   *  Cache keys use encoded IDs (suffixed scopes like 047a → 1047, 075x → 9075),
   *  but next-ID generation needs the raw scope number (047, 075, 087). */
  maxNonIceboxId(): number {
    let max = 0;
    for (const [id, scope] of this.byId) {
      if (scope.status === 'icebox') continue;
      // Decode: encoded IDs ≥1000 have a suffix offset — raw number is id % 1000
      const raw = id >= 1000 ? id % 1000 : id;
      if (raw > max) max = raw;
    }
    return max;
  }

  /** Total number of cached scopes */
  get size(): number {
    return this.byId.size;
  }
}
