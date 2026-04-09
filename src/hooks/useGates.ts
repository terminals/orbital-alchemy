import { useEffect, useState, useCallback } from 'react';
import { socket } from '../socket';
import { useReconnect } from './useReconnect';
import { useProjectUrl } from './useProjectUrl';
import type { QualityGate } from '../types';

export function useGates(scopeId?: number) {
  const buildUrl = useProjectUrl();
  const [gates, setGates] = useState<QualityGate[]>([]);
  const [stats, setStats] = useState<{ gate_name: string; total: number; passed: number; failed: number }[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchGates = useCallback(async (signal?: AbortSignal) => {
    try {
      const params = scopeId ? `?scope_id=${scopeId}` : '';
      const [gatesRes, statsRes] = await Promise.all([
        fetch(buildUrl(`/gates${params}`), { signal }),
        fetch(buildUrl('/gates/stats'), { signal }),
      ]);

      if (gatesRes.ok) setGates(await gatesRes.json());
      if (statsRes.ok) setStats(await statsRes.json());
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      console.warn('[Orbital] Failed to fetch gates:', err);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [scopeId, buildUrl]);

  useEffect(() => {
    const controller = new AbortController();
    fetchGates(controller.signal);
    return () => controller.abort();
  }, [fetchGates]);

  useReconnect(fetchGates);

  // Real-time gate updates
  useEffect(() => {
    function onGateUpdated(gate: QualityGate) {
      setGates((prev) => {
        const idx = prev.findIndex(
          (g) => g.gate_name === gate.gate_name && g.scope_id === gate.scope_id
        );
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = gate;
          return next;
        }
        return [...prev, gate];
      });
    }

    socket.on('gate:updated', onGateUpdated);
    return () => {
      socket.off('gate:updated', onGateUpdated);
    };
  }, []);

  return { gates, stats, loading, refetch: fetchGates };
}
