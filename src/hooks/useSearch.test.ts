import { describe, it, expect, vi } from 'vitest';
import type { Scope } from '@/types';

// Mock modules that useSearch.ts imports but the pure functions don't need
vi.mock('react', () => ({
  useState: vi.fn(),
  useMemo: vi.fn(),
  useDeferredValue: vi.fn(),
}));

vi.mock('@/lib/scope-key', () => ({
  scopeKey: vi.fn(),
}));

import { scopeName, matchesSearch } from './useSearch';

// ─── Test Data ────────────────────────────────────────────────

function makeScope(overrides: Partial<Scope> = {}): Scope {
  return {
    id: 1,
    title: 'Hook & Event Foundation',
    status: 'implementing',
    priority: 'high',
    effort_estimate: '2-4 hours',
    category: 'feature',
    tags: ['backend', 'events'],
    blocked_by: [],
    blocks: [],
    file_path: 'scopes/active/079-hook-event-foundation.md',
    created_at: '2026-01-01',
    updated_at: '2026-01-02',
    raw_content: null,
    sessions: {},
    ...overrides,
  };
}

// ─── scopeName() ──────────────────────────────────────────────

describe('scopeName', () => {
  it('extracts basename and removes .md extension', () => {
    expect(scopeName('scopes/active/079-hook-event-foundation.md')).toBe('079-hook-event-foundation');
  });

  it('lowercases the result', () => {
    expect(scopeName('scopes/active/MyScope.md')).toBe('myscope');
  });

  it('handles paths without .md extension', () => {
    expect(scopeName('scopes/active/readme.txt')).toBe('readme.txt');
  });

  it('handles empty path', () => {
    expect(scopeName('')).toBe('');
  });
});

// ─── matchesSearch() ──────────────────────────────────────────

describe('matchesSearch', () => {
  const scope = makeScope();

  it('returns true for empty query', () => {
    expect(matchesSearch(scope, '')).toBe(true);
    expect(matchesSearch(scope, '   ')).toBe(true);
  });

  it('matches by title (case-insensitive)', () => {
    expect(matchesSearch(scope, 'hook')).toBe(true);
    expect(matchesSearch(scope, 'HOOK')).toBe(true);
    expect(matchesSearch(scope, 'foundation')).toBe(true);
  });

  it('matches by numeric ID prefix', () => {
    expect(matchesSearch(scope, '1')).toBe(true);
    expect(matchesSearch(makeScope({ id: 42 }), '42')).toBe(true);
    expect(matchesSearch(makeScope({ id: 42 }), '4')).toBe(true);
    // ID 999 does not start with '5' and no other field matches '5'
    const isolated = makeScope({ id: 999, title: 'Isolated', status: 'backlog', priority: null, effort_estimate: null, category: null, tags: [], file_path: 'scopes/active/isolated.md' });
    expect(matchesSearch(isolated, '99')).toBe(true);
    expect(matchesSearch(isolated, '5')).toBe(false);
  });

  it('matches by file_path scope name', () => {
    expect(matchesSearch(scope, '079')).toBe(true);
    expect(matchesSearch(scope, 'hook-event')).toBe(true);
  });

  it('matches by category', () => {
    expect(matchesSearch(scope, 'feature')).toBe(true);
    expect(matchesSearch(scope, 'FEATURE')).toBe(true);
  });

  it('matches by priority', () => {
    expect(matchesSearch(scope, 'high')).toBe(true);
  });

  it('matches by effort_estimate', () => {
    expect(matchesSearch(scope, '2-4 hours')).toBe(true);
    expect(matchesSearch(scope, 'hours')).toBe(true);
  });

  it('matches by status', () => {
    expect(matchesSearch(scope, 'implementing')).toBe(true);
    expect(matchesSearch(scope, 'IMPL')).toBe(true);
  });

  it('matches by tags', () => {
    expect(matchesSearch(scope, 'backend')).toBe(true);
    expect(matchesSearch(scope, 'events')).toBe(true);
    expect(matchesSearch(scope, 'EVENTS')).toBe(true);
  });

  it('returns false for non-matching query', () => {
    expect(matchesSearch(scope, 'zzzznotfound')).toBe(false);
  });

  it('handles null optional fields gracefully', () => {
    const sparse = makeScope({
      priority: null,
      effort_estimate: null,
      category: null,
      tags: [],
    });
    expect(matchesSearch(sparse, 'high')).toBe(false);
    expect(matchesSearch(sparse, 'hours')).toBe(false);
    expect(matchesSearch(sparse, '')).toBe(true);
  });
});
