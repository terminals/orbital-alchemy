import { useState, useCallback, useEffect } from 'react';

const STORAGE_KEY = 'cc-theme-neon-glass';
const THEME_ATTR = 'data-theme';
const THEME_VALUE = 'neon-glass';

function readPref(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function applyAttr(enabled: boolean) {
  if (enabled) {
    document.documentElement.setAttribute(THEME_ATTR, THEME_VALUE);
  } else {
    document.documentElement.removeAttribute(THEME_ATTR);
  }
}

export function useTheme() {
  const [neonGlass, setNeonGlass] = useState(readPref);

  // Sync attribute on mount and when other tabs change localStorage
  useEffect(() => {
    applyAttr(neonGlass);
  }, [neonGlass]);

  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === STORAGE_KEY) {
        const next = e.newValue === 'true';
        setNeonGlass(next);
        applyAttr(next);
      }
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const toggleNeonGlass = useCallback(() => {
    setNeonGlass((prev) => {
      const next = !prev;
      try { localStorage.setItem(STORAGE_KEY, String(next)); } catch { /* noop */ }
      applyAttr(next);
      return next;
    });
  }, []);

  return { neonGlass, toggleNeonGlass } as const;
}
