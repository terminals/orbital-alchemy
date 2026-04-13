import { useState, useCallback } from 'react';
import { useProjectUrl } from './useProjectUrl';
import { useFetch } from './useFetch';
import { useSocketListener } from './useSocketListener';
import type { OrbitalEvent } from '../types';

interface ViolationsByRule {
  rule: string;
  count: number;
  last_seen: string;
}

interface ViolationsByFile {
  file: string;
  count: number;
}

interface Override {
  rule: string;
  reason: string;
  date: string;
}

interface ViolationsSummary {
  byRule: ViolationsByRule[];
  byFile: ViolationsByFile[];
  overrides: Override[];
  totalViolations: number;
  totalOverrides: number;
}

export function useViolations() {
  const buildUrl = useProjectUrl();
  const [summary, setSummary] = useState<ViolationsSummary>({
    byRule: [], byFile: [], overrides: [],
    totalViolations: 0, totalOverrides: 0,
  });

  const fetchSummary = useCallback(async () => {
    const res = await fetch(buildUrl('/events/violations/summary'));
    if (res.ok) setSummary(await res.json());
  }, [buildUrl]);

  const { loading } = useFetch(fetchSummary);

  // Real-time: re-fetch when new VIOLATION or OVERRIDE events arrive
  useSocketListener('event:new', (event: OrbitalEvent) => {
    if (event.type === 'VIOLATION' || event.type === 'OVERRIDE') {
      fetchSummary();
    }
  }, [fetchSummary]);

  return { ...summary, loading, refetch: fetchSummary };
}
