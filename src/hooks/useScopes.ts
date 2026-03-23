import { useEffect, useState, useCallback } from 'react';
import { socket } from '../socket';
import { useReconnect } from './useReconnect';
import type { Scope } from '../types';

export function useScopes() {
  const [scopes, setScopes] = useState<Scope[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchScopes = useCallback(async () => {
    try {
      const res = await fetch('/api/orbital/scopes');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setScopes(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch scopes');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchScopes();
  }, [fetchScopes]);

  useReconnect(fetchScopes);

  // Real-time updates via Socket.io
  useEffect(() => {
    function onScopeUpdated(scope: Scope) {
      setScopes((prev) => {
        const idx = prev.findIndex((s) => s.id === scope.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = scope;
          return next;
        }
        return [...prev, scope].sort((a, b) => a.id - b.id);
      });
    }

    function onScopeCreated(scope: Scope) {
      setScopes((prev) => [...prev, scope].sort((a, b) => a.id - b.id));
    }

    function onScopeDeleted(scopeId: number) {
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
