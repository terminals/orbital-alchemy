import { describe, it, expect, beforeEach } from 'vitest';
import { ScopeCache } from './scope-cache.js';
import type { ParsedScope } from '../parsers/scope-parser.js';

function makeScope(overrides: Partial<ParsedScope> & { id: number }): ParsedScope {
  return {
    title: `Scope ${overrides.id}`,
    slug: undefined,
    status: 'backlog',
    priority: null,
    effort_estimate: null,
    category: null,
    tags: [],
    blocked_by: [],
    blocks: [],
    file_path: `/scopes/backlog/${String(overrides.id).padStart(3, '0')}-test.md`,
    created_at: null,
    updated_at: null,
    raw_content: '',
    sessions: {},
    is_ghost: false,
    favourite: false,
    ...overrides,
  };
}

describe('ScopeCache', () => {
  let cache: ScopeCache;

  beforeEach(() => {
    cache = new ScopeCache();
  });

  describe('loadAll()', () => {
    it('populates both indexes', () => {
      const scopes = [makeScope({ id: 1 }), makeScope({ id: 2 })];
      cache.loadAll(scopes);
      expect(cache.size).toBe(2);
      expect(cache.getById(1)).toBeDefined();
      expect(cache.getById(2)).toBeDefined();
    });

    it('clears previous data on re-load', () => {
      cache.loadAll([makeScope({ id: 1 })]);
      expect(cache.size).toBe(1);

      cache.loadAll([makeScope({ id: 5 }), makeScope({ id: 6 })]);
      expect(cache.size).toBe(2);
      expect(cache.has(1)).toBe(false);
      expect(cache.has(5)).toBe(true);
    });
  });

  describe('set()', () => {
    it('adds new scope', () => {
      cache.set(makeScope({ id: 10 }));
      expect(cache.has(10)).toBe(true);
      expect(cache.size).toBe(1);
    });

    it('updates existing scope', () => {
      cache.set(makeScope({ id: 10, title: 'Original' }));
      cache.set(makeScope({ id: 10, title: 'Updated' }));
      expect(cache.getById(10)?.title).toBe('Updated');
      expect(cache.size).toBe(1);
    });

    it('cleans up old file_path index when scope moves', () => {
      const oldPath = '/scopes/backlog/010-test.md';
      const newPath = '/scopes/implementing/010-test.md';

      cache.set(makeScope({ id: 10, file_path: oldPath }));
      expect(cache.idByFilePath(oldPath)).toBe(10);

      cache.set(makeScope({ id: 10, file_path: newPath }));
      expect(cache.idByFilePath(oldPath)).toBeUndefined();
      expect(cache.idByFilePath(newPath)).toBe(10);
    });
  });

  describe('removeByFilePath()', () => {
    it('removes from both indexes and returns removed ID', () => {
      const scope = makeScope({ id: 10 });
      cache.set(scope);

      const removedId = cache.removeByFilePath(scope.file_path);
      expect(removedId).toBe(10);
      expect(cache.has(10)).toBe(false);
      expect(cache.idByFilePath(scope.file_path)).toBeUndefined();
    });

    it('returns undefined for unknown path', () => {
      expect(cache.removeByFilePath('/nonexistent')).toBeUndefined();
    });
  });

  describe('read operations', () => {
    beforeEach(() => {
      cache.loadAll([
        makeScope({ id: 3, title: 'Three' }),
        makeScope({ id: 1, title: 'One' }),
        makeScope({ id: 2, title: 'Two' }),
      ]);
    });

    it('getById() returns scope or undefined', () => {
      expect(cache.getById(1)?.title).toBe('One');
      expect(cache.getById(999)).toBeUndefined();
    });

    it('getAll() returns sorted by ID', () => {
      const all = cache.getAll();
      expect(all.map(s => s.id)).toEqual([1, 2, 3]);
    });

    it('has() returns boolean', () => {
      expect(cache.has(1)).toBe(true);
      expect(cache.has(999)).toBe(false);
    });

    it('idByFilePath() returns ID or undefined', () => {
      const scope = cache.getById(1)!;
      expect(cache.idByFilePath(scope.file_path)).toBe(1);
      expect(cache.idByFilePath('/nonexistent')).toBeUndefined();
    });
  });

  describe('maxNonIceboxId()', () => {
    it('returns 0 for empty cache', () => {
      expect(cache.maxNonIceboxId()).toBe(0);
    });

    it('returns highest raw ID', () => {
      cache.loadAll([
        makeScope({ id: 10, status: 'backlog' }),
        makeScope({ id: 20, status: 'implementing' }),
        makeScope({ id: 5, status: 'review' }),
      ]);
      expect(cache.maxNonIceboxId()).toBe(20);
    });

    it('ignores icebox-status scopes', () => {
      cache.loadAll([
        makeScope({ id: 10, status: 'backlog' }),
        makeScope({ id: 50, status: 'icebox' }),
      ]);
      expect(cache.maxNonIceboxId()).toBe(10);
    });

    it('decodes encoded IDs (>= 1000) to raw numbers', () => {
      // 1047 → suffix-encoded → raw is 1047 % 1000 = 47
      cache.loadAll([
        makeScope({ id: 1047, status: 'backlog' }),
        makeScope({ id: 10, status: 'implementing' }),
      ]);
      expect(cache.maxNonIceboxId()).toBe(47);
    });

    it('skips raw IDs >= 500 (legacy icebox-origin)', () => {
      cache.loadAll([
        makeScope({ id: 501, status: 'backlog' }),
        makeScope({ id: 30, status: 'implementing' }),
      ]);
      expect(cache.maxNonIceboxId()).toBe(30);
    });
  });
});
