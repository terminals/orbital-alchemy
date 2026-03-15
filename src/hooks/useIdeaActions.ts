import { useState, useCallback } from 'react';

interface IdeaActionsState {
  surpriseLoading: boolean;
  handleSurprise: () => Promise<void>;
  handleApproveGhost: (id: number) => Promise<void>;
  handleRejectGhost: (id: number) => Promise<void>;
}

export function useIdeaActions(
  closeIdeaForm: () => void,
  setSelectedIdea: (scope: null) => void,
): IdeaActionsState {
  const [surpriseLoading, setSurpriseLoading] = useState(false);

  const handleSurprise = useCallback(async () => {
    setSurpriseLoading(true);
    try {
      const res = await fetch('/api/orbital/ideas/surprise', { method: 'POST' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      closeIdeaForm();
    } catch {
      // Keep modal open on error — user can retry
    } finally {
      setSurpriseLoading(false);
    }
  }, [closeIdeaForm]);

  const handleApproveGhost = useCallback(async (id: number) => {
    try {
      const res = await fetch(`/api/orbital/ideas/${id}/approve`, { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } finally {
      setSelectedIdea(null);
    }
  }, [setSelectedIdea]);

  const handleRejectGhost = useCallback(async (id: number) => {
    try {
      const res = await fetch(`/api/orbital/ideas/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } finally {
      setSelectedIdea(null);
    }
  }, [setSelectedIdea]);

  return { surpriseLoading, handleSurprise, handleApproveGhost, handleRejectGhost };
}
