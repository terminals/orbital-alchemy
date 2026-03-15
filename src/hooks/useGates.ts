import { useEffect, useState, useCallback } from 'react';
import { socket } from '../socket';
import type { QualityGate } from '../types';

export function useGates(scopeId?: number) {
  const [gates, setGates] = useState<QualityGate[]>([]);
  const [stats, setStats] = useState<{ gate_name: string; total: number; passed: number; failed: number }[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchGates = useCallback(async () => {
    try {
      const params = scopeId ? `?scope_id=${scopeId}` : '';
      const [gatesRes, statsRes] = await Promise.all([
        fetch(`/api/orbital/gates${params}`),
        fetch('/api/orbital/gates/stats'),
      ]);

      if (gatesRes.ok) setGates(await gatesRes.json());
      if (statsRes.ok) setStats(await statsRes.json());
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
    }
  }, [scopeId]);

  useEffect(() => {
    fetchGates();
  }, [fetchGates]);

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
