import { useState, useCallback, useMemo } from 'react';
import type { WorkflowConfig, WorkflowList, WorkflowEdge } from '../../../shared/workflow-config';
import { useProjectUrl } from '@/hooks/useProjectUrl';
import { useEditHistory } from './useEditHistory';
import { validateConfig } from './validateConfig';
import type { ConfigValidationResult } from './validateConfig';

// ─── Types ──────────────────────────────────────────────

interface MigrationPlan {
  valid: boolean;
  validationErrors: string[];
  removedLists: string[];
  addedLists: string[];
  dirsToCreate: string[];
  dirsToRemove: string[];
  orphanedScopes: Array<{ listId: string; scopeFiles: string[] }>;
  lostEdges: Array<{ from: string; to: string }>;
  suggestedMappings: Record<string, string>;
  impactSummary: string;
}

interface WorkflowEditorState {
  editMode: boolean;
  editConfig: WorkflowConfig;
  canUndo: boolean;
  canRedo: boolean;
  changeCount: number;
  validation: ConfigValidationResult;
  saving: boolean;
  previewPlan: MigrationPlan | null;
  previewLoading: boolean;
  previewError: string | null;
  showPreview: boolean;
  showAddList: boolean;
  showAddEdge: boolean;
  showConfigSettings: boolean;
}

interface WorkflowEditorActions {
  enterEditMode: () => void;
  exitEditMode: () => void;
  undo: () => void;
  redo: () => void;
  updateList: (original: WorkflowList, updated: WorkflowList) => void;
  deleteList: (listId: string) => void;
  addList: (list: WorkflowList) => void;
  updateEdge: (original: WorkflowEdge, updated: WorkflowEdge) => void;
  deleteEdge: (from: string, to: string) => void;
  addEdge: (edge: WorkflowEdge) => void;
  updateConfig: (config: WorkflowConfig) => void;
  save: () => Promise<void>;
  discard: () => void;
  preview: () => Promise<void>;
  applyMigration: (orphanMappings: Record<string, string>) => Promise<void>;
  setShowPreview: (show: boolean) => void;
  setShowAddList: (show: boolean) => void;
  setShowAddEdge: (show: boolean) => void;
  setShowConfigSettings: (show: boolean) => void;
}

export type WorkflowEditor = WorkflowEditorState & WorkflowEditorActions;

// ─── Hook ───────────────────────────────────────────────

export function useWorkflowEditor(activeConfig: WorkflowConfig): WorkflowEditor {
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const buildUrl = useProjectUrl();
  const [previewPlan, setPreviewPlan] = useState<MigrationPlan | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [showAddList, setShowAddList] = useState(false);
  const [showAddEdge, setShowAddEdge] = useState(false);
  const [showConfigSettings, setShowConfigSettings] = useState(false);

  const history = useEditHistory(activeConfig);

  const validation = useMemo(
    () => validateConfig(history.present),
    [history.present],
  );

  // ─── Mode Toggle ────────────────────────────────────

  const enterEditMode = useCallback(() => {
    history.reset(activeConfig);
    setEditMode(true);
  }, [activeConfig, history]);

  const exitEditMode = useCallback(() => {
    setEditMode(false);
    setShowPreview(false);
    setShowAddList(false);
    setShowAddEdge(false);
    setShowConfigSettings(false);
  }, []);

  const discard = useCallback(() => {
    history.reset(activeConfig);
    exitEditMode();
  }, [activeConfig, history, exitEditMode]);

  // ─── List Operations ────────────────────────────────

  const addList = useCallback((list: WorkflowList) => {
    const config = structuredClone(history.present);
    config.lists.push(list);
    history.pushState(config);
  }, [history]);

  const updateList = useCallback((original: WorkflowList, updated: WorkflowList) => {
    const config = structuredClone(history.present);
    const idx = config.lists.findIndex((l) => l.id === original.id);
    if (idx === -1) return;
    // If ID changed, update all edge references
    if (original.id !== updated.id) {
      for (const edge of config.edges) {
        if (edge.from === original.id) edge.from = updated.id;
        if (edge.to === original.id) edge.to = updated.id;
      }
    }
    config.lists[idx] = updated;
    history.pushState(config);
  }, [history]);

  const deleteList = useCallback((listId: string) => {
    const config = structuredClone(history.present);
    config.lists = config.lists.filter((l) => l.id !== listId);
    config.edges = config.edges.filter((e) => e.from !== listId && e.to !== listId);
    history.pushState(config);
  }, [history]);

  // ─── Edge Operations ────────────────────────────────

  const addEdge = useCallback((edge: WorkflowEdge) => {
    const config = structuredClone(history.present);
    config.edges.push(edge);
    history.pushState(config);
  }, [history]);

  const updateConfig = useCallback((updated: WorkflowConfig) => {
    history.pushState(structuredClone(updated));
  }, [history]);

  const updateEdge = useCallback((original: WorkflowEdge, updated: WorkflowEdge) => {
    const config = structuredClone(history.present);
    const key = `${original.from}:${original.to}`;
    const idx = config.edges.findIndex((e) => `${e.from}:${e.to}` === key);
    if (idx === -1) return;
    config.edges[idx] = updated;
    history.pushState(config);
  }, [history]);

  const deleteEdge = useCallback((from: string, to: string) => {
    const config = structuredClone(history.present);
    config.edges = config.edges.filter((e) => !(e.from === from && e.to === to));
    history.pushState(config);
  }, [history]);

  // ─── Save ───────────────────────────────────────────

  const save = useCallback(async () => {
    if (!validation.valid || saving) return;
    setSaving(true);
    try {
      const res = await fetch(buildUrl('/workflow'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(history.present),
      });
      const json: { success: boolean; error?: string } = await res.json();
      if (!json.success) throw new Error(json.error ?? 'Save failed');
      exitEditMode();
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }, [validation.valid, saving, history.present, exitEditMode, buildUrl]);

  // ─── Preview ────────────────────────────────────────

  const preview = useCallback(async () => {
    setPreviewLoading(true);
    setPreviewError(null);
    setPreviewPlan(null);
    setShowPreview(true);
    try {
      const res = await fetch(buildUrl('/workflow/preview'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(history.present),
      });
      const json: { success: boolean; data?: MigrationPlan; error?: string } = await res.json();
      if (!json.success) throw new Error(json.error ?? 'Preview failed');
      setPreviewPlan(json.data ?? null);
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : 'Preview failed');
    } finally {
      setPreviewLoading(false);
    }
  }, [history.present, buildUrl]);

  // ─── Apply Migration ────────────────────────────────

  const applyMigration = useCallback(async (orphanMappings: Record<string, string>) => {
    setSaving(true);
    try {
      const res = await fetch(buildUrl('/workflow/apply'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: history.present, orphanMappings }),
      });
      const json: { success: boolean; error?: string } = await res.json();
      if (!json.success) throw new Error(json.error ?? 'Migration failed');
      setShowPreview(false);
      exitEditMode();
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : 'Migration failed');
    } finally {
      setSaving(false);
    }
  }, [history.present, exitEditMode, buildUrl]);

  return {
    // State
    editMode,
    editConfig: history.present,
    canUndo: history.canUndo,
    canRedo: history.canRedo,
    changeCount: history.changeCount,
    validation,
    saving,
    previewPlan,
    previewLoading,
    previewError,
    showPreview,
    showAddList,
    showAddEdge,
    showConfigSettings,
    // Actions
    enterEditMode,
    exitEditMode,
    undo: history.undo,
    redo: history.redo,
    updateList,
    deleteList,
    addList,
    updateEdge,
    deleteEdge,
    addEdge,
    updateConfig,
    save,
    discard,
    preview,
    applyMigration,
    setShowPreview,
    setShowAddList,
    setShowAddEdge,
    setShowConfigSettings,
  };
}
