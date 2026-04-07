import { useEffect, useState, useCallback } from 'react';
import { useProjectUrl } from './useProjectUrl';
import { socket } from '../socket';
import { useReconnect } from './useReconnect';
import type { PipelineDrift, DeployFrequencyWeek, Deployment } from '../types';

export function usePipeline() {
  const buildUrl = useProjectUrl();
  const [drift, setDrift] = useState<PipelineDrift | null>(null);
  const [frequency, setFrequency] = useState<DeployFrequencyWeek[]>([]);
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    try {
      const [driftRes, freqRes, deploysRes] = await Promise.all([
        fetch(buildUrl('/pipeline/drift')),
        fetch(buildUrl('/deployments/frequency')),
        fetch(buildUrl('/deployments')),
      ]);

      if (driftRes.ok) setDrift(await driftRes.json());
      if (freqRes.ok) setFrequency(await freqRes.json());
      if (deploysRes.ok) setDeployments(await deploysRes.json());
    } catch {
      // Silently fail — dashboard is non-critical
    } finally {
      setLoading(false);
    }
  }, [buildUrl]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  useReconnect(fetchAll);

  useEffect(() => {
    function onDeployUpdate() {
      fetchAll();
    }
    socket.on('deploy:updated', onDeployUpdate);
    return () => {
      socket.off('deploy:updated', onDeployUpdate);
    };
  }, [fetchAll]);

  return { drift, frequency, deployments, loading, refetch: fetchAll };
}
