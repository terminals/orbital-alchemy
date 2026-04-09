import { useCallback } from 'react';
import type { Scope } from '@/types';
import { EFFORT_BUCKETS } from '@/types';
import { useLocalStorage, setStorage } from './useLocalStorage';

// ─── Types ─────────────────────────────────────────────────
export type SortField = 'id' | 'priority' | 'effort' | 'updated_at' | 'created_at' | 'title';
export type SortDirection = 'asc' | 'desc';

export interface BoardSettings {
  sortField: SortField;
  sortDirection: SortDirection;
  collapsed: Set<string>;
}

// ─── Constants ─────────────────────────────────────────────
const SORT_KEY = 'cc-board-sort';
const COLLAPSE_KEY = 'cc-board-collapsed';

const DEFAULT_SORT_DIRECTIONS: Record<SortField, SortDirection> = {
  id: 'asc',
  priority: 'asc',
  effort: 'asc',
  updated_at: 'desc',
  created_at: 'desc',
  title: 'asc',
};

const PRIORITY_ORDER: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

function effortRank(raw: string | null): number {
  if (!raw) return Infinity;
  const idx = EFFORT_BUCKETS.indexOf(raw as typeof EFFORT_BUCKETS[number]);
  return idx >= 0 ? idx : Infinity;
}

const DEFAULT_SORT = { field: 'id' as SortField, direction: 'asc' as SortDirection };

const sortStorage = {
  deserialize: (raw: string): { field: SortField; direction: SortDirection } | undefined => {
    const parsed = JSON.parse(raw) as { field: string; direction: string };
    if (parsed.field in DEFAULT_SORT_DIRECTIONS) {
      return {
        field: parsed.field as SortField,
        direction: parsed.direction === 'desc' ? 'desc' : 'asc',
      };
    }
    return undefined;
  },
};

// ─── Sort comparator ───────────────────────────────────────
export function sortScopes(scopes: Scope[], field: SortField, direction: SortDirection): Scope[] {
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

// ─── Hook ──────────────────────────────────────────────────
export function useBoardSettings() {
  const [sort, setSort] = useLocalStorage(SORT_KEY, DEFAULT_SORT, sortStorage);
  const [collapsed, setCollapsed] = useLocalStorage<Set<string>>(COLLAPSE_KEY, new Set(), setStorage);

  const handleSetSort = useCallback((field: SortField) => {
    setSort((prev) => {
      const nextDir = prev.field === field
        ? (prev.direction === 'asc' ? 'desc' : 'asc')
        : DEFAULT_SORT_DIRECTIONS[field];
      return { field, direction: nextDir };
    });
  }, [setSort]);

  const toggleCollapse = useCallback((columnId: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(columnId)) {
        next.delete(columnId);
      } else {
        next.add(columnId);
      }
      return next;
    });
  }, [setCollapsed]);

  return { sortField: sort.field, sortDirection: sort.direction, setSort: handleSetSort, collapsed, toggleCollapse } as const;
}
