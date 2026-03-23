import { useEffect, useState, useCallback } from 'react';
import { socket } from '../socket';
import { useReconnect } from './useReconnect';
import type { EnforcementRulesData, ViolationTrendPoint, OrbitalEvent } from '../types';

export function useEnforcementRules() {
  const [data, setData] = useState<EnforcementRulesData | null>(null);
  const [trend, setTrend] = useState<ViolationTrendPoint[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRules = useCallback(async () => {
    try {
      const [rulesRes, trendRes] = await Promise.all([
        fetch('/api/orbital/enforcement/rules'),
        fetch('/api/orbital/events/violations/trend?days=30'),
      ]);
      if (rulesRes.ok) setData(await rulesRes.json());
      if (trendRes.ok) setTrend(await trendRes.json());
    } catch {
      // Server may not be running
    } finally {
      setLoading(false);
    }
  }, []);

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
