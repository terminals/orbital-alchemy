import { useEffect, useState, useCallback } from 'react';
import { socket } from '../socket';
import { useReconnect } from './useReconnect';
import { useProjectUrl } from './useProjectUrl';
import type { Sprint, GroupType } from '../types';

export interface AddScopesResult {
  added: number[];
  unmet_dependencies: Array<{ scope_id: number; missing: Array<{ scope_id: number; title: string; status: string }> }>;
}

export function useSprints() {
  const buildUrl = useProjectUrl();
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSprints = useCallback(async () => {
    try {
      const res = await fetch(buildUrl('/sprints'));
      if (!res.ok) return;
      const data = await res.json();
      setSprints(data);
    } finally {
      setLoading(false);
    }
  }, [buildUrl]);

  useEffect(() => {
    fetchSprints();
  }, [fetchSprints]);

  useReconnect(fetchSprints);

  // Real-time updates via Socket.io
  useEffect(() => {
    function onCreated(sprint: Sprint) {
      setSprints((prev) => [sprint, ...prev]);
    }

    function onUpdated(sprint: Sprint) {
      setSprints((prev) => {
        const idx = prev.findIndex((s) => s.id === sprint.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = sprint;
          return next;
        }
        return [sprint, ...prev];
      });
    }

    function onDeleted({ id }: { id: number }) {
      setSprints((prev) => prev.filter((s) => s.id !== id));
    }

    function onCompleted(sprint: Sprint) {
      setSprints((prev) => {
        const idx = prev.findIndex((s) => s.id === sprint.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = sprint;
          return next;
        }
        return prev;
      });
    }

    socket.on('sprint:created', onCreated);
    socket.on('sprint:updated', onUpdated);
    socket.on('sprint:deleted', onDeleted);
    socket.on('sprint:completed', onCompleted);

    return () => {
      socket.off('sprint:created', onCreated);
      socket.off('sprint:updated', onUpdated);
      socket.off('sprint:deleted', onDeleted);
      socket.off('sprint:completed', onCompleted);
    };
  }, []);

  const createSprint = useCallback(async (
    name: string,
    options?: { target_column?: string; group_type?: GroupType },
  ): Promise<Sprint | null> => {
    const res = await fetch(buildUrl('/sprints'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, ...options }),
    });
    if (!res.ok) return null;
    return res.json();
  }, [buildUrl]);

  const renameSprint = useCallback(async (id: number, name: string): Promise<boolean> => {
    const res = await fetch(buildUrl(`/sprints/${id}`), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    return res.ok;
  }, [buildUrl]);

  const deleteSprint = useCallback(async (id: number): Promise<boolean> => {
    const res = await fetch(buildUrl(`/sprints/${id}`), { method: 'DELETE' });
    return res.ok;
  }, [buildUrl]);

  const addScopes = useCallback(async (sprintId: number, scopeIds: number[]): Promise<AddScopesResult | null> => {
    const res = await fetch(buildUrl(`/sprints/${sprintId}/scopes`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scope_ids: scopeIds }),
    });
    if (!res.ok) return null;
    return res.json();
  }, [buildUrl]);

  const removeScopes = useCallback(async (sprintId: number, scopeIds: number[]): Promise<boolean> => {
    const res = await fetch(buildUrl(`/sprints/${sprintId}/scopes`), {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scope_ids: scopeIds }),
    });
    return res.ok;
  }, [buildUrl]);

  const dispatchSprint = useCallback(async (id: number): Promise<{ ok: boolean; error?: string; layers?: number[][] }> => {
    const res = await fetch(buildUrl(`/sprints/${id}/dispatch`), { method: 'POST' });
    return res.json();
  }, [buildUrl]);

  const cancelSprint = useCallback(async (id: number): Promise<boolean> => {
    const res = await fetch(buildUrl(`/sprints/${id}/cancel`), { method: 'POST' });
    return res.ok;
  }, [buildUrl]);

  const getGraph = useCallback(async (id: number): Promise<{ layers: number[][]; edges: Array<{ from: number; to: number }> } | null> => {
    const res = await fetch(buildUrl(`/sprints/${id}/graph`));
    if (!res.ok) return null;
    return res.json();
  }, [buildUrl]);

  return {
    sprints,
    loading,
    refetch: fetchSprints,
    createSprint,
    renameSprint,
    deleteSprint,
    addScopes,
    removeScopes,
    dispatchSprint,
    cancelSprint,
    getGraph,
  };
}
