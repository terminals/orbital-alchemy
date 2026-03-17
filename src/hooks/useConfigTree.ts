import { useState, useEffect, useCallback } from 'react';
import { socket } from '../socket';
import type { ConfigPrimitiveType, ConfigFileNode } from '@/types';

interface UseConfigTreeResult {
  tree: ConfigFileNode[];
  loading: boolean;
  refresh: () => void;
}

export function useConfigTree(type: ConfigPrimitiveType): UseConfigTreeResult {
  const [tree, setTree] = useState<ConfigFileNode[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTree = useCallback(async () => {
    try {
      const res = await fetch(`/api/orbital/config/${type}/tree`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setTree(json.data ?? []);
    } catch {
      setTree([]);
    } finally {
      setLoading(false);
    }
  }, [type]);

  // Initial fetch
  useEffect(() => {
    setLoading(true);
    fetchTree();
  }, [fetchTree]);

  // Subscribe to real-time changes
  useEffect(() => {
    const event = `config:${type}:changed`;
    const handler = () => {
      fetchTree();
    };
    const typedEvent = event as keyof import('@/types').ServerToClientEvents;
    socket.on(typedEvent, handler);
    return () => {
      socket.off(typedEvent, handler);
    };
  }, [type, fetchTree]);

  return { tree, loading, refresh: fetchTree };
}
