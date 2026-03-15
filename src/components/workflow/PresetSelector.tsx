import { useState, useEffect, useCallback } from 'react';
import { ChevronDown, Download, Save, Trash2 } from 'lucide-react';

interface PresetInfo {
  name: string;
  isDefault: boolean;
}

interface PresetSelectorProps {
  activeConfigName: string;
}

export function PresetSelector({ activeConfigName }: PresetSelectorProps) {
  const [presets, setPresets] = useState<PresetInfo[]>([]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [showSaveInput, setShowSaveInput] = useState(false);

  const fetchPresets = useCallback(async () => {
    try {
      const res = await fetch('/api/orbital/workflow/presets');
      if (!res.ok) return;
      const json: { success: boolean; data: PresetInfo[] } = await res.json();
      if (json.success) setPresets(json.data);
    } catch {
      // Presets endpoint may not exist yet
    }
  }, []);

  useEffect(() => {
    fetchPresets();
  }, [fetchPresets]);

  const loadPreset = async (name: string) => {
    try {
      const res = await fetch(`/api/orbital/workflow/presets/${encodeURIComponent(name)}`);
      if (!res.ok) return;
      const json: { success: boolean; data: unknown } = await res.json();
      if (!json.success) return;

      await fetch('/api/orbital/workflow', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(json.data),
      });
      setOpen(false);
    } catch {
      // Silent fail — user can retry
    }
  };

  const savePreset = async () => {
    if (!saveName.trim()) return;
    setSaving(true);
    try {
      await fetch('/api/orbital/workflow/presets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: saveName.trim() }),
      });
      setSaveName('');
      setShowSaveInput(false);
      fetchPresets();
    } catch {
      // Silent fail
    } finally {
      setSaving(false);
    }
  };

  const deletePreset = async (name: string) => {
    try {
      await fetch(`/api/orbital/workflow/presets/${encodeURIComponent(name)}`, { method: 'DELETE' });
      fetchPresets();
    } catch {
      // Silent fail
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 rounded border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-300 transition-colors hover:border-zinc-700 hover:text-zinc-100"
      >
        {activeConfigName}
        <ChevronDown className="h-3.5 w-3.5 text-zinc-500" />
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />

          {/* Dropdown */}
          <div className="absolute right-0 top-full z-50 mt-1.5 w-64 rounded-lg border border-zinc-800 bg-zinc-900/95 p-2 shadow-xl backdrop-blur">
            <div className="mb-1 px-2 text-[9px] font-semibold uppercase tracking-wider text-zinc-600">
              Presets
            </div>

            {presets.length === 0 ? (
              <div className="px-2 py-3 text-center text-xs text-zinc-600">No presets saved</div>
            ) : (
              <div className="max-h-48 space-y-0.5 overflow-y-auto">
                {presets.map((p) => (
                  <div
                    key={p.name}
                    className="group flex items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-zinc-800"
                  >
                    <button onClick={() => loadPreset(p.name)} className="flex flex-1 items-center gap-2 text-left text-zinc-300">
                      <Download className="h-3 w-3 text-zinc-600" />
                      {p.name}
                      {p.isDefault && <span className="text-[9px] text-zinc-600">(default)</span>}
                    </button>
                    {!p.isDefault && (
                      <button
                        onClick={() => deletePreset(p.name)}
                        className="rounded p-0.5 text-zinc-600 opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Save as preset */}
            <div className="mt-2 border-t border-zinc-800 pt-2">
              {showSaveInput ? (
                <div className="flex gap-1.5">
                  <input
                    value={saveName}
                    onChange={(e) => setSaveName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && savePreset()}
                    placeholder="Preset name..."
                    className="flex-1 rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-200 outline-none placeholder:text-zinc-700 focus:border-zinc-600"
                    autoFocus
                  />
                  <button
                    onClick={savePreset}
                    disabled={saving || !saveName.trim()}
                    className="rounded bg-zinc-800 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-700 disabled:opacity-50"
                  >
                    Save
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowSaveInput(true)}
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                >
                  <Save className="h-3 w-3" />
                  Save current as preset
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
