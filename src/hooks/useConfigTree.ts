import { useState, useCallback, useEffect } from 'react';
import { socket } from '../socket';
import { useProjectUrl } from './useProjectUrl';
import { useFetch } from './useFetch';
import type { ConfigPrimitiveType, ConfigFileNode } from '@/types';

interface UseConfigTreeResult {
  tree: ConfigFileNode[];
  loading: boolean;
  refresh: () => void;
}

export function useConfigTree(type: ConfigPrimitiveType): UseConfigTreeResult {
  const [tree, setTree] = useState<ConfigFileNode[]>([]);
  const buildUrl = useProjectUrl();

  const fetchTree = useCallback(async () => {
    const res = await fetch(buildUrl(`/config/${type}/tree`));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    setTree(json.data ?? []);
  }, [type, buildUrl]);

  const { loading } = useFetch(fetchTree);

  // Subscribe to real-time changes
  useEffect(() => {
    const event = `config:${type}:changed`;
    const handler = () => { fetchTree(); };
    const typedEvent = event as keyof import('@/types').ServerToClientEvents;
    socket.on(typedEvent, handler);
    return () => { socket.off(typedEvent, handler); };
  }, [type, fetchTree]);

  return { tree, loading, refresh: fetchTree };
}
