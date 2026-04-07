import { useEffect, useState, useCallback } from 'react';
import { socket } from '../socket';
import { useReconnect } from './useReconnect';
import { useProjectUrl } from './useProjectUrl';
import { useProjects } from './useProjectContext';
import type { Scope } from '../types';

export function useScopes() {
  const buildUrl = useProjectUrl();
  const { activeProjectId } = useProjects();
  const [scopes, setScopes] = useState<Scope[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchScopes = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch(buildUrl('/scopes'), { signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: Scope[] = await res.json();
      // Per-project endpoints don't stamp project_id — fill it in client-side
      if (activeProjectId) {
        for (const scope of data) {
          if (!scope.project_id) scope.project_id = activeProjectId;
        }
      }
      setScopes(data);
      setError(null);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : 'Failed to fetch scopes');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [buildUrl, activeProjectId]);

  useEffect(() => {
    const controller = new AbortController();
    fetchScopes(controller.signal);
    return () => controller.abort();
  }, [fetchScopes]);

  useReconnect(fetchScopes);

  // Real-time updates via Socket.io
  useEffect(() => {
    function belongsToActiveProject(scope: Scope): boolean {
      if (!activeProjectId) return true; // All Projects — accept everything
      const pid = scope.project_id ?? (scope as unknown as Record<string, unknown>)._projectId as string | undefined;
      return !pid || pid === activeProjectId;
    }

    function onScopeUpdated(scope: Scope) {
      if (!belongsToActiveProject(scope)) return;
      // Normalize project_id: ProjectEmitter injects _projectId on socket events
      const incomingPid = scope.project_id
        ?? (scope as unknown as Record<string, unknown>)._projectId as string | undefined;
      if (!scope.project_id && incomingPid) scope.project_id = incomingPid;
      if (!scope.project_id && activeProjectId) scope.project_id = activeProjectId;
      setScopes((prev) => {
        // Match by both id AND project_id to avoid cross-project collisions
        const idx = prev.findIndex((s) => s.id === scope.id
          && (!incomingPid || s.project_id === incomingPid));
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
      const incomingPid = scope.project_id
        ?? (scope as unknown as Record<string, unknown>)._projectId as string | undefined;
      if (!scope.project_id && incomingPid) scope.project_id = incomingPid;
      if (!scope.project_id && activeProjectId) scope.project_id = activeProjectId;
      setScopes((prev) => [...prev, scope].sort((a, b) => a.id - b.id));
    }

    function onScopeDeleted(scopeId: number) {
      // scope:deleted only sends a numeric ID (not an object, so ProjectEmitter
      // can't inject _projectId). In All Projects mode we can't safely
      // disambiguate which project's scope was deleted — refetch instead.
      if (!activeProjectId) {
        fetchScopes();
        return;
      }
      setScopes((prev) => prev.filter((s) => s.id !== scopeId));
    }

    socket.on('scope:updated', onScopeUpdated);
    socket.on('scope:created', onScopeCreated);
    socket.on('scope:deleted', onScopeDeleted);
    socket.on('workflow:changed', fetchScopes);

    return () => {
      socket.off('scope:updated', onScopeUpdated);
      socket.off('scope:created', onScopeCreated);
      socket.off('scope:deleted', onScopeDeleted);
      socket.off('workflow:changed', fetchScopes);
    };
  }, [fetchScopes]);

  return { scopes, loading, error, refetch: fetchScopes };
}
