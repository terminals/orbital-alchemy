import { useEffect, useState, useCallback } from 'react';
import { socket } from '../socket';
import { useReconnect } from './useReconnect';
import { useProjectUrl } from './useProjectUrl';
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
  const [loading, setLoading] = useState(true);

  const fetchSummary = useCallback(async () => {
    try {
      const res = await fetch(buildUrl('/events/violations/summary'));
      if (res.ok) setSummary(await res.json());
    } catch {
      // Silently fail — CC server may not be running
    } finally {
      setLoading(false);
    }
  }, [buildUrl]);

  useEffect(() => { fetchSummary(); }, [fetchSummary]);

  useReconnect(fetchSummary);

  // Real-time: re-fetch when new VIOLATION or OVERRIDE events arrive
  useEffect(() => {
    function onNewEvent(event: OrbitalEvent) {
      if (event.type === 'VIOLATION' || event.type === 'OVERRIDE') {
        fetchSummary();
      }
    }
    socket.on('event:new', onNewEvent);
    return () => { socket.off('event:new', onNewEvent); };
  }, [fetchSummary]);

  return { ...summary, loading, refetch: fetchSummary };
}
