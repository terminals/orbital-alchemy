import { useState, useCallback, useMemo } from 'react';
import { X, Trash2, Check } from 'lucide-react';
import type { WorkflowList, WorkflowConfig } from '../../../shared/workflow-config';

// ─── Types ──────────────────────────────────────────────

interface ListPropertyEditorProps {
  list: WorkflowList;
  config: WorkflowConfig;
  isNew?: boolean;
  onSave: (updated: WorkflowList) => void;
  onDelete: () => void;
  onClose: () => void;
}

// ─── Color Utilities ────────────────────────────────────

function hexToHsl(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return `0 0% ${Math.round(l * 100)}%`;
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

// ─── Component ──────────────────────────────────────────

export function ListPropertyEditor({ list, config, isNew, onSave, onDelete, onClose }: ListPropertyEditorProps) {
  const [draft, setDraft] = useState<WorkflowList>(() => structuredClone(list));
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const existingGroups = useMemo(() => {
    const groups = new Set(config.lists.map((l) => l.group).filter(Boolean));
    return [...groups] as string[];
  }, [config.lists]);

  const errors = useMemo(() => {
    const errs: string[] = [];
    if (!draft.label.trim()) errs.push('Label is required');
    if (!/^[a-z0-9-]+$/.test(draft.id)) errs.push('ID must be lowercase alphanumeric + hyphens');
    if (!draft.id) errs.push('ID is required');
    // Check unique ID (skip self)
    if (config.lists.some((l) => l.id === draft.id && l.id !== list.id)) {
      errs.push('ID already exists');
    }
    // Only one entry point
    if (draft.isEntryPoint && config.lists.some((l) => l.isEntryPoint && l.id !== list.id)) {
      errs.push('Another list is already the entry point');
    }
    return errs;
  }, [draft, config.lists, list.id]);

  const updateField = useCallback(<K extends keyof WorkflowList>(key: K, value: WorkflowList[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleHexChange = useCallback((hex: string) => {
    setDraft((prev) => ({ ...prev, hex, color: hexToHsl(hex) }));
  }, []);

  const handleSave = useCallback(() => {
    if (errors.length > 0) return;
    onSave(draft);
  }, [draft, errors, onSave]);

  return (
    <div className="flex h-full w-80 shrink-0 flex-col rounded-lg border border-cyan-500/30 bg-zinc-900/95 backdrop-blur">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded-full" style={{ backgroundColor: draft.hex }} />
          <span className="text-sm font-medium">{isNew ? 'New List' : 'Edit List'}</span>
        </div>
        <button onClick={onClose} className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Form */}
      <div className="flex-1 space-y-3 overflow-y-auto p-4 text-xs">
        {/* ID */}
        <FieldGroup label="ID">
          <input
            value={draft.id}
            onChange={(e) => updateField('id', e.target.value)}
            disabled={!isNew}
            className="w-full rounded border border-zinc-700 bg-zinc-800 px-2.5 py-1.5 font-mono text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-zinc-500 disabled:opacity-50"
            placeholder="e.g. review"
          />
        </FieldGroup>

        {/* Label */}
        <FieldGroup label="Label">
          <input
            value={draft.label}
            onChange={(e) => updateField('label', e.target.value)}
            className="w-full rounded border border-zinc-700 bg-zinc-800 px-2.5 py-1.5 text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-zinc-500"
            placeholder="e.g. Review"
          />
        </FieldGroup>

        {/* Color */}
        <FieldGroup label="Color">
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={draft.hex}
              onChange={(e) => handleHexChange(e.target.value)}
              className="h-8 w-8 cursor-pointer rounded border border-zinc-700 bg-zinc-800 p-0.5"
            />
            <input
              value={draft.hex}
              onChange={(e) => handleHexChange(e.target.value)}
              className="flex-1 rounded border border-zinc-700 bg-zinc-800 px-2.5 py-1.5 font-mono text-zinc-200 outline-none focus:border-zinc-500"
            />
          </div>
        </FieldGroup>

        {/* Order */}
        <FieldGroup label="Order">
          <input
            type="number"
            value={draft.order}
            onChange={(e) => updateField('order', parseInt(e.target.value, 10) || 0)}
            className="w-full rounded border border-zinc-700 bg-zinc-800 px-2.5 py-1.5 text-zinc-200 outline-none focus:border-zinc-500"
          />
        </FieldGroup>

        {/* Group */}
        <FieldGroup label="Group">
          <select
            value={draft.group ?? ''}
            onChange={(e) => updateField('group', e.target.value || undefined)}
            className="w-full rounded border border-zinc-700 bg-zinc-800 px-2.5 py-1.5 text-zinc-200 outline-none focus:border-zinc-500"
          >
            <option value="">None</option>
            {existingGroups.map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
        </FieldGroup>

        {/* Git Branch */}
        <FieldGroup label="Git Branch (optional)">
          <input
            value={draft.gitBranch ?? ''}
            onChange={(e) => updateField('gitBranch', e.target.value || undefined)}
            className="w-full rounded border border-zinc-700 bg-zinc-800 px-2.5 py-1.5 font-mono text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-zinc-500"
            placeholder="e.g. dev"
          />
        </FieldGroup>

        {/* Session Key */}
        <FieldGroup label="Session Key (optional)">
          <input
            value={draft.sessionKey ?? ''}
            onChange={(e) => updateField('sessionKey', e.target.value || undefined)}
            className="w-full rounded border border-zinc-700 bg-zinc-800 px-2.5 py-1.5 font-mono text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-zinc-500"
            placeholder="e.g. COMMIT_SESSION"
          />
        </FieldGroup>

        {/* Flags */}
        <FieldGroup label="Flags">
          <div className="space-y-2">
            <ToggleFlag label="Entry Point" checked={draft.isEntryPoint ?? false} onChange={(v) => updateField('isEntryPoint', v || undefined)} />
            <ToggleFlag label="Has Directory" checked={draft.hasDirectory} onChange={(v) => updateField('hasDirectory', v)} />
            <ToggleFlag label="Supports Batch" checked={draft.supportsBatch ?? false} onChange={(v) => updateField('supportsBatch', v || undefined)} />
            <ToggleFlag label="Supports Sprint" checked={draft.supportsSprint ?? false} onChange={(v) => updateField('supportsSprint', v || undefined)} />
          </div>
        </FieldGroup>

        {/* Validation errors */}
        {errors.length > 0 && (
          <div className="rounded border border-red-500/30 bg-red-500/10 p-2.5">
            {errors.map((e) => (
              <p key={e} className="text-[10px] text-red-400">{e}</p>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center gap-2 border-t border-zinc-800 px-4 py-3">
        {!isNew && (
          showDeleteConfirm ? (
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-red-400">Confirm?</span>
              <button onClick={onDelete} className="rounded bg-red-500/20 px-2 py-1 text-[10px] text-red-400 hover:bg-red-500/30">
                Delete
              </button>
              <button onClick={() => setShowDeleteConfirm(false)} className="rounded px-2 py-1 text-[10px] text-zinc-500 hover:text-zinc-300">
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="rounded p-1.5 text-zinc-600 hover:bg-red-500/10 hover:text-red-400"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )
        )}
        <div className="flex-1" />
        <button
          onClick={handleSave}
          disabled={errors.length > 0}
          className="flex items-center gap-1.5 rounded bg-cyan-600 px-3 py-1.5 text-[11px] font-medium text-white hover:bg-cyan-500 disabled:opacity-40"
        >
          <Check className="h-3 w-3" />
          Apply
        </button>
      </div>
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{label}</label>
      {children}
    </div>
  );
}

function ToggleFlag({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-3.5 w-3.5 rounded border-zinc-600 bg-zinc-800 text-cyan-500 focus:ring-0 focus:ring-offset-0"
      />
      <span className="text-zinc-300">{label}</span>
    </label>
  );
}
