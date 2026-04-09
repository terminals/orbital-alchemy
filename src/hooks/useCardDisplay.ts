import { useCallback } from 'react';
import type { CardDisplayConfig } from '@/types';
import { useLocalStorage } from './useLocalStorage';

const STORAGE_KEY = 'cc-card-display';

const DEFAULTS: CardDisplayConfig = {
  effort: true,
  category: true,
  priority: true,
  tags: true,
  project: true,
};

export function useCardDisplay() {
  const [display, setDisplay] = useLocalStorage<CardDisplayConfig>(STORAGE_KEY, DEFAULTS);

  const toggle = useCallback((field: keyof CardDisplayConfig) => {
    setDisplay((prev) => ({ ...prev, [field]: !prev[field] }));
  }, [setDisplay]);

  const isAllVisible = display.effort && display.category && display.priority && display.tags;
  const hiddenCount = [display.effort, display.category, display.priority, display.tags, display.project].filter((v) => !v).length;

  return { display, toggle, isAllVisible, hiddenCount } as const;
}
