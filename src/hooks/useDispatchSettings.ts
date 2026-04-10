import { useState, useEffect, useCallback, useRef } from 'react';
import type { DispatchConfig } from '../../shared/api-types';
import { DEFAULT_DISPATCH_CONFIG } from '../../shared/api-types';
import { useReconnect } from './useReconnect';

export { DEFAULT_DISPATCH_CONFIG };

export interface DispatchSettingsData extends DispatchConfig {
  terminalAdapter: string;
}

const DEFAULT_SETTINGS: DispatchSettingsData = {
  ...DEFAULT_DISPATCH_CONFIG,
  terminalAdapter: 'auto',
};

const API_PATH = '/api/orbital/aggregate/config/dispatch-settings';

export function useDispatchSettings() {
  const [settings, setSettings] = useState<DispatchSettingsData>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch(API_PATH);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { data } = await res.json();
      setSettings(data);
      setError(null);
    } catch (err) {
      console.warn('[Orbital] Dispatch settings fetch failed:', err);
      setError('Failed to load dispatch operations');
    } finally {
      setLoading(false);
    }
  }, []);

  const updateSettings = useCallback(async (updates: Partial<DispatchSettingsData>) => {
    const optimistic = { ...settingsRef.current, ...updates };
    setSettings(optimistic);
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
      setSettings(data);
    } catch (err) {
      console.warn('[Orbital] Dispatch settings update failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to save');
      fetchSettings();
    } finally {
      setSaving(false);
    }
  }, [fetchSettings]);

  const resetToDefaults = useCallback(async () => {
    setSettings(DEFAULT_SETTINGS);
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(API_PATH, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(DEFAULT_SETTINGS),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { data } = await res.json();
      setSettings(data);
    } catch (err) {
      console.warn('[Orbital] Dispatch settings reset failed:', err);
      setError('Failed to reset');
      fetchSettings();
    } finally {
      setSaving(false);
    }
  }, [fetchSettings]);

  useEffect(() => { fetchSettings(); }, [fetchSettings]);
  useReconnect(fetchSettings);

  return { settings, loading, saving, error, updateSettings, resetToDefaults };
}
