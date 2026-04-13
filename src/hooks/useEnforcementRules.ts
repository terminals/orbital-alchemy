import { useState, useCallback } from 'react';
import { useProjectUrl } from './useProjectUrl';
import { useFetch } from './useFetch';
import { useSocketListener } from './useSocketListener';
import type { EnforcementRulesData, ViolationTrendPoint, OrbitalEvent } from '../types';

export function useEnforcementRules() {
  const buildUrl = useProjectUrl();
  const [data, setData] = useState<EnforcementRulesData | null>(null);
  const [trend, setTrend] = useState<ViolationTrendPoint[]>([]);

  const fetchRules = useCallback(async () => {
    const [rulesRes, trendRes] = await Promise.all([
      fetch(buildUrl('/enforcement/rules')),
      fetch(buildUrl('/events/violations/trend?days=30')),
    ]);
    if (rulesRes.ok) setData(await rulesRes.json());
    if (trendRes.ok) setTrend(await trendRes.json());
  }, [buildUrl]);

  const { loading } = useFetch(fetchRules);

  // Re-fetch when new violations/overrides arrive
  useSocketListener('event:new', (event: OrbitalEvent) => {
    if (event.type === 'VIOLATION' || event.type === 'OVERRIDE') {
      fetchRules();
    }
  }, [fetchRules]);

  return { data, trend, loading, refetch: fetchRules };
}
