import { useState, useMemo, useCallback } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, Plus } from 'lucide-react';
import type { WorkflowList, WorkflowConfig } from '../../../shared/workflow-config';

// ─── Types ──────────────────────────────────────────────

interface AddListDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  config: WorkflowConfig;
  onAdd: (list: WorkflowList) => void;
}

// ─── Color Utility ──────────────────────────────────────

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

export function AddListDialog({ open, onOpenChange, config, onAdd }: AddListDialogProps) {
  const [id, setId] = useState('');
  const [label, setLabel] = useState('');
  const [hex, setHex] = useState('#3b82f6');
  const [group, setGroup] = useState('');

  const existingGroups = useMemo(() => {
    const groups = new Set(config.lists.map((l) => l.group).filter(Boolean));
    return [...groups] as string[];
  }, [config.lists]);

  const maxOrder = useMemo(() => {
    return Math.max(0, ...config.lists.map((l) => l.order));
  }, [config.lists]);

  const errors = useMemo(() => {
    const errs: string[] = [];
    if (!id) errs.push('ID is required');
    else if (!/^[a-z0-9-]+$/.test(id)) errs.push('ID must be lowercase alphanumeric + hyphens');
    else if (config.lists.some((l) => l.id === id)) errs.push('ID already exists');
    if (!label.trim()) errs.push('Label is required');
    return errs;
  }, [id, label, config.lists]);

  const resetForm = useCallback(() => {
    setId('');
    setLabel('');
    setHex('#3b82f6');
    setGroup('');
  }, []);

  const handleSubmit = useCallback(() => {
    if (errors.length > 0) return;
    const newList: WorkflowList = {
      id,
      label: label.trim(),
      order: maxOrder + 1,
      color: hexToHsl(hex),
      hex,
      hasDirectory: true,
      ...(group ? { group } : {}),
    };
    onAdd(newList);
    resetForm();
    onOpenChange(false);
  }, [errors, id, label, hex, group, maxOrder, onAdd, resetForm, onOpenChange]);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-96 -translate-x-1/2 -translate-y-1/2 rounded-lg border border-zinc-800 bg-zinc-900 shadow-xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
            <Dialog.Title className="flex items-center gap-2 text-sm font-medium text-zinc-100">
              <Plus className="h-4 w-4 text-cyan-400" />
              Add List
            </Dialog.Title>
            <Dialog.Close className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300">
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>

          {/* Form */}
          <div className="space-y-4 p-5 text-xs">
            {/* Preview */}
            <div className="flex items-center gap-3 rounded border border-zinc-800 bg-zinc-950/50 p-3">
              <div className="h-5 w-5 rounded" style={{ backgroundColor: hex }} />
              <div>
                <p className="text-sm text-zinc-200">{label || 'New List'}</p>
                <p className="font-mono text-[10px] text-zinc-500">{id || 'list-id'}</p>
              </div>
            </div>

            {/* ID */}
            <FieldGroup label="ID">
              <input
                value={id}
                onChange={(e) => setId(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                className="w-full rounded border border-zinc-700 bg-zinc-800 px-2.5 py-2 font-mono text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-zinc-500"
                placeholder="e.g. review"
                autoFocus
              />
            </FieldGroup>

            {/* Label */}
            <FieldGroup label="Label">
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                className="w-full rounded border border-zinc-700 bg-zinc-800 px-2.5 py-2 text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-zinc-500"
                placeholder="e.g. Review"
              />
            </FieldGroup>

            {/* Color */}
            <FieldGroup label="Color">
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={hex}
                  onChange={(e) => setHex(e.target.value)}
                  className="h-8 w-8 cursor-pointer rounded border border-zinc-700 bg-zinc-800 p-0.5"
                />
                <input
                  value={hex}
                  onChange={(e) => setHex(e.target.value)}
                  className="flex-1 rounded border border-zinc-700 bg-zinc-800 px-2.5 py-2 font-mono text-zinc-200 outline-none focus:border-zinc-500"
                />
              </div>
            </FieldGroup>

            {/* Group */}
            <FieldGroup label="Group">
              <select
                value={group}
                onChange={(e) => setGroup(e.target.value)}
                className="w-full rounded border border-zinc-700 bg-zinc-800 px-2.5 py-2 text-zinc-200 outline-none focus:border-zinc-500"
              >
                <option value="">None</option>
                {existingGroups.map((g) => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
            </FieldGroup>

            {/* Errors */}
            {errors.length > 0 && id.length > 0 && (
              <div className="rounded border border-red-500/30 bg-red-500/10 p-2.5">
                {errors.map((e) => (
                  <p key={e} className="text-[10px] text-red-400">{e}</p>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 border-t border-zinc-800 px-5 py-4">
            <Dialog.Close className="rounded px-3 py-1.5 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200">
              Cancel
            </Dialog.Close>
            <button
              onClick={handleSubmit}
              disabled={errors.length > 0}
              className="flex items-center gap-1.5 rounded bg-cyan-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-cyan-500 disabled:opacity-40"
            >
              <Plus className="h-3.5 w-3.5" />
              Add List
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// ─── Sub-components ─────────────────────────────────────

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{label}</label>
      {children}
    </div>
  );
}
