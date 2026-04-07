import { useEffect, useState, useCallback } from 'react';
import { socket } from '../socket';
import { useReconnect } from './useReconnect';
import { useProjectUrl } from './useProjectUrl';
import type { OrbitalEvent } from '../types';

interface UseEventsOptions {
  limit?: number;
  type?: string;
}

export function useEvents(options: UseEventsOptions = {}) {
  const buildUrl = useProjectUrl();
  const { limit = 50, type } = options;
  const [events, setEvents] = useState<OrbitalEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchEvents = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      params.set('limit', String(limit));
      if (type) params.set('type', type);

      const res = await fetch(buildUrl(`/events?${params}`));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setEvents(data);
    } catch {
      // Silently fail on fetch errors — events will come via socket
    } finally {
      setLoading(false);
    }
  }, [limit, type, buildUrl]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  useReconnect(fetchEvents);

  // Real-time updates — prepend new events
  useEffect(() => {
    function onNewEvent(event: OrbitalEvent) {
      // If we have a type filter, only add matching events
      if (type && event.type !== type) return;

      setEvents((prev) => {
        // Prevent duplicates
        if (prev.some((e) => e.id === event.id)) return prev;
        return [event, ...prev].slice(0, limit);
      });
    }

    socket.on('event:new', onNewEvent);
    return () => {
      socket.off('event:new', onNewEvent);
    };
  }, [limit, type]);

  return { events, loading, refetch: fetchEvents };
}
