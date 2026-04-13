import { useState, useCallback } from 'react';
import { useProjectUrl } from './useProjectUrl';
import { useFetch } from './useFetch';
import { useSocketListener } from './useSocketListener';
import type { QualityGate } from '../types';

export function useGates(scopeId?: number) {
  const buildUrl = useProjectUrl();
  const [gates, setGates] = useState<QualityGate[]>([]);
  const [stats, setStats] = useState<{ gate_name: string; total: number; passed: number; failed: number }[]>([]);

  const fetchGates = useCallback(async () => {
    const params = scopeId ? `?scope_id=${scopeId}` : '';
    const [gatesRes, statsRes] = await Promise.all([
      fetch(buildUrl(`/gates${params}`)),
      fetch(buildUrl('/gates/stats')),
    ]);

    if (gatesRes.ok) setGates(await gatesRes.json());
    if (statsRes.ok) setStats(await statsRes.json());
  }, [scopeId, buildUrl]);

  const { loading } = useFetch(fetchGates);

  // Real-time gate updates
  useSocketListener('gate:updated', (gate: QualityGate) => {
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
  }, []);

  return { gates, stats, loading, refetch: fetchGates };
}
