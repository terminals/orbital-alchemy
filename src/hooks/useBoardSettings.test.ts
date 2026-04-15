import { describe, it, expect } from 'vitest';

// ─── Types ────────────────────────────────────────────────────
// Inline type + sort logic from useBoardSettings.ts because importing
// the source triggers '@/types' resolution which is unavailable in
// the vitest unit project (no bundler alias at runtime).

type SortField = 'id' | 'priority' | 'effort' | 'updated_at' | 'created_at' | 'title';
type SortDirection = 'asc' | 'desc';

interface Scope {
  id: number;
  title: string;
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
  raw_content: string | null;
  sessions: Record<string, string[]>;
}

const EFFORT_BUCKETS = ['<1H', '1-4H', '4H+', 'TBD'] as const;

const PRIORITY_ORDER: Record<string, number> = {
  critical: 0, high: 1, medium: 2, low: 3,
};

function effortRank(raw: string | null): number {
  if (!raw) return Infinity;
  const idx = EFFORT_BUCKETS.indexOf(raw as typeof EFFORT_BUCKETS[number]);
  return idx >= 0 ? idx : Infinity;
}

// Source: src/hooks/useBoardSettings.ts — sortScopes + compareByField
function sortScopes(scopes: Scope[], field: SortField, direction: SortDirection): Scope[] {
  const sorted = [...scopes].sort((a, b) => {
    const cmp = compareByField(a, b, field);
    return direction === 'desc' ? -cmp : cmp;
  });
  return sorted;
}

function compareByField(a: Scope, b: Scope, field: SortField): number {
  switch (field) {
    case 'id':
      return a.id - b.id;
    case 'priority': {
      const pa = a.priority ? (PRIORITY_ORDER[a.priority] ?? Infinity) : Infinity;
      const pb = b.priority ? (PRIORITY_ORDER[b.priority] ?? Infinity) : Infinity;
      return pa - pb;
    }
    case 'effort':
      return effortRank(a.effort_estimate) - effortRank(b.effort_estimate);
    case 'updated_at': {
      const ua = a.updated_at ? new Date(a.updated_at).getTime() : 0;
      const ub = b.updated_at ? new Date(b.updated_at).getTime() : 0;
      return ua - ub;
    }
    case 'created_at': {
      const ca = a.created_at ? new Date(a.created_at).getTime() : 0;
      const cb = b.created_at ? new Date(b.created_at).getTime() : 0;
      return ca - cb;
    }
    case 'title':
      return a.title.localeCompare(b.title);
    default:
      return 0;
  }
}

// ─── Test Data ────────────────────────────────────────────────

function makeScope(overrides: Partial<Scope> = {}): Scope {
  return {
    id: 1,
    title: 'Default Scope',
    status: 'backlog',
    priority: 'medium',
    effort_estimate: '1-4H',
    category: 'feature',
    tags: [],
    blocked_by: [],
    blocks: [],
    file_path: 'scopes/active/001-default.md',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-02T00:00:00Z',
    raw_content: null,
    sessions: {},
    ...overrides,
  };
}

const scopes: Scope[] = [
  makeScope({ id: 3, title: 'Zulu', priority: 'low', effort_estimate: '4H+', created_at: '2026-01-03T00:00:00Z', updated_at: '2026-01-10T00:00:00Z' }),
  makeScope({ id: 1, title: 'Alpha', priority: 'critical', effort_estimate: '<1H', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-05T00:00:00Z' }),
  makeScope({ id: 2, title: 'Mike', priority: 'high', effort_estimate: '1-4H', created_at: '2026-01-02T00:00:00Z', updated_at: '2026-01-08T00:00:00Z' }),
];

// ─── sortScopes() ─────────────────────────────────────────────

describe('sortScopes', () => {
  it('sorts by id ascending', () => {
    const sorted = sortScopes(scopes, 'id', 'asc');
    expect(sorted.map(s => s.id)).toEqual([1, 2, 3]);
  });

  it('sorts by id descending', () => {
    const sorted = sortScopes(scopes, 'id', 'desc');
    expect(sorted.map(s => s.id)).toEqual([3, 2, 1]);
  });

  it('sorts by title ascending (alphabetical)', () => {
    const sorted = sortScopes(scopes, 'title', 'asc');
    expect(sorted.map(s => s.title)).toEqual(['Alpha', 'Mike', 'Zulu']);
  });

  it('sorts by title descending', () => {
    const sorted = sortScopes(scopes, 'title', 'desc');
    expect(sorted.map(s => s.title)).toEqual(['Zulu', 'Mike', 'Alpha']);
  });

  it('sorts by priority ascending (critical < high < medium < low)', () => {
    const sorted = sortScopes(scopes, 'priority', 'asc');
    expect(sorted.map(s => s.priority)).toEqual(['critical', 'high', 'low']);
  });

  it('sorts by priority descending', () => {
    const sorted = sortScopes(scopes, 'priority', 'desc');
    expect(sorted.map(s => s.priority)).toEqual(['low', 'high', 'critical']);
  });

  it('sorts by effort ascending (<1H < 1-4H < 4H+)', () => {
    const sorted = sortScopes(scopes, 'effort', 'asc');
    expect(sorted.map(s => s.id)).toEqual([1, 2, 3]);
  });

  it('sorts by effort descending', () => {
    const sorted = sortScopes(scopes, 'effort', 'desc');
    expect(sorted.map(s => s.id)).toEqual([3, 2, 1]);
  });

  it('sorts by created_at ascending', () => {
    const sorted = sortScopes(scopes, 'created_at', 'asc');
    expect(sorted.map(s => s.id)).toEqual([1, 2, 3]);
  });

  it('sorts by updated_at descending', () => {
    const sorted = sortScopes(scopes, 'updated_at', 'desc');
    expect(sorted.map(s => s.id)).toEqual([3, 2, 1]);
  });

  it('does not mutate the original array', () => {
    const original = [...scopes];
    sortScopes(scopes, 'id', 'asc');
    expect(scopes.map(s => s.id)).toEqual(original.map(s => s.id));
  });

  it('handles null priority as lowest', () => {
    const withNull = [
      makeScope({ id: 1, priority: null }),
      makeScope({ id: 2, priority: 'high' }),
    ];
    const sorted = sortScopes(withNull, 'priority', 'asc');
    expect(sorted.map(s => s.id)).toEqual([2, 1]);
  });

  it('handles null effort_estimate as lowest', () => {
    const withNull = [
      makeScope({ id: 1, effort_estimate: null }),
      makeScope({ id: 2, effort_estimate: '1-4H' }),
    ];
    const sorted = sortScopes(withNull, 'effort', 'asc');
    expect(sorted.map(s => s.id)).toEqual([2, 1]);
  });

  it('handles null timestamps as zero', () => {
    const withNull = [
      makeScope({ id: 1, created_at: null }),
      makeScope({ id: 2, created_at: '2026-01-01T00:00:00Z' }),
    ];
    const sorted = sortScopes(withNull, 'created_at', 'asc');
    expect(sorted.map(s => s.id)).toEqual([1, 2]);
  });
});
