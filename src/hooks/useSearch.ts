import { useState, useMemo, useDeferredValue } from 'react';
import type { Scope } from '@/types';
import { scopeKey } from '@/lib/scope-key';

export type SearchMode = 'filter' | 'highlight';

function scopeName(filePath: string): string {
  const base = filePath.split('/').pop() ?? '';
  return base.replace(/\.md$/, '').toLowerCase();
}

function matchesSearch(scope: Scope, query: string): boolean {
  const q = query.toLowerCase().trim();
  if (!q) return true;
  if (scope.title.toLowerCase().includes(q)) return true;
  if (String(scope.id).startsWith(q)) return true;
  if (scopeName(scope.file_path).includes(q)) return true;
  if (scope.category?.toLowerCase().includes(q)) return true;
  if (scope.priority?.toLowerCase().includes(q)) return true;
  if (scope.effort_estimate?.toLowerCase().includes(q)) return true;
  if (scope.status.toLowerCase().includes(q)) return true;
  if (scope.tags.some((t) => t.toLowerCase().includes(q))) return true;
  return false;
}

export function useSearch(filteredScopes: Scope[]) {
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<SearchMode>('filter');
  const deferredQuery = useDeferredValue(query);

  const hasSearch = deferredQuery.trim().length > 0;
  const isStale = query !== deferredQuery;

  const { displayScopes, dimmedIds, matchCount } = useMemo(() => {
    if (!hasSearch) {
      return { displayScopes: filteredScopes, dimmedIds: new Set<string>(), matchCount: filteredScopes.length };
    }

    if (mode === 'filter') {
      const matched = filteredScopes.filter((s) => matchesSearch(s, deferredQuery));
      return { displayScopes: matched, dimmedIds: new Set<string>(), matchCount: matched.length };
    }

    // highlight mode: keep all scopes, dim non-matching
    const dimmed = new Set<string>();
    let count = 0;
    for (const scope of filteredScopes) {
      if (matchesSearch(scope, deferredQuery)) {
        count++;
      } else {
        dimmed.add(scopeKey(scope));
      }
    }
    return { displayScopes: filteredScopes, dimmedIds: dimmed, matchCount: count };
  }, [filteredScopes, deferredQuery, hasSearch, mode]);

  return {
    query,
    setQuery,
    mode,
    setMode,
    hasSearch,
    isStale,
    displayScopes,
    dimmedIds,
    matchCount,
  };
}
