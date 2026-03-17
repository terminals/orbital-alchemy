import { useState, useEffect, useCallback } from 'react';
import { ChevronDown, Download, Save, Trash2, AlertTriangle, ArrowRight, FolderInput, Plus, Minus } from 'lucide-react';

interface PresetInfo {
  name: string;
  isDefault: boolean;
}

interface OrphanedScope {
  listId: string;
  scopeFiles: string[];
}

interface MigrationPlan {
  valid: boolean;
  validationErrors: string[];
  removedLists: string[];
  addedLists: string[];
  dirsToCreate: string[];
  dirsToRemove: string[];
  orphanedScopes: OrphanedScope[];
  lostEdges: Array<{ from: string; to: string }>;
  suggestedMappings: Record<string, string>;
  impactSummary: string;
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

  // Confirmation dialog state
  const [confirm, setConfirm] = useState<{
    presetName: string;
    config: unknown;
    plan: MigrationPlan;
    mappings: Record<string, string>;
    newListIds: string[];
  } | null>(null);
  const [applying, setApplying] = useState(false);

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
      // Step 1: Fetch the preset config
      const presetRes = await fetch(`/api/orbital/workflow/presets/${encodeURIComponent(name)}`);
      if (!presetRes.ok) return;
      const presetJson: { success: boolean; data: unknown } = await presetRes.json();
      if (!presetJson.success) return;

      // Step 2: Preview the migration impact
      const previewRes = await fetch('/api/orbital/workflow/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(presetJson.data),
      });
      if (!previewRes.ok) return;
      const previewJson: { success: boolean; data: MigrationPlan } = await previewRes.json();
      if (!previewJson.success) return;

      const plan = previewJson.data;

      // If no impact at all, apply directly
      if (plan.removedLists.length === 0 && plan.addedLists.length === 0 && plan.orphanedScopes.length === 0) {
        await applyConfig(presetJson.data, {});
        return;
      }

      // Extract list IDs from the new config for the mapping dropdowns
      const configObj = presetJson.data as { lists?: Array<{ id: string }> };
      const newListIds = (configObj.lists ?? []).map((l) => l.id);

      // Step 3: Show confirmation dialog with the plan
      setConfirm({
        presetName: name,
        config: presetJson.data,
        plan,
        mappings: { ...plan.suggestedMappings },
        newListIds,
      });
      setOpen(false);
    } catch {
      // Silent fail — user can retry
    }
  };

  const applyConfig = async (config: unknown, orphanMappings: Record<string, string>) => {
    setApplying(true);
    try {
      await fetch('/api/orbital/workflow/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config, orphanMappings }),
      });
      setConfirm(null);
      setOpen(false);
    } catch {
      // Silent fail
    } finally {
      setApplying(false);
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

      {/* Confirmation Dialog */}
      {confirm && (
        <ConfirmationDialog
          presetName={confirm.presetName}
          plan={confirm.plan}
          mappings={confirm.mappings}
          newListIds={confirm.newListIds}
          applying={applying}
          onUpdateMapping={(listId, target) => {
            setConfirm((prev) =>
              prev ? { ...prev, mappings: { ...prev.mappings, [listId]: target } } : prev,
            );
          }}
          onConfirm={() => applyConfig(confirm.config, confirm.mappings)}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}

// ─── Confirmation Dialog ─────────────────────────────────────

function ConfirmationDialog({ presetName, plan, mappings, newListIds, applying, onUpdateMapping, onConfirm, onCancel }: {
  presetName: string;
  plan: MigrationPlan;
  mappings: Record<string, string>;
  newListIds: string[];
  applying: boolean;
  onUpdateMapping: (listId: string, target: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const hasOrphans = plan.orphanedScopes.length > 0;

  // Check all orphans have valid mappings
  const allMapped = plan.orphanedScopes.every(
    (o) => mappings[o.listId] && mappings[o.listId].trim().length > 0,
  );

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm" onClick={onCancel} />

      {/* Dialog */}
      <div className="fixed inset-0 z-[61] flex items-center justify-center p-4">
        <div className="w-full max-w-lg rounded-lg border border-zinc-800 bg-zinc-950 shadow-2xl" onClick={(e) => e.stopPropagation()}>
          {/* Header */}
          <div className="flex items-center gap-3 border-b border-zinc-800 px-5 py-4">
            <AlertTriangle className="h-5 w-5 text-amber-400" />
            <div>
              <h3 className="text-sm font-medium text-zinc-100">Switch to "{presetName}"?</h3>
              <p className="mt-0.5 text-xs text-zinc-500">This will change your workflow and may move scopes between lists.</p>
            </div>
          </div>

          {/* Body */}
          <div className="max-h-[60vh] overflow-y-auto px-5 py-4 space-y-4">
            {/* Lists being removed */}
            {plan.removedLists.length > 0 && (
              <div>
                <h4 className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-zinc-300">
                  <Minus className="h-3 w-3 text-red-400" />
                  Lists being removed
                </h4>
                <div className="flex flex-wrap gap-1.5">
                  {plan.removedLists.map((l) => (
                    <span key={l} className="rounded bg-red-500/10 px-2 py-0.5 text-xs text-red-300 border border-red-500/20">
                      {l}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Lists being added */}
            {plan.addedLists.length > 0 && (
              <div>
                <h4 className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-zinc-300">
                  <Plus className="h-3 w-3 text-green-400" />
                  Lists being added
                </h4>
                <div className="flex flex-wrap gap-1.5">
                  {plan.addedLists.map((l) => (
                    <span key={l} className="rounded bg-green-500/10 px-2 py-0.5 text-xs text-green-300 border border-green-500/20">
                      {l}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Orphaned scopes — where they're being moved */}
            {hasOrphans && (
              <div>
                <h4 className="mb-2 flex items-center gap-1.5 text-xs font-medium text-zinc-300">
                  <FolderInput className="h-3 w-3 text-amber-400" />
                  Scopes that need to move
                </h4>
                <p className="mb-3 text-xs text-zinc-500">
                  These scopes are in lists being removed. Choose where each group should be moved.
                </p>
                <div className="space-y-3">
                  {plan.orphanedScopes.map((orphan) => (
                    <div key={orphan.listId} className="rounded border border-zinc-800 bg-zinc-900/50 p-3">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="rounded bg-red-500/10 px-1.5 py-0.5 text-red-300 border border-red-500/20">
                          {orphan.listId}
                        </span>
                        <ArrowRight className="h-3 w-3 text-zinc-600" />
                        <select
                          value={mappings[orphan.listId] ?? ''}
                          onChange={(e) => onUpdateMapping(orphan.listId, e.target.value)}
                          className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-200 outline-none focus:border-zinc-500"
                        >
                          <option value="">Select destination...</option>
                          {newListIds.map((t) => (
                            <option key={t} value={t}>{t}</option>
                          ))}
                        </select>
                      </div>
                      <div className="mt-2 text-xxs text-zinc-500">
                        {orphan.scopeFiles.length} scope{orphan.scopeFiles.length !== 1 ? 's' : ''}:
                        {' '}
                        <span className="text-zinc-400">
                          {orphan.scopeFiles.slice(0, 5).join(', ')}
                          {orphan.scopeFiles.length > 5 && ` +${orphan.scopeFiles.length - 5} more`}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Lost edges */}
            {plan.lostEdges.length > 0 && (
              <div>
                <h4 className="mb-1.5 text-xs font-medium text-zinc-300">Transitions being removed</h4>
                <div className="space-y-1">
                  {plan.lostEdges.map((e, i) => (
                    <div key={i} className="flex items-center gap-1.5 text-xs text-zinc-500">
                      <span>{e.from}</span>
                      <ArrowRight className="h-3 w-3" />
                      <span>{e.to}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Impact summary */}
            {plan.impactSummary && (
              <div className="rounded bg-zinc-900 px-3 py-2 text-xs text-zinc-400 border border-zinc-800">
                {plan.impactSummary}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 border-t border-zinc-800 px-5 py-3">
            <button
              onClick={onCancel}
              className="rounded px-3 py-1.5 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              disabled={applying || (hasOrphans && !allMapped)}
              className="rounded bg-amber-500/20 border border-amber-500/30 px-3 py-1.5 text-xs text-amber-300 hover:bg-amber-500/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {applying ? 'Applying...' : 'Confirm Switch'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
