import { describe, it, expect } from 'vitest';
import { bucketEffort, classifyDeps, getScopeFieldValues } from './scope-fields';
import type { Scope } from '@/types';

function makeScope(overrides: Partial<Scope> = {}): Scope {
  return {
    id: 1,
    title: 'Test',
    status: 'backlog',
    priority: null,
    effort_estimate: null,
    category: null,
    tags: [],
    blocked_by: [],
    blocks: [],
    file_path: '/test',
    created_at: null,
    updated_at: null,
    raw_content: null,
    sessions: {},
    ...overrides,
  };
}

describe('bucketEffort', () => {
  // ─── Null/empty ───────────────────────────────────────────

  it('returns TBD for null', () => {
    expect(bucketEffort(null)).toBe('TBD');
  });

  it('returns TBD for empty string', () => {
    expect(bucketEffort('')).toBe('TBD');
  });

  // ─── Hour formats ─────────────────────────────────────────

  it('buckets "2h" as 1-4H', () => {
    expect(bucketEffort('2 hours')).toBe('1-4H');
  });

  it('buckets "0.5 hours" as <1H', () => {
    expect(bucketEffort('0.5 hours')).toBe('<1H');
  });

  it('buckets "6 hours" as 4H+', () => {
    expect(bucketEffort('6 hours')).toBe('4H+');
  });

  it('buckets "1 hour" as 1-4H', () => {
    expect(bucketEffort('1 hour')).toBe('1-4H');
  });

  it('buckets "4 hours" as 1-4H', () => {
    expect(bucketEffort('4 hours')).toBe('1-4H');
  });

  // ─── Minute formats ───────────────────────────────────────

  it('buckets "30m" as <1H', () => {
    expect(bucketEffort('30 minutes')).toBe('<1H');
  });

  it('buckets "45 min" as <1H', () => {
    expect(bucketEffort('45 min')).toBe('<1H');
  });

  // ─── T-shirt sizes ───────────────────────────────────────

  it('buckets "small" as <1H', () => {
    expect(bucketEffort('small')).toBe('<1H');
  });

  it('buckets "medium" as 1-4H', () => {
    expect(bucketEffort('medium')).toBe('1-4H');
  });

  it('buckets "large" as 4H+', () => {
    expect(bucketEffort('large')).toBe('4H+');
  });

  // ─── Unrecognized ─────────────────────────────────────────

  it('returns TBD for unrecognized format', () => {
    expect(bucketEffort('XL')).toBe('TBD');
  });

  it('returns TBD for random text', () => {
    expect(bucketEffort('about a day')).toBe('TBD');
  });
});

describe('classifyDeps', () => {
  it('returns has-blockers when blocked_by is non-empty', () => {
    const scope = makeScope({ blocked_by: [2] });
    expect(classifyDeps(scope)).toContain('has-blockers');
  });

  it('returns blocks-others when blocks is non-empty', () => {
    const scope = makeScope({ blocks: [3] });
    expect(classifyDeps(scope)).toContain('blocks-others');
  });

  it('returns no-deps when both are empty', () => {
    const scope = makeScope();
    expect(classifyDeps(scope)).toEqual(['no-deps']);
  });

  it('returns both labels for scope that blocks and is blocked', () => {
    const scope = makeScope({ blocked_by: [1], blocks: [3] });
    expect(classifyDeps(scope)).toContain('has-blockers');
    expect(classifyDeps(scope)).toContain('blocks-others');
  });
});

describe('getScopeFieldValues', () => {
  it('returns priority when set', () => {
    const scope = makeScope({ priority: 'high' });
    expect(getScopeFieldValues(scope, 'priority')).toEqual(['high']);
  });

  it('returns empty array when priority is null', () => {
    const scope = makeScope({ priority: null });
    expect(getScopeFieldValues(scope, 'priority')).toEqual([]);
  });

  it('returns category when set', () => {
    const scope = makeScope({ category: 'feature' });
    expect(getScopeFieldValues(scope, 'category')).toEqual(['feature']);
  });

  it('returns tags array', () => {
    const scope = makeScope({ tags: ['auth', 'api'] });
    expect(getScopeFieldValues(scope, 'tags')).toEqual(['auth', 'api']);
  });

  it('returns bucketed effort', () => {
    const scope = makeScope({ effort_estimate: '2 hours' });
    expect(getScopeFieldValues(scope, 'effort')).toEqual(['1-4H']);
  });

  it('returns dependency classification', () => {
    const scope = makeScope({ blocked_by: [2] });
    expect(getScopeFieldValues(scope, 'dependencies')).toContain('has-blockers');
  });

  it('returns project_id for project field', () => {
    const scope = makeScope({ project_id: 'my-proj' });
    expect(getScopeFieldValues(scope, 'project')).toEqual(['my-proj']);
  });
});
