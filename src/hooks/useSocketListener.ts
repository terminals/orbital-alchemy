import { useEffect } from 'react';
import { socket } from '../socket';
import type { ServerToClientEvents } from '../types';

type EventName = keyof ServerToClientEvents;

/**
 * Subscribe to one or more Socket.io events with automatic cleanup.
 * Eliminates the repetitive useEffect → socket.on → socket.off pattern.
 *
 * @param event — single event name or array of event names
 * @param handler — callback for all listed events
 * @param deps — dependency array (handler is re-registered when deps change)
 */
export function useSocketListener<E extends EventName>(
  event: E | E[],
  handler: ServerToClientEvents[E],
  deps: unknown[] = [],
): void {
  useEffect(() => {
    const events = Array.isArray(event) ? event : [event];
    for (const e of events) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      socket.on(e, handler as any);
    }
    return () => {
      for (const e of events) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        socket.off(e, handler as any);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
