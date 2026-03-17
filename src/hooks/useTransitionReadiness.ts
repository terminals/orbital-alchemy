import { useEffect, useState, useCallback } from 'react';
import { socket } from '../socket';
import type { ScopeReadiness, QualityGate, OrbitalEvent } from '../types';

export function useTransitionReadiness(scopeId: number | null) {
  const [readiness, setReadiness] = useState<ScopeReadiness | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchReadiness = useCallback(async () => {
    if (scopeId == null) {
      setReadiness(null);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/orbital/scopes/${scopeId}/readiness`);
      if (res.ok) setReadiness(await res.json());
    } catch {
      // Server may not be running
    } finally {
      setLoading(false);
    }
  }, [scopeId]);

  useEffect(() => {
    fetchReadiness();
  }, [fetchReadiness]);

  // Re-fetch when gates or relevant events change
  useEffect(() => {
    function onGateUpdated(_gate: QualityGate) {
      fetchReadiness();
    }
    function onNewEvent(event: OrbitalEvent) {
      // Re-fetch when events affect this scope
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
  }, [scopeId, fetchReadiness]);

  return { readiness, loading, refetch: fetchReadiness };
}
