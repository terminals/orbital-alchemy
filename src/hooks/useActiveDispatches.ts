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
      if (event.type !== 'DISPATCH' || event.data.resolved != null) return;

      // Collect scope IDs: single dispatch uses event.scope_id, batch uses data.scope_ids
      const ids: number[] = [];
      if (event.scope_id != null) ids.push(event.scope_id);
      if (Array.isArray(event.data.scope_ids)) {
        for (const id of event.data.scope_ids as number[]) {
          if (!ids.includes(id)) ids.push(id);
        }
      }
      if (ids.length === 0) return;

      setActiveScopes((prev) => {
        const toAdd = ids.filter(id => !prev.has(id));
        if (toAdd.length === 0) return prev;
        const next = new Set(prev);
        for (const id of toAdd) next.add(id);
        return next;
      });
      for (const id of ids) removeFromAbandoned(id);
    }

    function onDispatchResolved(payload: DispatchResolvedPayload) {
      // Collect all scope IDs: single dispatch + batch scope_ids
      const ids: number[] = [];
      if (payload.scope_id != null) ids.push(payload.scope_id);
      if (Array.isArray(payload.scope_ids)) ids.push(...payload.scope_ids);
      if (ids.length === 0) return;

      setActiveScopes((prev) => {
        const toRemove = ids.filter(id => prev.has(id));
        if (toRemove.length === 0) return prev;
        const next = new Set(prev);
        for (const id of toRemove) next.delete(id);
        return next;
      });

      if (payload.outcome === 'abandoned') {
        fetchActiveScopes();
      } else {
        for (const id of ids) removeFromAbandoned(id);
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
