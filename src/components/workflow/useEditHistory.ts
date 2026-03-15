import { useState, useCallback, useMemo } from 'react';
import type { WorkflowConfig } from '../../../shared/workflow-config';

// ─── Types ──────────────────────────────────────────────

interface EditHistoryState {
  past: WorkflowConfig[];
  present: WorkflowConfig;
  future: WorkflowConfig[];
}

interface EditHistoryActions {
  present: WorkflowConfig;
  canUndo: boolean;
  canRedo: boolean;
  changeCount: number;
  pushState: (config: WorkflowConfig) => void;
  undo: () => void;
  redo: () => void;
  reset: (config: WorkflowConfig) => void;
}

const MAX_HISTORY = 50;

// ─── Hook ───────────────────────────────────────────────

export function useEditHistory(initialConfig: WorkflowConfig): EditHistoryActions {
  const [state, setState] = useState<EditHistoryState>({
    past: [],
    present: structuredClone(initialConfig),
    future: [],
  });

  const pushState = useCallback((config: WorkflowConfig) => {
    setState((prev) => ({
      past: [...prev.past, prev.present].slice(-MAX_HISTORY),
      present: config,
      future: [],
    }));
  }, []);

  const undo = useCallback(() => {
    setState((prev) => {
      if (prev.past.length === 0) return prev;
      const newPast = [...prev.past];
      const previous = newPast.pop()!;
      return {
        past: newPast,
        present: previous,
        future: [prev.present, ...prev.future],
      };
    });
  }, []);

  const redo = useCallback(() => {
    setState((prev) => {
      if (prev.future.length === 0) return prev;
      const newFuture = [...prev.future];
      const next = newFuture.shift()!;
      return {
        past: [...prev.past, prev.present],
        present: next,
        future: newFuture,
      };
    });
  }, []);

  const reset = useCallback((config: WorkflowConfig) => {
    setState({
      past: [],
      present: structuredClone(config),
      future: [],
    });
  }, []);

  const changeCount = useMemo(() => state.past.length, [state.past.length]);

  return {
    present: state.present,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    changeCount,
    pushState,
    undo,
    redo,
    reset,
  };
}
