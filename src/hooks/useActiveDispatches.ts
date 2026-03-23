import { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { socket } from '../socket';
import type { OrbitalEvent, Scope, DispatchResolvedPayload } from '@/types';
import { useWorkflow } from './useWorkflow';

export interface AbandonedInfo {
  from_status: string | null;
  abandoned_at: string;
}

interface ActiveDispatchContextValue {
  activeScopes: Set<number>;
  abandonedScopes: Map<number, AbandonedInfo>;
  recoverScope: (scopeId: number, fromStatus: string) => Promise<void>;
  dismissAbandoned: (scopeId: number) => Promise<void>;
}

const DEFAULT_VALUE: ActiveDispatchContextValue = {
  activeScopes: new Set(),
  abandonedScopes: new Map(),
  recoverScope: async () => {},
  dismissAbandoned: async () => {},
};

export const ActiveDispatchContext = createContext<ActiveDispatchContextValue>(DEFAULT_VALUE);

/** Provider hook — call once at ScopeBoard level.
 *  Fetches initial set from REST, then maintains via socket events. */
export function useActiveDispatchProvider(): ActiveDispatchContextValue {
  const { engine } = useWorkflow();
  const terminalStatuses = useMemo(
    () => new Set(engine.getConfig().terminalStatuses ?? []),
    [engine],
  );
  const [activeScopes, setActiveScopes] = useState<Set<number>>(new Set());
  const [abandonedScopes, setAbandonedScopes] = useState<Map<number, AbandonedInfo>>(new Map());
  const mountedRef = useRef(true);

  const removeFromAbandoned = useCallback((scopeId: number) => {
    setAbandonedScopes((prev) => {
      if (!prev.has(scopeId)) return prev;
      const next = new Map(prev);
      next.delete(scopeId);
      return next;
    });
  }, []);

  const fetchActiveScopes = useCallback(async () => {
    try {
      const res = await fetch('/api/orbital/dispatch/active-scopes');
      if (!res.ok) {
        console.warn('[Orbital] Failed to fetch active scopes:', res.status, res.statusText);
        return;
      }
      const data = await res.json() as {
        scope_ids: number[];
        abandoned_scopes?: Array<{ scope_id: number; from_status: string | null; abandoned_at: string }>;
      };
      if (!mountedRef.current) return;
      setActiveScopes(new Set(data.scope_ids));

      if (data.abandoned_scopes) {
        const map = new Map<number, AbandonedInfo>();
        for (const item of data.abandoned_scopes) {
          map.set(item.scope_id, { from_status: item.from_status, abandoned_at: item.abandoned_at });
        }
        setAbandonedScopes(map);
      }
    } catch {
      // Silently ignore — will retry on next reconnect
    }
  }, []);

  const recoverScope = useCallback(async (scopeId: number, fromStatus: string) => {
    try {
      const res = await fetch(`/api/orbital/dispatch/recover/${scopeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from_status: fromStatus }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }));
        console.error('[Orbital] Failed to recover scope:', body.error);
        return;
      }
      removeFromAbandoned(scopeId);
    } catch (err) {
      console.error('[Orbital] Failed to recover scope:', err);
    }
  }, [removeFromAbandoned]);

  const dismissAbandoned = useCallback(async (scopeId: number) => {
    try {
      const res = await fetch(`/api/orbital/dispatch/dismiss-abandoned/${scopeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }));
        console.error('[Orbital] Failed to dismiss abandoned scope:', body.error);
        return;
      }
      removeFromAbandoned(scopeId);
    } catch (err) {
      console.error('[Orbital] Failed to dismiss abandoned scope:', err);
    }
  }, [removeFromAbandoned]);

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
        // New dispatch clears abandoned state for this scope
        removeFromAbandoned(scopeId);
      }
    }

    function onDispatchResolved(payload: DispatchResolvedPayload) {
      if (payload.scope_id == null) return;
      const scopeId = payload.scope_id;

      // Always remove from active
      setActiveScopes((prev) => {
        if (!prev.has(scopeId)) return prev;
        const next = new Set(prev);
        next.delete(scopeId);
        return next;
      });

      if (payload.outcome === 'abandoned') {
        // Refetch to get full abandoned info (from_status etc.)
        fetchActiveScopes();
      } else {
        // completed/failed — remove from abandoned if present
        removeFromAbandoned(scopeId);
      }
    }

    function onScopeUpdated(scope: Scope) {
      if (terminalStatuses.has(scope.status)) {
        const scopeId = scope.id;
        setActiveScopes((prev) => {
          if (!prev.has(scopeId)) return prev;
          const next = new Set(prev);
          next.delete(scopeId);
          return next;
        });
        // Terminal state clears abandoned
        removeFromAbandoned(scopeId);
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
  }, [fetchActiveScopes, removeFromAbandoned, terminalStatuses]);

  return { activeScopes, abandonedScopes, recoverScope, dismissAbandoned };
}

/** Consumer hook — use in ScopeCard to check dispatch state */
export function useActiveDispatches(): ActiveDispatchContextValue {
  return useContext(ActiveDispatchContext);
}
