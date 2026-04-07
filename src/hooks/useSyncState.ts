import { useEffect, useState, useCallback } from 'react';
import { socket } from '../socket';

// ─── Types (mirroring server sync-types) ────────────────────

export type SyncState = 'synced' | 'override' | 'drifted' | 'absent';

export interface FileSyncStatus {
  relativePath: string;
  state: SyncState;
  globalHash: string | null;
  localHash: string | null;
  overriddenAt?: string;
  reason?: string;
}

export interface SyncStateReport {
  projectId: string;
  projectPath: string;
  files: FileSyncStatus[];
  workflow: FileSyncStatus;
}

export interface GlobalSyncReport {
  files: string[];
  projects: Array<{
    projectId: string;
    projectName: string;
    states: Record<string, SyncState>;
  }>;
}

// ─── Hook: Per-Project Sync State ───────────────────────────

export function useProjectSyncState(projectId: string | null) {
  const [report, setReport] = useState<SyncStateReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch_ = useCallback(async () => {
    if (!projectId) { setReport(null); setError(null); setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/orbital/sync/state/${projectId}`);
      if (res.ok) {
        setReport(await res.json());
      } else {
        setError(`Sync state fetch failed (HTTP ${res.status})`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sync state fetch failed');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { fetch_(); }, [fetch_]);

  // Re-fetch on sync events
  useEffect(() => {
    const handler = () => fetch_();
    socket.on('sync:file:updated', handler);
    socket.on('sync:file:created', handler);
    socket.on('sync:file:deleted', handler);
    return () => {
      socket.off('sync:file:updated', handler);
      socket.off('sync:file:created', handler);
      socket.off('sync:file:deleted', handler);
    };
  }, [fetch_]);

  return { report, loading, error, refetch: fetch_ };
}

// ─── Hook: Global Sync Matrix ───────────────────────────────

export function useGlobalSyncState() {
  const [report, setReport] = useState<GlobalSyncReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch_ = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/orbital/sync/global-state');
      if (res.ok) {
        setReport(await res.json());
      } else {
        setError(`Global sync state fetch failed (HTTP ${res.status})`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Global sync state fetch failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetch_(); }, [fetch_]);

  useEffect(() => {
    const handler = () => fetch_();
    socket.on('sync:file:updated', handler);
    socket.on('sync:file:created', handler);
    socket.on('sync:file:deleted', handler);
    return () => {
      socket.off('sync:file:updated', handler);
      socket.off('sync:file:created', handler);
      socket.off('sync:file:deleted', handler);
    };
  }, [fetch_]);

  return { report, loading, error, refetch: fetch_ };
}

// ─── Sync Actions ───────────────────────────────────────────

export async function createOverride(projectId: string, relativePath: string, reason?: string): Promise<boolean> {
  const res = await fetch('/api/orbital/sync/override', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId, relativePath, reason }),
  });
  return res.ok;
}

export async function revertOverride(projectId: string, relativePath: string): Promise<boolean> {
  const res = await fetch('/api/orbital/sync/revert', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId, relativePath }),
  });
  return res.ok;
}

export async function promoteOverride(projectId: string, relativePath: string): Promise<boolean> {
  const res = await fetch('/api/orbital/sync/promote', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId, relativePath }),
  });
  return res.ok;
}

export async function resolveDrift(
  projectId: string,
  relativePath: string,
  resolution: 'pin-override' | 'reset-global',
): Promise<boolean> {
  const res = await fetch('/api/orbital/sync/resolve-drift', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId, relativePath, resolution }),
  });
  return res.ok;
}

export async function getImpactPreview(relativePath: string): Promise<{
  willUpdate: string[];
  willSkip: Array<{ id: string; reason?: string }>;
} | null> {
  const res = await fetch(`/api/orbital/sync/impact?path=${encodeURIComponent(relativePath)}`);
  if (!res.ok) return null;
  return res.json();
}
