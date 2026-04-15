import { useState, useEffect, useCallback } from 'react';
import { socket } from '@/socket';
import { useProjects } from './useProjectContext';
import { useReconnect } from './useReconnect';
import type {
  AggregateManifestSummary,
  ManifestFileEntry,
  ManifestValidationReport,
  UpdatePlanPreview,
} from '@/types';
import { formatActionKey } from './aggregate-manifest-utils';

export function useAggregateManifest() {
  const { getApiBase } = useProjects();

  const [summary, setSummary] = useState<AggregateManifestSummary | null>(null);
  const [expandedProjectId, setExpandedProjectId] = useState<string | null>(null);
  const [projectFiles, setProjectFiles] = useState<ManifestFileEntry[]>([]);
  const [validation, setValidation] = useState<ManifestValidationReport | null>(null);
  const [updatePreview, setUpdatePreview] = useState<UpdatePlanPreview | null>(null);
  const [updatePreviewProjectId, setUpdatePreviewProjectId] = useState<string | null>(null);
  const [diffContent, setDiffContent] = useState<string | null>(null);
  const [diffFile, setDiffFile] = useState<string | null>(null);
  const [diffFileStatus, setDiffFileStatus] = useState<ManifestFileEntry['status'] | null>(null);
  const [diffProjectId, setDiffProjectId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // ─── Fetch Aggregate Summary ──────────────────────────────

  const fetchSummary = useCallback(async () => {
    try {
      const res = await fetch('/api/orbital/aggregate/manifest/status');
      if (res.ok) {
        const json = await res.json();
        setSummary(json);
      }
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, []);

  const fetchProjectFiles = useCallback(async (projectId: string) => {
    try {
      const res = await fetch(`${getApiBase(projectId)}/manifest/files`);
      if (res.ok) {
        const json = await res.json();
        setProjectFiles(json.data ?? []);
      }
    } catch { /* silent */ }
  }, [getApiBase]);

  // Initial load
  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  useReconnect(() => {
    fetchSummary();
    if (expandedProjectId) fetchProjectFiles(expandedProjectId);
  });

  // Socket subscription — refetch on any manifest change
  useEffect(() => {
    const handler = () => {
      fetchSummary();
      if (expandedProjectId) fetchProjectFiles(expandedProjectId);
    };
    socket.on('manifest:changed', handler);
    return () => { socket.off('manifest:changed', handler); };
  }, [fetchSummary, fetchProjectFiles, expandedProjectId]);

  // ─── Drill-Down ───────────────────────────────────────────

  const expandProject = useCallback((projectId: string) => {
    if (expandedProjectId === projectId) {
      setExpandedProjectId(null);
      setProjectFiles([]);
      return;
    }
    setExpandedProjectId(projectId);
    setProjectFiles([]);
    fetchProjectFiles(projectId);
  }, [expandedProjectId, fetchProjectFiles]);

  const collapseProject = useCallback(() => {
    setExpandedProjectId(null);
    setProjectFiles([]);
  }, []);

  // ─── Actions ──────────────────────────────────────────────

  const updateAll = useCallback(async () => {
    setActionLoading(formatActionKey('update-all'));
    try {
      await fetch('/api/orbital/aggregate/manifest/update-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      await fetchSummary();
    } catch { /* silent */ }
    finally { setActionLoading(null); }
  }, [fetchSummary]);

  const previewProjectUpdate = useCallback(async (projectId: string) => {
    setActionLoading(formatActionKey('preview', projectId));
    try {
      const res = await fetch(`${getApiBase(projectId)}/manifest/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dryRun: true }),
      });
      if (res.ok) {
        const json = await res.json();
        setUpdatePreview(json.data);
        setUpdatePreviewProjectId(projectId);
      }
    } catch { /* silent */ }
    finally { setActionLoading(null); }
  }, [getApiBase]);

  const applyProjectUpdate = useCallback(async (projectId: string) => {
    setActionLoading(formatActionKey('update', projectId));
    try {
      const res = await fetch(`${getApiBase(projectId)}/manifest/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dryRun: false }),
      });
      if (res.ok) {
        setUpdatePreview(null);
        setUpdatePreviewProjectId(null);
        await fetchSummary();
      }
    } catch { /* silent */ }
    finally { setActionLoading(null); }
  }, [getApiBase, fetchSummary]);

  const initProject = useCallback(async (projectId: string) => {
    setActionLoading(formatActionKey('init', projectId));
    try {
      await fetch(`${getApiBase(projectId)}/manifest/init`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      await fetchSummary();
    } catch { /* silent */ }
    finally { setActionLoading(null); }
  }, [getApiBase, fetchSummary]);

  const validateProject = useCallback(async (projectId: string) => {
    setActionLoading(formatActionKey('validate', projectId));
    try {
      const res = await fetch(`${getApiBase(projectId)}/manifest/validate`);
      if (res.ok) {
        const json = await res.json();
        setValidation(json.data);
      }
    } catch { /* silent */ }
    finally { setActionLoading(null); }
  }, [getApiBase]);

  const pinFile = useCallback(async (projectId: string, file: string, reason?: string) => {
    setActionLoading(formatActionKey('pin', file));
    try {
      await fetch(`${getApiBase(projectId)}/manifest/pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file, reason }),
      });
    } catch { /* silent */ }
    finally { setActionLoading(null); }
  }, [getApiBase]);

  const unpinFile = useCallback(async (projectId: string, file: string) => {
    setActionLoading(formatActionKey('unpin', file));
    try {
      await fetch(`${getApiBase(projectId)}/manifest/unpin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file }),
      });
    } catch { /* silent */ }
    finally { setActionLoading(null); }
  }, [getApiBase]);

  const resetFile = useCallback(async (projectId: string, file: string) => {
    setActionLoading(formatActionKey('reset', file));
    try {
      await fetch(`${getApiBase(projectId)}/manifest/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file }),
      });
    } catch { /* silent */ }
    finally { setActionLoading(null); }
  }, [getApiBase]);

  const revertFile = useCallback(async (projectId: string, file: string) => {
    setActionLoading(formatActionKey('revert', file));
    try {
      await fetch(`${getApiBase(projectId)}/manifest/revert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file }),
      });
    } catch { /* silent */ }
    finally { setActionLoading(null); }
  }, [getApiBase]);

  const getDiff = useCallback(async (projectId: string, file: string, status?: ManifestFileEntry['status']) => {
    setActionLoading(formatActionKey('diff', file));
    setDiffFile(file);
    setDiffFileStatus(status ?? null);
    setDiffProjectId(projectId);
    try {
      const res = await fetch(`${getApiBase(projectId)}/manifest/diff?file=${encodeURIComponent(file)}`);
      if (res.ok) {
        const json = await res.json();
        setDiffContent(json.data?.diff ?? null);
      }
    } catch { /* silent */ }
    finally { setActionLoading(null); }
  }, [getApiBase]);

  const clearDiff = useCallback(() => { setDiffContent(null); setDiffFile(null); setDiffFileStatus(null); setDiffProjectId(null); }, []);
  const clearUpdatePreview = useCallback(() => { setUpdatePreview(null); setUpdatePreviewProjectId(null); }, []);
  const clearValidation = useCallback(() => setValidation(null), []);

  return {
    summary, loading, actionLoading,
    expandedProjectId, projectFiles,
    validation, updatePreview, updatePreviewProjectId,
    diffContent, diffFile, diffFileStatus, diffProjectId,
    expandProject, collapseProject,
    fetchSummary,
    updateAll,
    previewProjectUpdate, applyProjectUpdate, clearUpdatePreview,
    initProject, validateProject, clearValidation,
    pinFile, unpinFile, resetFile, revertFile,
    getDiff, clearDiff,
  };
}

// Re-export consumer-facing utils for components that inspect hook state
export {
  formatActionKey,
  parseActionKey,
  isActionLoading,
  isProjectActionLoading,
  isFileActionLoading,
  getFileStatusLabel,
  fileNeedsAttention,
  canRevertFile,
} from './aggregate-manifest-utils';
