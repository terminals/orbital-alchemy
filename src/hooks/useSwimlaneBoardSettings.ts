import { useState, useCallback, useEffect } from 'react';
import type { ViewMode, SwimGroupField } from '@/types';

// ─── Constants ─────────────────────────────────────────────
const VIEW_MODE_KEY = 'cc-view-mode';
const GROUP_FIELD_KEY = 'cc-swim-group';
const COLLAPSED_LANES_KEY = 'cc-swim-collapsed';

// ─── localStorage helpers ──────────────────────────────────

function readViewMode(): ViewMode {
  try {
    const raw = localStorage.getItem(VIEW_MODE_KEY);
    if (raw === 'kanban' || raw === 'swimlane') return raw;
  } catch { /* use default */ }
  return 'kanban';
}

function readGroupField(): SwimGroupField {
  try {
    const raw = localStorage.getItem(GROUP_FIELD_KEY);
    if (raw === 'priority' || raw === 'category' || raw === 'tags' || raw === 'effort' || raw === 'dependencies') {
      return raw;
    }
  } catch { /* use default */ }
  return 'priority';
}

function readCollapsedLanes(): Set<string> {
  try {
    const raw = localStorage.getItem(COLLAPSED_LANES_KEY);
    if (raw) {
      const arr = JSON.parse(raw) as string[];
      if (Array.isArray(arr)) return new Set(arr);
    }
  } catch { /* use default */ }
  return new Set();
}

function persistViewMode(mode: ViewMode) {
  try { localStorage.setItem(VIEW_MODE_KEY, mode); } catch { /* noop */ }
}

function persistGroupField(field: SwimGroupField) {
  try { localStorage.setItem(GROUP_FIELD_KEY, field); } catch { /* noop */ }
}

function persistCollapsedLanes(lanes: Set<string>) {
  try { localStorage.setItem(COLLAPSED_LANES_KEY, JSON.stringify([...lanes])); } catch { /* noop */ }
}

// ─── Hook ──────────────────────────────────────────────────

export function useSwimlaneBoardSettings() {
  const [viewMode, setViewModeState] = useState<ViewMode>(readViewMode);
  const [groupField, setGroupFieldState] = useState<SwimGroupField>(readGroupField);
  const [collapsedLanes, setCollapsedLanes] = useState<Set<string>>(readCollapsedLanes);

  // Cross-tab sync
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === VIEW_MODE_KEY) setViewModeState(readViewMode());
      if (e.key === GROUP_FIELD_KEY) setGroupFieldState(readGroupField());
      if (e.key === COLLAPSED_LANES_KEY) setCollapsedLanes(readCollapsedLanes());
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const setViewMode = useCallback((mode: ViewMode) => {
    setViewModeState(mode);
    persistViewMode(mode);
  }, []);

  const setGroupField = useCallback((field: SwimGroupField) => {
    setGroupFieldState(field);
    persistGroupField(field);
    // Reset collapsed lanes when switching group field
    setCollapsedLanes(new Set());
    persistCollapsedLanes(new Set());
  }, []);

  const toggleLaneCollapse = useCallback((laneValue: string) => {
    setCollapsedLanes((prev) => {
      const next = new Set(prev);
      if (next.has(laneValue)) {
        next.delete(laneValue);
      } else {
        next.add(laneValue);
      }
      persistCollapsedLanes(next);
      return next;
    });
  }, []);

  return {
    viewMode,
    setViewMode,
    groupField,
    setGroupField,
    collapsedLanes,
    toggleLaneCollapse,
  } as const;
}
