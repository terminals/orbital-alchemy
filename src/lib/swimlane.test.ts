import { describe, it, expect, vi } from 'vitest';

// Mock all @/ path imports used by swimlane.ts to avoid path alias
// resolution issues in the unit vitest project (Node environment).
vi.mock('@/types', () => ({
  PRIORITY_OPTIONS: ['critical', 'high', 'medium', 'low'],
  CATEGORY_OPTIONS: ['feature', 'bugfix', 'refactor', 'infrastructure', 'docs'],
  EFFORT_BUCKETS: ['<1H', '1-4H', '4H+', 'TBD'],
  DEPENDENCY_OPTIONS: ['has-blockers', 'blocks-others', 'no-deps'],
}));

vi.mock('@/lib/scope-fields', async () => {
  // Import the real implementation via relative path
  const actual = await vi.importActual<typeof import('./scope-fields')>('./scope-fields');
  return actual;
});

vi.mock('@/hooks/useBoardSettings', () => ({
  sortScopes: <T>(scopes: T[]) => scopes,
}));

vi.mock('@/lib/favourite-sort', async () => {
  const actual = await vi.importActual<typeof import('./favourite-sort')>('./favourite-sort');
  return actual;
});

// Safe to import after mocks
import { computeSwimLanes } from './swimlane';

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
  project_id?: string;
  favourite?: boolean;
}

function makeScope(overrides: Partial<Scope> & { id: number }): Scope {
  return {
    title: `Scope ${overrides.id}`,
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

describe('computeSwimLanes', () => {
  it('returns empty array for empty scopes', () => {
    const lanes = computeSwimLanes([], 'priority', 'id', 'asc');
    expect(lanes).toEqual([]);
  });

  // ─── Group by priority ────────────────────────────────────

  it('groups scopes by priority', () => {
    const scopes = [
      makeScope({ id: 1, priority: 'high' }),
      makeScope({ id: 2, priority: 'low' }),
      makeScope({ id: 3, priority: 'high' }),
    ] as any[];
    const lanes = computeSwimLanes(scopes, 'priority', 'id', 'asc');

    const highLane = lanes.find(l => l.value === 'high');
    expect(highLane).toBeDefined();
    expect(highLane!.count).toBe(2);

    const lowLane = lanes.find(l => l.value === 'low');
    expect(lowLane).toBeDefined();
    expect(lowLane!.count).toBe(1);
  });

  it('puts scopes without priority in Unset lane', () => {
    const scopes = [makeScope({ id: 1, priority: null })] as any[];
    const lanes = computeSwimLanes(scopes, 'priority', 'id', 'asc');

    const unset = lanes.find(l => l.value === 'Unset');
    expect(unset).toBeDefined();
    expect(unset!.count).toBe(1);
  });

  it('orders priority lanes in known order: critical, high, medium, low', () => {
    const scopes = [
      makeScope({ id: 1, priority: 'low' }),
      makeScope({ id: 2, priority: 'critical' }),
      makeScope({ id: 3, priority: 'high' }),
      makeScope({ id: 4, priority: 'medium' }),
    ] as any[];
    const lanes = computeSwimLanes(scopes, 'priority', 'id', 'asc');
    const values = lanes.map(l => l.value);
    expect(values).toEqual(['critical', 'high', 'medium', 'low']);
  });

  // ─── Group by category ────────────────────────────────────

  it('groups scopes by category', () => {
    const scopes = [
      makeScope({ id: 1, category: 'feature' }),
      makeScope({ id: 2, category: 'bugfix' }),
      makeScope({ id: 3, category: 'feature' }),
    ] as any[];
    const lanes = computeSwimLanes(scopes, 'category', 'id', 'asc');
    expect(lanes.find(l => l.value === 'feature')!.count).toBe(2);
    expect(lanes.find(l => l.value === 'bugfix')!.count).toBe(1);
  });

  // ─── Group by tags ────────────────────────────────────────

  it('groups scopes by tags (scope can appear in multiple lanes)', () => {
    const scopes = [
      makeScope({ id: 1, tags: ['auth', 'api'] }),
      makeScope({ id: 2, tags: ['api'] }),
    ] as any[];
    const lanes = computeSwimLanes(scopes, 'tags', 'id', 'asc');

    const authLane = lanes.find(l => l.value === 'auth');
    expect(authLane).toBeDefined();
    expect(authLane!.count).toBe(1);

    const apiLane = lanes.find(l => l.value === 'api');
    expect(apiLane).toBeDefined();
    expect(apiLane!.count).toBe(2);
  });

  // ─── Group by effort ──────────────────────────────────────

  it('groups scopes by bucketed effort', () => {
    const scopes = [
      makeScope({ id: 1, effort_estimate: '2 hours' }),
      makeScope({ id: 2, effort_estimate: '30 minutes' }),
      makeScope({ id: 3, effort_estimate: null }),
    ] as any[];
    const lanes = computeSwimLanes(scopes, 'effort', 'id', 'asc');

    expect(lanes.find(l => l.value === '1-4H')).toBeDefined();
    expect(lanes.find(l => l.value === '<1H')).toBeDefined();
    expect(lanes.find(l => l.value === 'TBD')).toBeDefined();
  });

  // ─── Color mapping ────────────────────────────────────────

  it('assigns correct color for priority lanes', () => {
    const scopes = [makeScope({ id: 1, priority: 'critical' })] as any[];
    const lanes = computeSwimLanes(scopes, 'priority', 'id', 'asc');
    expect(lanes[0].color).toBe('bg-ask-red');
  });

  it('assigns Unset color for Unset lane', () => {
    const scopes = [makeScope({ id: 1, priority: null })] as any[];
    const lanes = computeSwimLanes(scopes, 'priority', 'id', 'asc');
    const unset = lanes.find(l => l.value === 'Unset');
    expect(unset!.color).toBe('bg-muted-foreground/20');
  });

  // ─── Label generation ─────────────────────────────────────

  it('generates readable labels for dependency lanes', () => {
    const scopes = [
      makeScope({ id: 1, blocked_by: [2] }),
      makeScope({ id: 2 }),
    ] as any[];
    const lanes = computeSwimLanes(scopes, 'dependencies', 'id', 'asc');
    const hasBlockers = lanes.find(l => l.value === 'has-blockers');
    expect(hasBlockers!.label).toBe('Has blockers');
  });
});
