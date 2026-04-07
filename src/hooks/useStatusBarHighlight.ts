import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

export function useStatusBarHighlight() {
  const [searchParams, setSearchParams] = useSearchParams();

  const highlightedScopeKey = searchParams.get('highlight') ?? null;

  const clearHighlight = useCallback(() => {
    setSearchParams((prev) => {
      prev.delete('highlight');
      return prev;
    }, { replace: true });
  }, [setSearchParams]);

  return { highlightedScopeKey, clearHighlight };
}
