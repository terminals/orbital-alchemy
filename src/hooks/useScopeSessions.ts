import { useEffect, useState, useCallback } from 'react';
import { socket } from '../socket';
import type { Session } from '../types';

export type EnrichedSession = Session;

export function useScopeSessions(scopeId: number | null) {
  const [sessions, setSessions] = useState<EnrichedSession[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchSessions = useCallback(async () => {
    if (scopeId == null) {
      setSessions([]);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/orbital/scopes/${scopeId}/sessions`);
      if (res.ok) setSessions(await res.json());
    } catch {
      // silent — sessions are supplementary
    } finally {
      setLoading(false);
    }
  }, [scopeId]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  // Real-time updates
  useEffect(() => {
    function onSessionUpdate() {
      fetchSessions();
    }
    socket.on('session:updated', onSessionUpdate);
    return () => {
      socket.off('session:updated', onSessionUpdate);
    };
  }, [fetchSessions]);

  return { sessions, loading };
}
