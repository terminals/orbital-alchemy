import { useState, useEffect, useCallback } from 'react';
import type { Sprint } from '@/types';

interface SprintPreflightState {
  graph: { layers: number[][]; edges: Array<{ from: number; to: number }> } | null;
  loading: boolean;
  showPreflight: boolean;
  pendingSprint: Sprint | null;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
}

export function useSprintPreflight(
  pendingSprint: Sprint | null,
  getGraph: (id: number) => Promise<{ layers: number[][]; edges: Array<{ from: number; to: number }> } | null>,
  dispatchSprint: (id: number) => Promise<unknown>,
  dismissSprintDispatch: () => void,
): SprintPreflightState {
  const [graph, setGraph] = useState<SprintPreflightState['graph']>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!pendingSprint) return;
    let cancelled = false;
    setLoading(true);
    getGraph(pendingSprint.id).then((g) => {
      if (!cancelled) {
        setGraph(g);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [pendingSprint, getGraph]);

  const onConfirm = useCallback(async () => {
    if (!pendingSprint) return;
    await dispatchSprint(pendingSprint.id);
    dismissSprintDispatch();
    setGraph(null);
  }, [pendingSprint, dispatchSprint, dismissSprintDispatch]);

  const onCancel = useCallback(() => {
    dismissSprintDispatch();
    setGraph(null);
  }, [dismissSprintDispatch]);

  return {
    graph,
    loading,
    showPreflight: pendingSprint != null,
    pendingSprint,
    onConfirm,
    onCancel,
  };
}
