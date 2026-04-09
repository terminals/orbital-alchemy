import { useState, useCallback, useEffect, useRef } from 'react';

/**
 * Persist state in localStorage with automatic cross-tab sync.
 *
 * @param key - localStorage key
 * @param defaultValue - fallback when key is missing or unparseable
 * @param options.serialize - custom serializer (default: JSON.stringify)
 * @param options.deserialize - custom deserializer; return `undefined` to fall back to defaultValue (default: JSON.parse)
 */
export function useLocalStorage<T>(
  key: string,
  defaultValue: T,
  options?: {
    serialize?: (value: T) => string;
    deserialize?: (raw: string) => T | undefined;
  },
): [T, (updater: T | ((prev: T) => T)) => void] {
  const serialize = options?.serialize ?? JSON.stringify;
  const deserialize = options?.deserialize ?? JSON.parse;

  const serializeRef = useRef(serialize);
  const deserializeRef = useRef(deserialize);
  serializeRef.current = serialize;
  deserializeRef.current = deserialize;

  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw !== null) {
        const parsed = deserialize(raw);
        return parsed !== undefined ? parsed : defaultValue;
      }
    } catch { /* use default */ }
    return defaultValue;
  });

  const set = useCallback((updater: T | ((prev: T) => T)) => {
    setValue((prev) => {
      const next = typeof updater === 'function'
        ? (updater as (prev: T) => T)(prev)
        : updater;
      try { localStorage.setItem(key, serializeRef.current(next)); } catch { /* noop */ }
      return next;
    });
  }, [key]);

  // Cross-tab sync via StorageEvent
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key !== key) return;
      try {
        if (e.newValue !== null) {
          const parsed = deserializeRef.current(e.newValue);
          if (parsed !== undefined) setValue(parsed);
        } else {
          setValue(defaultValue);
        }
      } catch { /* ignore corrupt data from other tabs */ }
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [key, defaultValue]);

  return [value, set];
}

/** serialize/deserialize helpers for Set<string> stored as JSON arrays. */
export const setStorage = {
  serialize: (s: Set<string>) => JSON.stringify([...s]),
  deserialize: (raw: string): Set<string> | undefined => {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? new Set(arr) : undefined;
  },
};
