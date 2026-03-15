import { useState, useCallback, useEffect } from 'react';
import type { Scope } from '@/types';
import { EFFORT_BUCKETS } from '@/types';

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

// ─── localStorage helpers ──────────────────────────────────
function readSort(): { field: SortField; direction: SortDirection } {
  try {
    const raw = localStorage.getItem(SORT_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { field: string; direction: string };
      if (parsed.field in DEFAULT_SORT_DIRECTIONS) {
        return {
          field: parsed.field as SortField,
          direction: parsed.direction === 'desc' ? 'desc' : 'asc',
        };
      }
    }
  } catch { /* use defaults */ }
  return { field: 'id', direction: 'asc' };
}

function readCollapsed(): Set<string> {
  try {
    const raw = localStorage.getItem(COLLAPSE_KEY);
    if (raw) {
      const arr = JSON.parse(raw) as string[];
      if (Array.isArray(arr)) return new Set(arr);
    }
  } catch { /* use defaults */ }
  return new Set();
}

function persistSort(field: SortField, direction: SortDirection) {
  try { localStorage.setItem(SORT_KEY, JSON.stringify({ field, direction })); } catch { /* noop */ }
}

function persistCollapsed(collapsed: Set<string>) {
  try { localStorage.setItem(COLLAPSE_KEY, JSON.stringify([...collapsed])); } catch { /* noop */ }
}

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
  const [sortField, setSortField] = useState<SortField>(() => readSort().field);
  const [sortDirection, setSortDirection] = useState<SortDirection>(() => readSort().direction);
  const [collapsed, setCollapsed] = useState<Set<string>>(readCollapsed);

  // Cross-tab sync
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === SORT_KEY) {
        const s = readSort();
        setSortField(s.field);
        setSortDirection(s.direction);
      }
      if (e.key === COLLAPSE_KEY) {
        setCollapsed(readCollapsed());
      }
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const setSort = useCallback((field: SortField) => {
    setSortField((prevField) => {
      setSortDirection((prevDir) => {
        // Same field → toggle direction; different field → default direction
        const nextDir = prevField === field
          ? (prevDir === 'asc' ? 'desc' : 'asc')
          : DEFAULT_SORT_DIRECTIONS[field];
        persistSort(field, nextDir);
        return nextDir;
      });
      return field;
    });
  }, []);

  const toggleCollapse = useCallback((columnId: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(columnId)) {
        next.delete(columnId);
      } else {
        next.add(columnId);
      }
      persistCollapsed(next);
      return next;
    });
  }, []);

  return { sortField, sortDirection, setSort, collapsed, toggleCollapse } as const;
}
