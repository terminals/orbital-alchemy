import { useState, useEffect, useRef } from 'react';
import { useReconnect } from './useReconnect';

/**
 * Manages the repetitive lifecycle around data-fetching hooks:
 * loading state, initial call, reconnect, and re-call on dependency change.
 *
 * The caller provides a stable `fetchFn` (wrapped in useCallback) that
 * performs the actual fetch and state-setting. This hook handles the rest.
 *
 * @param fetchFn — a useCallback-wrapped async function that does the fetch.
 *   Receives an AbortSignal for cancellation support.
 *   Should NOT manage loading state — useFetch does that.
 */
export function useFetch(fetchFn: (signal: AbortSignal) => Promise<void>) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    fetchFn(controller.signal)
      .catch((err) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        if (mountedRef.current) {
          setError(err instanceof Error ? err.message : 'Fetch failed');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted && mountedRef.current) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [fetchFn]);

  // Reconnect without AbortController (fire-and-forget refetch)
  const refetch = useRef(() => {
    fetchFn(new AbortController().signal).catch(() => {});
  });
  refetch.current = () => {
    fetchFn(new AbortController().signal).catch(() => {});
  };

  useReconnect(() => refetch.current());

  return { loading, error, refetch: refetch.current };
}
