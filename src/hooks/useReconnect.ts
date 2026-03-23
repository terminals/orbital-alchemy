import { useEffect } from 'react';
import { socket } from '../socket';

/**
 * Calls `onReconnect` when the socket reconnects or the tab becomes visible
 * after being hidden. Prevents stale data after missed socket events.
 */
export function useReconnect(onReconnect: () => void) {
  // Refetch on socket reconnect (covers server restarts, network blips)
  useEffect(() => {
    socket.on('connect', onReconnect);
    return () => { socket.off('connect', onReconnect); };
  }, [onReconnect]);

  // Refetch when tab becomes visible (covers long-backgrounded tabs)
  useEffect(() => {
    function onVisibility() {
      if (document.visibilityState === 'visible') {
        onReconnect();
      }
    }
    document.addEventListener('visibilitychange', onVisibility);
    return () => { document.removeEventListener('visibilitychange', onVisibility); };
  }, [onReconnect]);
}
