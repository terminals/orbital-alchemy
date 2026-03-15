import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { socket } from '../socket';
import type { OrbitalEvent, Scope } from '@/types';

interface ActiveDispatchContextValue {
  activeScopes: Set<number>;
}

const DEFAULT_VALUE: ActiveDispatchContextValue = { activeScopes: new Set() };

export const ActiveDispatchContext = createContext<ActiveDispatchContextValue>(DEFAULT_VALUE);

/** Provider hook — call once at ScopeBoard level.
 *  Fetches initial set from REST, then maintains via socket events. */
export function useActiveDispatchProvider(): ActiveDispatchContextValue {
  const [activeScopes, setActiveScopes] = useState<Set<number>>(new Set());
  const mountedRef = useRef(true);

  const fetchActiveScopes = useCallback(async () => {
    try {
      const res = await fetch('/api/orbital/dispatch/active-scopes');
      if (!res.ok) return;
      const data = await res.json() as { scope_ids: number[] };
      if (!mountedRef.current) return;
      setActiveScopes(new Set(data.scope_ids));
    } catch {
      // Silently ignore — will retry on next reconnect
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    fetchActiveScopes();
    return () => { mountedRef.current = false; };
  }, [fetchActiveScopes]);

  useEffect(() => {
    function onNewEvent(event: OrbitalEvent) {
      if (event.type === 'DISPATCH' && event.scope_id != null && event.data.resolved == null) {
        const scopeId = event.scope_id;
        setActiveScopes((prev) => {
          if (prev.has(scopeId)) return prev;
          const next = new Set(prev);
          next.add(scopeId);
          return next;
        });
      }
    }

    function onDispatchResolved(payload: { scope_id: number | null }) {
      if (payload.scope_id == null) return;
      const scopeId = payload.scope_id;
      setActiveScopes((prev) => {
        if (!prev.has(scopeId)) return prev;
        const next = new Set(prev);
        next.delete(scopeId);
        return next;
      });
    }

    const TERMINAL = new Set(['completed', 'dev', 'staging', 'production']);
    function onScopeUpdated(scope: Scope) {
      if (TERMINAL.has(scope.status)) {
        const scopeId = scope.id;
        setActiveScopes((prev) => {
          if (!prev.has(scopeId)) return prev;
          const next = new Set(prev);
          next.delete(scopeId);
          return next;
        });
      }
    }

    function onReconnect() {
      fetchActiveScopes();
    }

    socket.on('event:new', onNewEvent);
    socket.on('dispatch:resolved', onDispatchResolved);
    socket.on('scope:updated', onScopeUpdated);
    socket.on('connect', onReconnect);

    return () => {
      socket.off('event:new', onNewEvent);
      socket.off('dispatch:resolved', onDispatchResolved);
      socket.off('scope:updated', onScopeUpdated);
      socket.off('connect', onReconnect);
    };
  }, [fetchActiveScopes]);

  return { activeScopes };
}

/** Consumer hook — use in ScopeCard to check dispatch state */
export function useActiveDispatches(): ActiveDispatchContextValue {
  return useContext(ActiveDispatchContext);
}
