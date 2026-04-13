import { useState, useCallback } from 'react';
import { useProjectUrl } from './useProjectUrl';
import { useFetch } from './useFetch';
import { useSocketListener } from './useSocketListener';
import type { PipelineDrift, DeployFrequencyWeek, Deployment } from '../types';

export function usePipeline(enabled: boolean = true) {
  const buildUrl = useProjectUrl();
  const [drift, setDrift] = useState<PipelineDrift | null>(null);
  const [frequency, setFrequency] = useState<DeployFrequencyWeek[]>([]);
  const [deployments, setDeployments] = useState<Deployment[]>([]);

  const fetchAll = useCallback(async () => {
    if (!enabled) return;
    const [driftRes, freqRes, deploysRes] = await Promise.all([
      fetch(buildUrl('/pipeline/drift')),
      fetch(buildUrl('/deployments/frequency')),
      fetch(buildUrl('/deployments')),
    ]);

    if (driftRes.ok) setDrift(await driftRes.json());
    if (freqRes.ok) setFrequency(await freqRes.json());
    if (deploysRes.ok) setDeployments(await deploysRes.json());
  }, [buildUrl, enabled]);

  const { loading } = useFetch(fetchAll);

  useSocketListener('deploy:updated', () => { fetchAll(); }, [fetchAll]);

  return { drift, frequency, deployments, loading, refetch: fetchAll };
}
