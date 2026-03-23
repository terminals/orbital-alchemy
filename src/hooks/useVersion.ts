import { useEffect, useState, useCallback } from 'react';
import { socket } from '../socket';
import { useReconnect } from './useReconnect';

interface VersionInfo {
  version: string;
  commitSha: string;
  branch: string;
}

interface UpdateCheck {
  updateAvailable: boolean;
  behindCount: number;
  localSha: string;
  remoteSha: string;
  branch: string;
}

type UpdateStage = 'idle' | 'checking' | 'pulling' | 'installing' | 'done' | 'error';

interface UseVersionReturn {
  version: VersionInfo | null;
  updateAvailable: boolean;
  behindCount: number;
  updateStage: UpdateStage;
  updateError: string | null;
  loading: boolean;
  checkForUpdate: () => Promise<void>;
  performUpdate: () => Promise<void>;
}

export function useVersion(): UseVersionReturn {
  const [version, setVersion] = useState<VersionInfo | null>(null);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [behindCount, setBehindCount] = useState(0);
  const [updateStage, setUpdateStage] = useState<UpdateStage>('idle');
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchVersionInfo = useCallback(async () => {
    try {
      const res = await fetch('/api/orbital/version');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: VersionInfo = await res.json();
      setVersion(data);
    } catch {
      // Version endpoint unavailable — badge will show fallback
    } finally {
      setLoading(false);
    }
  }, []);

  const doCheckForUpdate = useCallback(async () => {
    const res = await fetch('/api/orbital/version/check');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data: UpdateCheck = await res.json();
    setUpdateAvailable(data.updateAvailable);
    setBehindCount(data.behindCount);
  }, []);

  // Fetch current version
  useEffect(() => {
    fetchVersionInfo();
  }, []);

  useReconnect(fetchVersionInfo);

  // Poll for updates every 5 minutes
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        await doCheckForUpdate();
      } catch { /* polling failure is non-fatal */ }
    }, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, []);

  // Socket listeners for update progress
  useEffect(() => {
    function onUpdating(payload: { stage: string }) {
      setUpdateStage(payload.stage as UpdateStage);
    }
    function onUpdated(payload: { success: boolean; error?: string }) {
      if (payload.success) {
        setUpdateStage('done');
        setUpdateAvailable(false);
        setBehindCount(0);
        fetchVersionInfo();
      } else {
        setUpdateStage('error');
        setUpdateError(payload.error ?? 'Unknown error');
      }
    }

    socket.on('version:updating', onUpdating);
    socket.on('version:updated', onUpdated);
    return () => {
      socket.off('version:updating', onUpdating);
      socket.off('version:updated', onUpdated);
    };
  }, []);

  const checkForUpdate = useCallback(async () => {
    setUpdateStage('checking');
    setUpdateError(null);
    try {
      await doCheckForUpdate();
      setUpdateStage('idle');
    } catch (err) {
      setUpdateStage('error');
      setUpdateError((err as Error).message);
    }
  }, [doCheckForUpdate]);

  const performUpdate = useCallback(async () => {
    setUpdateStage('pulling');
    setUpdateError(null);
    try {
      const res = await fetch('/api/orbital/version/update', {
        method: 'POST',
        headers: { 'X-Orbital-Action': 'update' },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        setUpdateStage('error');
        setUpdateError(data.error ?? 'Update failed');
        return;
      }
      // HTTP success is authoritative — don't rely solely on socket
      const data = await res.json().catch(() => null);
      if (data?.success) {
        setUpdateStage('done');
        setUpdateAvailable(false);
        setBehindCount(0);
        fetchVersionInfo();
      }
      // Socket events still provide real-time progress during the request
    } catch (err) {
      setUpdateStage('error');
      setUpdateError((err as Error).message);
    }
  }, [fetchVersionInfo]);

  return {
    version,
    updateAvailable,
    behindCount,
    updateStage,
    updateError,
    loading,
    checkForUpdate,
    performUpdate,
  };
}
