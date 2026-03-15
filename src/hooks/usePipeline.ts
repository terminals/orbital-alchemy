import { useEffect, useState, useCallback } from 'react';
import { socket } from '../socket';
import type { PipelineDrift, DeployFrequencyWeek, Deployment } from '../types';

export function usePipeline() {
  const [drift, setDrift] = useState<PipelineDrift | null>(null);
  const [frequency, setFrequency] = useState<DeployFrequencyWeek[]>([]);
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    try {
      const [driftRes, freqRes, deploysRes] = await Promise.all([
        fetch('/api/orbital/pipeline/drift'),
        fetch('/api/orbital/deployments/frequency'),
        fetch('/api/orbital/deployments'),
      ]);

      if (driftRes.ok) setDrift(await driftRes.json());
      if (freqRes.ok) setFrequency(await freqRes.json());
      if (deploysRes.ok) setDeployments(await deploysRes.json());
    } catch {
      // Silently fail — dashboard is non-critical
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

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
