import { describe, it, expect } from 'vitest';
import type { OrbitalEvent, DispatchResolvedPayload } from '../types';
import {
  parseActiveScopeIds,
  parseAbandonedScopes,
  extractDispatchScopeIds,
  extractResolvedScopeIds,
  buildScopeKeys,
  addToActiveSet,
  removeFromActiveSet,
  isNewDispatchEvent,
  extractProjectId,
} from './active-dispatch-utils';

// ─── Test Helpers ───────────────────────────────────────────

function makeEvent(overrides: Partial<OrbitalEvent> = {}): OrbitalEvent {
  return {
    id: 'evt-1',
    type: 'DISPATCH',
    scope_id: null,
    session_id: null,
    agent: null,
    data: {},
    timestamp: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

// ─── parseActiveScopeIds ────────────────────────────────────

describe('parseActiveScopeIds', () => {
  const makeScopeKey = (id: number) => String(id);

  it('handles old format (number[])', () => {
    const result = parseActiveScopeIds([1, 2, 3], makeScopeKey);
    expect(result).toEqual(new Set(['1', '2', '3']));
  });

  it('handles new format ({scope_id, project_id}[])', () => {
    const items = [
      { scope_id: 1, project_id: 'proj-a' },
      { scope_id: 2, project_id: 'proj-b' },
    ];
    const result = parseActiveScopeIds(items, makeScopeKey);
    expect(result.has('proj-a::1')).toBe(true);
    expect(result.has('proj-b::2')).toBe(true);
  });

  it('handles empty array', () => {
    const result = parseActiveScopeIds([], makeScopeKey);
    expect(result.size).toBe(0);
  });

  it('handles mixed format gracefully', () => {
    // In practice only one format is used per response, but the parser should be resilient
    const items: Array<number | { scope_id: number; project_id: string }> = [
      1,
      { scope_id: 2, project_id: 'proj' },
    ];
    const result = parseActiveScopeIds(items as number[], makeScopeKey);
    expect(result.size).toBe(2);
  });
});

// ─── parseAbandonedScopes ───────────────────────────────────

describe('parseAbandonedScopes', () => {
  const makeScopeKey = (id: number) => String(id);

  it('parses abandoned scopes with project_id', () => {
    const items = [{ scope_id: 5, project_id: 'proj-a', from_status: 'implementing', abandoned_at: '2026-01-01' }];
    const result = parseAbandonedScopes(items, makeScopeKey);
    expect(result.get('proj-a::5')).toEqual({
      from_status: 'implementing',
      abandoned_at: '2026-01-01',
      project_id: 'proj-a',
    });
  });

  it('parses abandoned scopes without project_id using makeScopeKey', () => {
    const items = [{ scope_id: 3, from_status: null, abandoned_at: '2026-01-01' }];
    const result = parseAbandonedScopes(items, makeScopeKey);
    expect(result.get('3')).toEqual({
      from_status: null,
      abandoned_at: '2026-01-01',
      project_id: undefined,
    });
  });

  it('returns empty map for empty input', () => {
    expect(parseAbandonedScopes([], makeScopeKey).size).toBe(0);
  });
});

// ─── extractDispatchScopeIds ────────────────────────────────

describe('extractDispatchScopeIds', () => {
  it('extracts scope_id from single dispatch', () => {
    const event = makeEvent({ scope_id: 42 });
    expect(extractDispatchScopeIds(event)).toEqual([42]);
  });

  it('extracts scope_ids from batch dispatch', () => {
    const event = makeEvent({ data: { scope_ids: [1, 2, 3] } });
    expect(extractDispatchScopeIds(event)).toEqual([1, 2, 3]);
  });

  it('combines single and batch without duplicates', () => {
    const event = makeEvent({ scope_id: 1, data: { scope_ids: [1, 2, 3] } });
    expect(extractDispatchScopeIds(event)).toEqual([1, 2, 3]);
  });

  it('returns empty array when no scope IDs present', () => {
    const event = makeEvent();
    expect(extractDispatchScopeIds(event)).toEqual([]);
  });

  it('handles scope_ids that is not an array', () => {
    const event = makeEvent({ data: { scope_ids: 'invalid' } });
    expect(extractDispatchScopeIds(event)).toEqual([]);
  });
});

// ─── extractResolvedScopeIds ────────────────────────────────

describe('extractResolvedScopeIds', () => {
  it('extracts scope_id from single resolution', () => {
    const payload: DispatchResolvedPayload = { event_id: 'e1', scope_id: 5, outcome: 'completed' };
    expect(extractResolvedScopeIds(payload)).toEqual([5]);
  });

  it('extracts scope_ids from batch resolution', () => {
    const payload: DispatchResolvedPayload = { event_id: 'e1', scope_id: null, scope_ids: [1, 2], outcome: 'completed' };
    expect(extractResolvedScopeIds(payload)).toEqual([1, 2]);
  });

  it('combines both', () => {
    const payload: DispatchResolvedPayload = { event_id: 'e1', scope_id: 1, scope_ids: [2, 3], outcome: 'failed' };
    expect(extractResolvedScopeIds(payload)).toEqual([1, 2, 3]);
  });

  it('returns empty when both null', () => {
    const payload: DispatchResolvedPayload = { event_id: 'e1', scope_id: null, outcome: 'abandoned' };
    expect(extractResolvedScopeIds(payload)).toEqual([]);
  });
});

// ─── buildScopeKeys ─────────────────────────────────────────

describe('buildScopeKeys', () => {
  it('builds keys with project ID', () => {
    const keys = buildScopeKeys([1, 2], 'proj-a', undefined);
    expect(keys).toEqual(['proj-a::1', 'proj-a::2']);
  });

  it('uses fallback project ID when event project ID is undefined', () => {
    const keys = buildScopeKeys([1], undefined, 'fallback');
    expect(keys).toEqual(['fallback::1']);
  });

  it('builds plain keys when no project ID available', () => {
    const keys = buildScopeKeys([5], undefined, undefined);
    expect(keys).toEqual(['5']);
  });

  it('prefers event project ID over fallback', () => {
    const keys = buildScopeKeys([1], 'event-proj', 'fallback-proj');
    expect(keys).toEqual(['event-proj::1']);
  });
});

// ─── addToActiveSet ─────────────────────────────────────────

describe('addToActiveSet', () => {
  it('adds new keys to the set', () => {
    const prev = new Set(['1']);
    const result = addToActiveSet(prev, ['2', '3']);
    expect(result).toEqual(new Set(['1', '2', '3']));
  });

  it('returns same reference when all keys already present', () => {
    const prev = new Set(['1', '2']);
    const result = addToActiveSet(prev, ['1', '2']);
    expect(result).toBe(prev);
  });

  it('handles empty keys array', () => {
    const prev = new Set(['1']);
    const result = addToActiveSet(prev, []);
    expect(result).toBe(prev);
  });

  it('does not mutate the original set', () => {
    const prev = new Set(['1']);
    addToActiveSet(prev, ['2']);
    expect(prev.has('2')).toBe(false);
  });
});

// ─── removeFromActiveSet ────────────────────────────────────

describe('removeFromActiveSet', () => {
  it('removes keys from the set', () => {
    const prev = new Set(['1', '2', '3']);
    const result = removeFromActiveSet(prev, ['2']);
    expect(result).toEqual(new Set(['1', '3']));
  });

  it('returns same reference when no keys found', () => {
    const prev = new Set(['1']);
    const result = removeFromActiveSet(prev, ['99']);
    expect(result).toBe(prev);
  });

  it('handles empty keys array', () => {
    const prev = new Set(['1']);
    const result = removeFromActiveSet(prev, []);
    expect(result).toBe(prev);
  });

  it('does not mutate the original set', () => {
    const prev = new Set(['1', '2']);
    removeFromActiveSet(prev, ['1']);
    expect(prev.has('1')).toBe(true);
  });
});

// ─── isNewDispatchEvent ─────────────────────────────────────

describe('isNewDispatchEvent', () => {
  it('returns true for DISPATCH event without resolved field', () => {
    const event = makeEvent({ type: 'DISPATCH', data: {} });
    expect(isNewDispatchEvent(event)).toBe(true);
  });

  it('returns false for DISPATCH event with resolved field', () => {
    const event = makeEvent({ type: 'DISPATCH', data: { resolved: true } });
    expect(isNewDispatchEvent(event)).toBe(false);
  });

  it('returns false for non-DISPATCH events', () => {
    const event = makeEvent({ type: 'SESSION_START' });
    expect(isNewDispatchEvent(event)).toBe(false);
  });
});

// ─── extractProjectId ───────────────────────────────────────

describe('extractProjectId', () => {
  it('extracts project_id from object', () => {
    expect(extractProjectId({ project_id: 'proj-a' })).toBe('proj-a');
  });

  it('returns undefined when project_id absent', () => {
    expect(extractProjectId({})).toBeUndefined();
  });

  it('returns undefined for non-string project_id', () => {
    // The function casts as string, so undefined for missing
    expect(extractProjectId({ project_id: undefined })).toBeUndefined();
  });
});
