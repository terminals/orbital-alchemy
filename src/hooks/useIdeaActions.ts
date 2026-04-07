import { useState, useCallback } from 'react';
import { useProjectUrl } from './useProjectUrl';

interface IdeaActionsState {
  surpriseLoading: boolean;
  handleSurprise: () => Promise<void>;
  handleApproveGhost: (slug: string) => Promise<void>;
  handleRejectGhost: (slug: string) => Promise<void>;
}

export function useIdeaActions(
  closeIdeaForm: () => void,
  setSelectedIdea: (scope: null) => void,
): IdeaActionsState {
  const buildUrl = useProjectUrl();
  const [surpriseLoading, setSurpriseLoading] = useState(false);

  const handleSurprise = useCallback(async () => {
    setSurpriseLoading(true);
    try {
      const res = await fetch(buildUrl('/ideas/surprise'), { method: 'POST' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      closeIdeaForm();
    } catch (err) {
      console.error('[Orbital] Surprise Me failed:', err);
    } finally {
      setSurpriseLoading(false);
    }
  }, [closeIdeaForm, buildUrl]);

  const handleApproveGhost = useCallback(async (slug: string) => {
    try {
      const res = await fetch(buildUrl(`/ideas/${slug}/approve`), { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSelectedIdea(null);
    } catch (err) {
      console.error('[Orbital] Failed to approve idea:', err);
    }
  }, [setSelectedIdea, buildUrl]);

  const handleRejectGhost = useCallback(async (slug: string) => {
    try {
      const res = await fetch(buildUrl(`/ideas/${slug}`), { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSelectedIdea(null);
    } catch (err) {
      console.error('[Orbital] Failed to reject idea:', err);
    }
  }, [setSelectedIdea, buildUrl]);

  return { surpriseLoading, handleSurprise, handleApproveGhost, handleRejectGhost };
}
