import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';

// ─── Types ───────────────────────────────────────────────

export interface Settings {
  fontFamily: string;
  fontScale: number;
  reduceMotion: boolean;
  showBackgroundEffects: boolean;
  showStatusBar: boolean;
  compactMode: boolean;
}

interface SettingsContextValue {
  settings: Settings;
  updateSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
}

// ─── Defaults ────────────────────────────────────────────

const DEFAULTS: Settings = {
  fontFamily: 'Space Grotesk',
  fontScale: 1.1,
  reduceMotion: false,
  showBackgroundEffects: true,
  showStatusBar: true,
  compactMode: false,
};

const STORAGE_KEY = 'cc-settings';

// ─── Font Catalog ────────────────────────────────────────

export const FONT_CATALOG = [
  { family: 'JetBrains Mono', category: 'monospace' as const, label: 'JetBrains Mono' },
  { family: 'Space Mono', category: 'monospace' as const, label: 'Space Mono' },
  { family: 'Fira Code', category: 'monospace' as const, label: 'Fira Code' },
  { family: 'IBM Plex Mono', category: 'monospace' as const, label: 'IBM Plex Mono' },
  { family: 'Source Code Pro', category: 'monospace' as const, label: 'Source Code Pro' },
  { family: 'Space Grotesk', category: 'sans-serif' as const, label: 'Space Grotesk' },
  { family: 'Inter', category: 'sans-serif' as const, label: 'Inter' },
  { family: 'Outfit', category: 'sans-serif' as const, label: 'Outfit' },
  { family: 'Sora', category: 'sans-serif' as const, label: 'Sora' },
  { family: 'Orbitron', category: 'display' as const, label: 'Orbitron' },
  { family: 'Exo 2', category: 'display' as const, label: 'Exo 2' },
] as const;

export type FontCategory = typeof FONT_CATALOG[number]['category'];

// ─── Font Loading ────────────────────────────────────────

const FONT_LINK_ID = 'cc-dynamic-font';
const PREVIEW_LINK_ID = 'cc-font-previews';

function loadGoogleFont(family: string): void {
  if (family === 'JetBrains Mono') {
    const existing = document.getElementById(FONT_LINK_ID);
    if (existing) existing.remove();
    return;
  }

  const encoded = family.replace(/ /g, '+');
  const href = `https://fonts.googleapis.com/css2?family=${encoded}:wght@300;400;500;600;700&display=swap`;

  let link = document.getElementById(FONT_LINK_ID) as HTMLLinkElement | null;
  if (link) {
    if (link.href === href) return;
    link.href = href;
  } else {
    link = document.createElement('link');
    link.id = FONT_LINK_ID;
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
  }
}

export function preloadFontPreviews(): void {
  if (document.getElementById(PREVIEW_LINK_ID)) return;

  const families = FONT_CATALOG
    .filter(f => f.family !== 'JetBrains Mono')
    .map(f => `family=${f.family.replace(/ /g, '+')}:wght@400`)
    .join('&');
  const href = `https://fonts.googleapis.com/css2?${families}&display=swap`;

  const link = document.createElement('link');
  link.id = PREVIEW_LINK_ID;
  link.rel = 'stylesheet';
  link.href = href;
  document.head.appendChild(link);
}

// ─── Persistence ─────────────────────────────────────────

function readSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch { /* use defaults */ }
  return { ...DEFAULTS };
}

function persistSettings(settings: Settings): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch { /* noop */ }
}

// ─── DOM Side Effects ────────────────────────────────────

function applySettingsToDOM(settings: Settings): void {
  const root = document.documentElement;

  // Font family
  const fallback = FONT_CATALOG.find(f => f.family === settings.fontFamily)?.category === 'monospace'
    ? 'monospace' : 'sans-serif';
  root.style.setProperty('--font-family', `'${settings.fontFamily}', ${fallback}`);
  loadGoogleFont(settings.fontFamily);

  // Font scale
  root.style.setProperty('--font-scale', settings.fontScale.toString());

  // Reduce motion
  if (settings.reduceMotion) {
    root.setAttribute('data-reduce-motion', 'true');
  } else {
    root.removeAttribute('data-reduce-motion');
  }

  // Compact mode
  if (settings.compactMode) {
    root.setAttribute('data-compact', 'true');
  } else {
    root.removeAttribute('data-compact');
  }
}

// ─── Context ─────────────────────────────────────────────

const SettingsContext = createContext<SettingsContextValue | null>(null);

// ─── Provider ────────────────────────────────────────────

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(readSettings);

  const updateSetting = useCallback(<K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings(prev => {
      const next = { ...prev, [key]: value };
      persistSettings(next);
      applySettingsToDOM(next);
      return next;
    });
  }, []);

  // Apply on mount
  useEffect(() => {
    applySettingsToDOM(settings);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cross-tab sync
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) {
        const next = readSettings();
        setSettings(next);
        applySettingsToDOM(next);
      }
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);

  return (
    <SettingsContext.Provider value={{ settings, updateSetting }}>
      {children}
    </SettingsContext.Provider>
  );
}

// ─── Hook ────────────────────────────────────────────────

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within a SettingsProvider');
  return ctx;
}
