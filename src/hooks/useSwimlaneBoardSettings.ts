import { useCallback } from 'react';
import type { ViewMode, SwimGroupField } from '@/types';
import { useLocalStorage, setStorage } from './useLocalStorage';

// ─── Constants ─────────────────────────────────────────────
const VIEW_MODE_KEY = 'cc-view-mode';
const GROUP_FIELD_KEY = 'cc-swim-group';
const COLLAPSED_LANES_KEY = 'cc-swim-collapsed';

const viewModeStorage = {
  serialize: (v: ViewMode) => v,
  deserialize: (raw: string): ViewMode | undefined =>
    raw === 'kanban' || raw === 'swimlane' ? raw : undefined,
};

const groupFieldStorage = {
  serialize: (v: SwimGroupField) => v,
  deserialize: (raw: string): SwimGroupField | undefined =>
    raw === 'priority' || raw === 'category' || raw === 'tags' || raw === 'effort' || raw === 'dependencies'
      ? raw : undefined,
};

// ─── Hook ──────────────────────────────────────────────────

export function useSwimlaneBoardSettings() {
  const [viewMode, setViewMode] = useLocalStorage<ViewMode>(VIEW_MODE_KEY, 'kanban', viewModeStorage);
  const [groupField, setGroupFieldState] = useLocalStorage<SwimGroupField>(GROUP_FIELD_KEY, 'priority', groupFieldStorage);
  const [collapsedLanes, setCollapsedLanes] = useLocalStorage<Set<string>>(COLLAPSED_LANES_KEY, new Set(), setStorage);

  const setGroupField = useCallback((field: SwimGroupField) => {
    setGroupFieldState(field);
    // Reset collapsed lanes when switching group field
    setCollapsedLanes(new Set());
  }, [setGroupFieldState, setCollapsedLanes]);

  const toggleLaneCollapse = useCallback((laneValue: string) => {
    setCollapsedLanes((prev) => {
      const next = new Set(prev);
      if (next.has(laneValue)) {
        next.delete(laneValue);
      } else {
        next.add(laneValue);
      }
      return next;
    });
  }, [setCollapsedLanes]);

  return {
    viewMode,
    setViewMode,
    groupField,
    setGroupField,
    collapsedLanes,
    toggleLaneCollapse,
  } as const;
}
