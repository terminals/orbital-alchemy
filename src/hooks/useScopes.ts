import { useEffect, useState, useCallback } from 'react';
import { socket } from '../socket';
import { useProjectUrl } from './useProjectUrl';
import { useProjects } from './useProjectContext';
import { useFetch } from './useFetch';
import { useCoalescedRefetch } from './useCoalescedRefetch';
import type { Scope } from '../types';

export function useScopes() {
  const buildUrl = useProjectUrl();
  const { activeProjectId } = useProjects();
  const [scopes, setScopes] = useState<Scope[]>([]);

  const fetchScopes = useCallback(async () => {
    const res = await fetch(buildUrl('/scopes'));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data: Scope[] = await res.json();
    // Per-project endpoints don't stamp project_id — fill it in client-side
    if (activeProjectId) {
      for (const scope of data) {
        if (!scope.project_id) scope.project_id = activeProjectId;
      }
    }
    setScopes(data);
  }, [buildUrl, activeProjectId]);

  const { loading, error } = useFetch(fetchScopes);

  // Coalesce rapid socket-driven refetches (workflow:changed + project:updated +
  // project:status:changed often fire together on connect, which caused 3-4×
  // duplicate GET /aggregate/scopes on init — F-003).
  const coalescedFetchScopes = useCoalescedRefetch(fetchScopes);

  // Real-time updates via Socket.io
  useEffect(() => {
    function belongsToActiveProject(scope: Scope): boolean {
      if (!activeProjectId) return true; // All Projects — accept everything
      return !scope.project_id || scope.project_id === activeProjectId;
    }

    function onScopeUpdated(scope: Scope) {
      if (!belongsToActiveProject(scope)) return;
      if (!scope.project_id && activeProjectId) scope.project_id = activeProjectId;
      setScopes((prev) => {
        // Match by both id AND project_id to avoid cross-project collisions
        const idx = prev.findIndex((s) => s.id === scope.id
          && (!scope.project_id || s.project_id === scope.project_id));
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = scope;
          return next;
        }
        return [...prev, scope].sort((a, b) => a.id - b.id);
      });
    }

    function onScopeCreated(scope: Scope) {
      if (!belongsToActiveProject(scope)) return;
      if (!scope.project_id && activeProjectId) scope.project_id = activeProjectId;
      setScopes((prev) => [...prev, scope].sort((a, b) => a.id - b.id));
    }

    function onScopeDeleted(payload: { id: number; project_id?: string }) {
      if (!activeProjectId) {
        coalescedFetchScopes();
        return;
      }
      if (payload.project_id && payload.project_id !== activeProjectId) return;
      setScopes((prev) => prev.filter((s) => s.id !== payload.id));
    }

    function onProjectUpdated(payload: { id: string; enabled?: boolean }) {
      if (payload.enabled === undefined) return;
      if (activeProjectId && payload.id !== activeProjectId) return;
      // Active project is being disabled — clear state and let the
      // auto-switch in useProjectContext trigger a new aggregate fetch.
      // Refetching here would race against a now-dead router (404).
      if (payload.enabled === false && payload.id === activeProjectId) {
        setScopes([]);
        return;
      }
      coalescedFetchScopes();
    }

    function onProjectStatusChanged(payload: { id: string; status: string }) {
      if (activeProjectId && payload.id !== activeProjectId) return;
      if (payload.status === 'active') coalescedFetchScopes();
    }

    socket.on('scope:updated', onScopeUpdated);
    socket.on('scope:created', onScopeCreated);
    socket.on('scope:deleted', onScopeDeleted);
    socket.on('workflow:changed', coalescedFetchScopes);
    socket.on('project:updated', onProjectUpdated);
    socket.on('project:status:changed', onProjectStatusChanged);

    return () => {
      socket.off('scope:updated', onScopeUpdated);
      socket.off('scope:created', onScopeCreated);
      socket.off('scope:deleted', onScopeDeleted);
      socket.off('workflow:changed', coalescedFetchScopes);
      socket.off('project:updated', onProjectUpdated);
      socket.off('project:status:changed', onProjectStatusChanged);
    };
  }, [coalescedFetchScopes, activeProjectId]);

  return { scopes, loading, error, refetch: fetchScopes };
}
