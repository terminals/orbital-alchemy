import { useEffect, useState, useCallback } from 'react';
import { socket } from '../socket';
import { useProjectUrl } from './useProjectUrl';
import type { ScopeReadiness, QualityGate, OrbitalEvent } from '../types';

export function useTransitionReadiness(scopeId: number | null, projectId?: string) {
  const buildUrl = useProjectUrl();
  const [readiness, setReadiness] = useState<ScopeReadiness | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchReadiness = useCallback(async () => {
    if (scopeId == null) {
      setReadiness(null);
      return;
    }
    setLoading(true);
    try {
      const params = projectId ? `?project_id=${encodeURIComponent(projectId)}` : '';
      const res = await fetch(buildUrl(`/scopes/${scopeId}/readiness${params}`));
      if (res.ok) setReadiness(await res.json());
    } catch {
      // Server may not be running
    } finally {
      setLoading(false);
    }
  }, [scopeId, projectId, buildUrl]);

  useEffect(() => {
    fetchReadiness();
  }, [fetchReadiness]);

  // Re-fetch when gates or relevant events change
  useEffect(() => {
    function onGateUpdated(_gate: QualityGate) {
      fetchReadiness();
    }
    function onNewEvent(event: OrbitalEvent) {
      // Filter by project first — ignore events from other projects
      const eventProjectId = (event as unknown as Record<string, unknown>)._projectId as string | undefined;
      if (projectId && eventProjectId && eventProjectId !== projectId) return;

      if (
        event.scope_id === scopeId ||
        ['VIOLATION', 'OVERRIDE', 'SCOPE_STATUS_CHANGED'].includes(event.type)
      ) {
        fetchReadiness();
      }
    }

    socket.on('gate:updated', onGateUpdated);
    socket.on('event:new', onNewEvent);
    return () => {
      socket.off('gate:updated', onGateUpdated);
      socket.off('event:new', onNewEvent);
    };
  }, [scopeId, projectId, fetchReadiness]);

  return { readiness, loading, refetch: fetchReadiness };
}
