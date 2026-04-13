import { useState, useCallback } from 'react';
import { useProjectUrl } from './useProjectUrl';
import { useFetch } from './useFetch';
import { useSocketListener } from './useSocketListener';
import type { OrbitalEvent } from '../types';

interface UseEventsOptions {
  limit?: number;
  type?: string;
}

export function useEvents(options: UseEventsOptions = {}) {
  const buildUrl = useProjectUrl();
  const { limit = 50, type } = options;
  const [events, setEvents] = useState<OrbitalEvent[]>([]);

  const fetchEvents = useCallback(async () => {
    const params = new URLSearchParams();
    params.set('limit', String(limit));
    if (type) params.set('type', type);

    const res = await fetch(buildUrl(`/events?${params}`));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    setEvents(await res.json());
  }, [limit, type, buildUrl]);

  const { loading } = useFetch(fetchEvents);

  // Real-time updates — prepend new events
  useSocketListener('event:new', (event: OrbitalEvent) => {
    if (type && event.type !== type) return;
    setEvents((prev) => {
      if (prev.some((e) => e.id === event.id)) return prev;
      return [event, ...prev].slice(0, limit);
    });
  }, [limit, type]);

  return { events, loading, refetch: fetchEvents };
}
