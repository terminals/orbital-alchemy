import { useCallback, useEffect, useRef } from 'react';

/**
 * Wraps a refetch function so that rapid successive calls collapse into a single
 * trailing invocation after `delayMs`. Used to dedupe socket-event-triggered
 * refetches when multiple related events arrive in quick succession (e.g.,
 * `project:registered`, `project:updated`, `workflow:changed` all firing on
 * connect), which otherwise produce 3–4× the expected request count on init.
 *
 * The returned function is stable across renders so it can be referenced from
 * useEffect dependency arrays without causing re-subscription churn.
 */
export function useCoalescedRefetch(fn: () => void, delayMs = 100): () => void {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, []);

  return useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      timeoutRef.current = null;
      fnRef.current();
    }, delayMs);
  }, [delayMs]);
}
