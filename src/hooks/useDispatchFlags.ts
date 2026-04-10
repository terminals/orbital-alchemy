import { useState, useEffect, useCallback, useRef } from 'react';
import type { DispatchFlags } from '../../shared/api-types';
import { DEFAULT_DISPATCH_FLAGS } from '../../shared/api-types';
import { useReconnect } from './useReconnect';

export { DEFAULT_DISPATCH_FLAGS };

const API_PATH = '/api/orbital/aggregate/config/dispatch-flags';

export function useDispatchFlags() {
  const [flags, setFlags] = useState<DispatchFlags>(DEFAULT_DISPATCH_FLAGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const flagsRef = useRef(flags);
  flagsRef.current = flags;

  const fetchFlags = useCallback(async () => {
    try {
      const res = await fetch(API_PATH);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { data } = await res.json();
      setFlags(data);
      setError(null);
    } catch (err) {
      console.warn('[Orbital] Dispatch flags fetch failed:', err);
      setError('Failed to load dispatch settings');
    } finally {
      setLoading(false);
    }
  }, []);

  const updateFlags = useCallback(async (updates: Partial<DispatchFlags>) => {
    const optimistic = { ...flagsRef.current, ...updates };
    setFlags(optimistic);
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(API_PATH, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const { data } = await res.json();
      setFlags(data);
    } catch (err) {
      console.warn('[Orbital] Dispatch flags update failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to save');
      fetchFlags();
    } finally {
      setSaving(false);
    }
  }, [fetchFlags]);

  const resetToDefaults = useCallback(async () => {
    setFlags(DEFAULT_DISPATCH_FLAGS);
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(API_PATH, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(DEFAULT_DISPATCH_FLAGS),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { data } = await res.json();
      setFlags(data);
    } catch (err) {
      console.warn('[Orbital] Dispatch flags reset failed:', err);
      setError('Failed to reset');
      fetchFlags();
    } finally {
      setSaving(false);
    }
  }, [fetchFlags]);

  useEffect(() => { fetchFlags(); }, [fetchFlags]);
  useReconnect(fetchFlags);

  return { flags, loading, saving, error, updateFlags, resetToDefaults };
}
