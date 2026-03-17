import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

export function useStatusBarHighlight() {
  const [searchParams, setSearchParams] = useSearchParams();

  const raw = searchParams.get('highlight');
  const highlightedScopeId = raw != null ? Number(raw) : null;

  const clearHighlight = useCallback(() => {
    setSearchParams((prev) => {
      prev.delete('highlight');
      return prev;
    }, { replace: true });
  }, [setSearchParams]);

  return { highlightedScopeId, clearHighlight };
}
