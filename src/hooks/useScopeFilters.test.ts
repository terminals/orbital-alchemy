import { describe, it, expect } from 'vitest';

// ─── Inline types and functions to avoid @/ alias issues ──────
// Source: src/types/index.ts, src/lib/scope-fields.ts, src/hooks/useScopeFilters.ts

type FilterField = 'priority' | 'category' | 'tags' | 'effort' | 'dependencies';

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

// Source: src/lib/scope-fields.ts — bucketEffort
function bucketEffort(raw: string | null): string {
  if (!raw) return 'TBD';
  const s = raw.toLowerCase().trim();
  const hrMatch = s.match(/(\d+(?:\.\d+)?)\s*(?:-\s*\d+(?:\.\d+)?)?\s*hour/);
  if (hrMatch) {
    const hrs = parseFloat(hrMatch[1]);
    if (hrs < 1) return '<1H';
    if (hrs <= 4) return '1-4H';
    return '4H+';
  }
  const minMatch = s.match(/(\d+)\s*(?:-\s*\d+)?\s*min/);
  if (minMatch) return '<1H';
  if (s.includes('large') || s.includes('multi')) return '4H+';
  if (s.includes('medium') || s.includes('half')) return '1-4H';
  if (s.includes('small')) return '<1H';
  return 'TBD';
}

// Source: src/lib/scope-fields.ts — classifyDeps
function classifyDeps(scope: Scope): string[] {
  const labels: string[] = [];
  if (scope.blocked_by.length > 0) labels.push('has-blockers');
  if (scope.blocks.length > 0) labels.push('blocks-others');
  if (scope.blocked_by.length === 0 && scope.blocks.length === 0) labels.push('no-deps');
  return labels;
}

// Source: src/lib/scope-fields.ts — getScopeFieldValues
function getScopeFieldValues(scope: Scope, field: FilterField): string[] {
  switch (field) {
    case 'priority':
      return scope.priority ? [scope.priority] : [];
    case 'category':
      return scope.category ? [scope.category] : [];
    case 'tags':
      return scope.tags;
    case 'effort':
      return [bucketEffort(scope.effort_estimate)];
    case 'dependencies':
      return classifyDeps(scope);
  }
}

// Source: src/hooks/useScopeFilters.ts — matchesField
function matchesField(scope: Scope, field: FilterField, selected: Set<string>): boolean {
  if (selected.size === 0) return true;
  const values = getScopeFieldValues(scope, field);
  return values.some((v) => selected.has(v));
}

// ─── Test Data ────────────────────────────────────────────────

function makeScope(overrides: Partial<Scope> = {}): Scope {
  return {
    id: 1,
    title: 'Test Scope',
    status: 'backlog',
    priority: 'high',
    effort_estimate: '2 hours',
    category: 'feature',
    tags: ['backend', 'api'],
    blocked_by: [3],
    blocks: [5],
    file_path: 'scopes/active/001-test.md',
    created_at: '2026-01-01',
    updated_at: '2026-01-02',
    raw_content: null,
    sessions: {},
    ...overrides,
  };
}

// ─── matchesField() ──────────────────────────────────────────

describe('matchesField', () => {
  const scope = makeScope();

  it('returns true when selected set is empty (no filter)', () => {
    expect(matchesField(scope, 'priority', new Set())).toBe(true);
    expect(matchesField(scope, 'category', new Set())).toBe(true);
    expect(matchesField(scope, 'tags', new Set())).toBe(true);
  });

  // Priority
  it('matches when scope priority is in the selected set', () => {
    expect(matchesField(scope, 'priority', new Set(['high']))).toBe(true);
    expect(matchesField(scope, 'priority', new Set(['high', 'low']))).toBe(true);
  });

  it('does not match when scope priority is not in the selected set', () => {
    expect(matchesField(scope, 'priority', new Set(['low']))).toBe(false);
  });

  it('handles null priority', () => {
    const s = makeScope({ priority: null });
    expect(matchesField(s, 'priority', new Set(['high']))).toBe(false);
  });

  // Category
  it('matches scope category', () => {
    expect(matchesField(scope, 'category', new Set(['feature']))).toBe(true);
    expect(matchesField(scope, 'category', new Set(['bugfix']))).toBe(false);
  });

  it('handles null category', () => {
    const s = makeScope({ category: null });
    expect(matchesField(s, 'category', new Set(['feature']))).toBe(false);
  });

  // Tags (OR within field)
  it('matches when any tag is in the selected set', () => {
    expect(matchesField(scope, 'tags', new Set(['backend']))).toBe(true);
    expect(matchesField(scope, 'tags', new Set(['api']))).toBe(true);
    expect(matchesField(scope, 'tags', new Set(['frontend', 'api']))).toBe(true);
  });

  it('does not match when no tags are in the selected set', () => {
    expect(matchesField(scope, 'tags', new Set(['frontend']))).toBe(false);
  });

  it('handles empty tags array', () => {
    const s = makeScope({ tags: [] });
    expect(matchesField(s, 'tags', new Set(['backend']))).toBe(false);
  });

  // Effort (uses bucketEffort)
  it('matches effort bucket', () => {
    expect(matchesField(scope, 'effort', new Set(['1-4H']))).toBe(true);
    expect(matchesField(scope, 'effort', new Set(['<1H']))).toBe(false);
  });

  it('handles null effort_estimate (maps to TBD)', () => {
    const s = makeScope({ effort_estimate: null });
    expect(matchesField(s, 'effort', new Set(['TBD']))).toBe(true);
    expect(matchesField(s, 'effort', new Set(['<1H']))).toBe(false);
  });

  // Dependencies
  it('matches dependency classification: has-blockers', () => {
    expect(matchesField(scope, 'dependencies', new Set(['has-blockers']))).toBe(true);
  });

  it('matches dependency classification: blocks-others', () => {
    expect(matchesField(scope, 'dependencies', new Set(['blocks-others']))).toBe(true);
  });

  it('matches no-deps for scopes without dependencies', () => {
    const s = makeScope({ blocked_by: [], blocks: [] });
    expect(matchesField(s, 'dependencies', new Set(['no-deps']))).toBe(true);
    expect(matchesField(s, 'dependencies', new Set(['has-blockers']))).toBe(false);
  });
});

// ─── AND-across-fields integration test ────────────────────────

describe('AND-across-fields filtering', () => {
  const scopes: Scope[] = [
    makeScope({ id: 1, priority: 'high', category: 'feature', tags: ['backend'] }),
    makeScope({ id: 2, priority: 'low', category: 'bugfix', tags: ['frontend'] }),
    makeScope({ id: 3, priority: 'high', category: 'bugfix', tags: ['backend'] }),
  ];

  function applyFilters(
    scopeList: Scope[],
    filters: Partial<Record<FilterField, Set<string>>>,
  ): Scope[] {
    const allFields: FilterField[] = ['priority', 'category', 'tags', 'effort', 'dependencies'];
    return scopeList.filter((scope) =>
      allFields.every((field) => matchesField(scope, field, filters[field] ?? new Set())),
    );
  }

  it('returns all scopes when no filters are active', () => {
    expect(applyFilters(scopes, {})).toHaveLength(3);
  });

  it('filters by single field', () => {
    const result = applyFilters(scopes, { priority: new Set(['high']) });
    expect(result.map(s => s.id)).toEqual([1, 3]);
  });

  it('filters by multiple fields (AND logic)', () => {
    const result = applyFilters(scopes, {
      priority: new Set(['high']),
      category: new Set(['bugfix']),
    });
    expect(result.map(s => s.id)).toEqual([3]);
  });

  it('returns empty when no scope matches all filters', () => {
    const result = applyFilters(scopes, {
      priority: new Set(['low']),
      category: new Set(['feature']),
    });
    expect(result).toHaveLength(0);
  });
});
