import { useState, useMemo, useCallback } from 'react';
import type { Scope, FilterField, ScopeFilterState } from '@/types';
import {
  PRIORITY_OPTIONS,
  CATEGORY_OPTIONS,
  EFFORT_BUCKETS,
  DEPENDENCY_OPTIONS,
} from '@/types';
import { getScopeFieldValues } from '@/lib/scope-fields';

// ─── Filter match (OR within field) ────────────────────────

function matchesField(scope: Scope, field: FilterField, selected: Set<string>): boolean {
  if (selected.size === 0) return true; // no filter = pass
  const values = getScopeFieldValues(scope, field);
  return values.some((v) => selected.has(v));
}

// ─── Empty state factory ───────────────────────────────────

function emptyFilters(): ScopeFilterState {
  return {
    priority: new Set(),
    category: new Set(),
    tags: new Set(),
    effort: new Set(),
    dependencies: new Set(),
  };
}

// ─── Option with count ─────────────────────────────────────

export interface FilterOption {
  value: string;
  label: string;
  count: number;
}

// ─── The Hook ──────────────────────────────────────────────

export function useScopeFilters(scopes: Scope[]) {
  const [filters, setFilters] = useState<ScopeFilterState>(emptyFilters);

  const toggleFilter = useCallback((field: FilterField, value: string) => {
    setFilters((prev) => {
      const next = { ...prev, [field]: new Set(prev[field]) };
      if (next[field].has(value)) {
        next[field].delete(value);
      } else {
        next[field].add(value);
      }
      return next;
    });
  }, []);

  const clearField = useCallback((field: FilterField) => {
    setFilters((prev) => ({ ...prev, [field]: new Set() }));
  }, []);

  const clearAll = useCallback(() => {
    setFilters(emptyFilters());
  }, []);

  const hasActiveFilters = useMemo(
    () => Object.values(filters).some((s) => s.size > 0),
    [filters]
  );

  // Apply AND-across-fields filtering
  const filteredScopes = useMemo(() => {
    if (!hasActiveFilters) return scopes;
    return scopes.filter((scope) =>
      (Object.keys(filters) as FilterField[]).every((field) =>
        matchesField(scope, field, filters[field])
      )
    );
  }, [scopes, filters, hasActiveFilters]);

  // Compute options with counts for each field
  const optionsWithCounts = useMemo(() => {
    const allTags = new Set<string>();
    for (const scope of scopes) {
      for (const tag of scope.tags) allTags.add(tag);
    }
    const sortedTags = [...allTags].sort();

    function countFor(field: FilterField, value: string): number {
      return scopes.filter((s) => getScopeFieldValues(s, field).includes(value)).length;
    }

    const priority: FilterOption[] = PRIORITY_OPTIONS.map((v) => ({
      value: v, label: v, count: countFor('priority', v),
    }));

    const category: FilterOption[] = CATEGORY_OPTIONS.map((v) => ({
      value: v, label: v, count: countFor('category', v),
    }));

    const tags: FilterOption[] = sortedTags.map((v) => ({
      value: v, label: v, count: countFor('tags', v),
    }));

    const effort: FilterOption[] = EFFORT_BUCKETS.map((v) => ({
      value: v, label: v, count: countFor('effort', v),
    }));

    const dependencies: FilterOption[] = DEPENDENCY_OPTIONS.map((v) => ({
      value: v,
      label: v === 'has-blockers' ? 'Has blockers' : v === 'blocks-others' ? 'Blocks others' : 'No dependencies',
      count: countFor('dependencies', v),
    }));

    return { priority, category, tags, effort, dependencies };
  }, [scopes]);

  return {
    filters,
    toggleFilter,
    clearField,
    clearAll,
    hasActiveFilters,
    filteredScopes,
    optionsWithCounts,
  };
}
