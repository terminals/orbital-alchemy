import { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { socket } from '../socket';
import type { OrbitalEvent, Scope, DispatchResolvedPayload } from '@/types';
import { useWorkflow } from './useWorkflow';
import { useProjects } from './useProjectContext';
import { scopeKey } from '@/lib/scope-key';
import {
  parseActiveScopeIds,
  parseAbandonedScopes,
  extractDispatchScopeIds,
  extractResolvedScopeIds,
  buildScopeKeys,
  addToActiveSet,
  removeFromActiveSet,
  isNewDispatchEvent,
  extractProjectId,
} from './active-dispatch-utils';
import type { AbandonedInfo } from './active-dispatch-utils';

export type { AbandonedInfo };

interface ActiveDispatchContextValue {
  activeScopes: Set<string>;
  abandonedScopes: Map<string, AbandonedInfo>;
  recoverScope: (scopeId: number, fromStatus: string, projectId?: string) => Promise<void>;
  dismissAbandoned: (scopeId: number, projectId?: string) => Promise<void>;
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
  const { getApiBase, activeProjectId } = useProjects();
  const terminalStatuses = useMemo(
    () => new Set(engine.getConfig().terminalStatuses ?? []),
    [engine],
  );
  const [activeScopes, setActiveScopes] = useState<Set<string>>(new Set());
  const [abandonedScopes, setAbandonedScopes] = useState<Map<string, AbandonedInfo>>(new Map());
  const mountedRef = useRef(true);
  const activeProjectIdRef = useRef(activeProjectId);
  activeProjectIdRef.current = activeProjectId;

  // Build the fetch URL based on project context
  // Check activeProjectId first — in central-server mode with 1 project,
  // hasMultipleProjects is false but the root endpoint doesn't exist.
  const fetchUrl = useMemo(() => {
    if (activeProjectId) return `${getApiBase(activeProjectId)}/dispatch/active-scopes`;
    return '/api/orbital/aggregate/dispatch/active-scopes';
  }, [activeProjectId, getApiBase]);

  // Build a key for a scope ID + optional project ID
  const makeScopeKey = useCallback((id: number, projectId?: string | null) => {
    return scopeKey({ id, project_id: projectId ?? activeProjectId ?? undefined });
  }, [activeProjectId]);

  const removeFromAbandoned = useCallback((key: string) => {
    setAbandonedScopes((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Map(prev);
      next.delete(key);
      return next;
    });
  }, []);

  const fetchActiveScopes = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch(fetchUrl, { signal });
      if (!res.ok) {
        console.warn('[Orbital] Failed to fetch active scopes:', res.status, res.statusText);
        setActiveScopes(new Set());
        setAbandonedScopes(new Map());
        return;
      }
      const data = await res.json() as {
        scope_ids: number[] | Array<{ scope_id: number; project_id: string }>;
        abandoned_scopes?: Array<{ scope_id: number; project_id?: string; from_status: string | null; abandoned_at: string }>;
      };
      if (!mountedRef.current) return;

      // Parse active scopes — handle both old (number[]) and new ({scope_id, project_id}[]) shapes
      setActiveScopes(parseActiveScopeIds(data.scope_ids, makeScopeKey));

      if (data.abandoned_scopes) {
        setAbandonedScopes(parseAbandonedScopes(data.abandoned_scopes, makeScopeKey));
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      // Clear state on error to avoid stale data
      setActiveScopes(new Set());
      setAbandonedScopes(new Map());
    }
  }, [fetchUrl, makeScopeKey]);

  const recoverScope = useCallback(async (scopeId: number, fromStatus: string, projectId?: string) => {
    try {
      // Always target the specific project's endpoint for mutations
      const pid = projectId ?? activeProjectId;
      const base = getApiBase(pid);
      const res = await fetch(`${base}/dispatch/recover/${scopeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from_status: fromStatus }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }));
        console.error('[Orbital] Failed to recover scope:', body.error);
        return;
      }
      const key = scopeKey({ id: scopeId, project_id: pid ?? undefined });
      removeFromAbandoned(key);
    } catch (err) {
      console.error('[Orbital] Failed to recover scope:', err);
    }
  }, [removeFromAbandoned, activeProjectId, getApiBase]);

  const dismissAbandoned = useCallback(async (scopeId: number, projectId?: string) => {
    try {
      const pid = projectId ?? activeProjectId;
      const base = getApiBase(pid);
      const res = await fetch(`${base}/dispatch/dismiss-abandoned/${scopeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }));
        console.error('[Orbital] Failed to dismiss abandoned scope:', body.error);
        return;
      }
      const key = scopeKey({ id: scopeId, project_id: pid ?? undefined });
      removeFromAbandoned(key);
    } catch (err) {
      console.error('[Orbital] Failed to dismiss abandoned scope:', err);
    }
  }, [removeFromAbandoned, activeProjectId, getApiBase]);

  useEffect(() => {
    mountedRef.current = true;
    const controller = new AbortController();
    fetchActiveScopes(controller.signal);
    return () => {
      mountedRef.current = false;
      controller.abort();
    };
  }, [fetchActiveScopes]);

  useEffect(() => {
    function onNewEvent(event: OrbitalEvent) {
      if (!isNewDispatchEvent(event)) return;
      const eventProjectId = extractProjectId(event as unknown as Record<string, unknown>);

      const ids = extractDispatchScopeIds(event);
      if (ids.length === 0) return;

      const keys = buildScopeKeys(ids, eventProjectId, activeProjectIdRef.current ?? undefined);
      setActiveScopes((prev) => addToActiveSet(prev, keys));
      for (const k of keys) {
        removeFromAbandoned(k);
      }
    }

    function onDispatchResolved(payload: DispatchResolvedPayload) {
      const eventProjectId = extractProjectId(payload as unknown as Record<string, unknown>);
      const ids = extractResolvedScopeIds(payload);
      if (ids.length === 0) return;

      const keys = buildScopeKeys(ids, eventProjectId, activeProjectIdRef.current ?? undefined);

      setActiveScopes((prev) => removeFromActiveSet(prev, keys));

      if (payload.outcome === 'abandoned') {
        fetchActiveScopes();
      } else {
        for (const k of keys) removeFromAbandoned(k);
      }
    }

    function onScopeUpdated(scope: Scope) {
      if (terminalStatuses.has(scope.status)) {
        const eventProjectId = extractProjectId(scope as unknown as Record<string, unknown>);
        const key = scopeKey({ id: scope.id, project_id: eventProjectId ?? scope.project_id ?? activeProjectIdRef.current ?? undefined });
        setActiveScopes((prev) => removeFromActiveSet(prev, [key]));
        // Terminal state clears abandoned
        removeFromAbandoned(key);
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
