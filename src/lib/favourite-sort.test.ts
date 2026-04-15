import { describe, it, expect } from 'vitest';
import { partitionByFavourites } from './favourite-sort';
import type { Scope } from '@/types';

function makeScope(id: number, favourite: boolean): Scope {
  return {
    id,
    title: `Scope ${id}`,
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
    favourite,
  };
}

describe('partitionByFavourites', () => {
  it('returns empty array for empty input', () => {
    expect(partitionByFavourites([])).toEqual([]);
  });

  it('returns same array when no favourites', () => {
    const scopes = [makeScope(1, false), makeScope(2, false), makeScope(3, false)];
    const result = partitionByFavourites(scopes);
    expect(result.map(s => s.id)).toEqual([1, 2, 3]);
  });

  it('returns same array when all are favourites', () => {
    const scopes = [makeScope(1, true), makeScope(2, true)];
    const result = partitionByFavourites(scopes);
    expect(result.map(s => s.id)).toEqual([1, 2]);
  });

  it('moves favourites first while preserving order within groups', () => {
    const scopes = [
      makeScope(1, false),
      makeScope(2, true),
      makeScope(3, false),
      makeScope(4, true),
    ];
    const result = partitionByFavourites(scopes);
    expect(result.map(s => s.id)).toEqual([2, 4, 1, 3]);
  });
});
