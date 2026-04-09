import { useEffect, useState, useCallback } from 'react';
import { socket } from '../socket';
import { useReconnect } from './useReconnect';
import { useProjectUrl } from './useProjectUrl';
import type { EnforcementRulesData, ViolationTrendPoint, OrbitalEvent } from '../types';

export function useEnforcementRules() {
  const buildUrl = useProjectUrl();
  const [data, setData] = useState<EnforcementRulesData | null>(null);
  const [trend, setTrend] = useState<ViolationTrendPoint[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRules = useCallback(async () => {
    try {
      const [rulesRes, trendRes] = await Promise.all([
        fetch(buildUrl('/enforcement/rules')),
        fetch(buildUrl('/events/violations/trend?days=30')),
      ]);
      if (rulesRes.ok) setData(await rulesRes.json());
      if (trendRes.ok) setTrend(await trendRes.json());
    } catch (err) {
      console.warn('[Orbital] Failed to fetch enforcement rules:', err);
    } finally {
      setLoading(false);
    }
  }, [buildUrl]);

  useEffect(() => {
    fetchRules();
  }, [fetchRules]);

  useReconnect(fetchRules);

  // Re-fetch when new violations/overrides arrive
  useEffect(() => {
    function onNewEvent(event: OrbitalEvent) {
      if (event.type === 'VIOLATION' || event.type === 'OVERRIDE') {
        fetchRules();
      }
    }
    socket.on('event:new', onNewEvent);
    return () => {
      socket.off('event:new', onNewEvent);
    };
  }, [fetchRules]);

  return { data, trend, loading, refetch: fetchRules };
}
