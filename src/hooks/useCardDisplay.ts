import { useState, useCallback, useEffect } from 'react';
import type { CardDisplayConfig } from '@/types';

const STORAGE_KEY = 'cc-card-display';

const DEFAULTS: CardDisplayConfig = {
  effort: true,
  category: true,
  priority: true,
  tags: true,
  project: true,
};

function readPref(): CardDisplayConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return DEFAULTS;
    const obj = parsed as Record<string, unknown>;
    return {
      effort: typeof obj.effort === 'boolean' ? obj.effort : true,
      category: typeof obj.category === 'boolean' ? obj.category : true,
      priority: typeof obj.priority === 'boolean' ? obj.priority : true,
      tags: typeof obj.tags === 'boolean' ? obj.tags : true,
      project: typeof obj.project === 'boolean' ? obj.project : true,
    };
  } catch {
    return DEFAULTS;
  }
}

export function useCardDisplay() {
  const [display, setDisplay] = useState<CardDisplayConfig>(readPref);

  // Cross-tab sync via storage event
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === STORAGE_KEY) {
        setDisplay(readPref());
      }
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const toggle = useCallback((field: keyof CardDisplayConfig) => {
    setDisplay((prev) => {
      const next = { ...prev, [field]: !prev[field] };
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* noop */ }
      return next;
    });
  }, []);

  const isAllVisible = display.effort && display.category && display.priority && display.tags;
  const hiddenCount = [display.effort, display.category, display.priority, display.tags, display.project].filter((v) => !v).length;

  return { display, toggle, isAllVisible, hiddenCount } as const;
}
