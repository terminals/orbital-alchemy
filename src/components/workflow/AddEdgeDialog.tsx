import { useState, useMemo, useCallback } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, Plus } from 'lucide-react';
import type { WorkflowEdge, WorkflowConfig, EdgeDirection, ConfirmLevel } from '../../../shared/workflow-config';

// ─── Types ──────────────────────────────────────────────

interface AddEdgeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  config: WorkflowConfig;
  onAdd: (edge: WorkflowEdge) => void;
}

const DIRECTIONS: EdgeDirection[] = ['forward', 'backward', 'shortcut'];
const CONFIRM_LEVELS: ConfirmLevel[] = ['quick', 'full'];

const DIRECTION_COLORS: Record<string, string> = {
  forward: '#22c55e',
  backward: '#f59e0b',
  shortcut: '#6366f1',
};

// ─── Component ──────────────────────────────────────────

export function AddEdgeDialog({ open, onOpenChange, config, onAdd }: AddEdgeDialogProps) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [direction, setDirection] = useState<EdgeDirection>('forward');
  const [label, setLabel] = useState('');
  const [command, setCommand] = useState('');
  const [confirmLevel, setConfirmLevel] = useState<ConfirmLevel>('quick');

  const listIds = useMemo(() => config.lists.map((l) => l.id), [config.lists]);

  const errors = useMemo(() => {
    const errs: string[] = [];
    if (!from) errs.push('From is required');
    if (!to) errs.push('To is required');
    if (from && to && from === to) errs.push('From and To must be different');
    if (from && to && config.edges.some((e) => e.from === from && e.to === to)) {
      errs.push('An edge with this from:to already exists');
    }
    if (!label.trim()) errs.push('Label is required');
    return errs;
  }, [from, to, label, config.edges]);

  const resetForm = useCallback(() => {
    setFrom('');
    setTo('');
    setDirection('forward');
    setLabel('');
    setCommand('');
    setConfirmLevel('quick');
  }, []);

  const handleSubmit = useCallback(() => {
    if (errors.length > 0) return;
    const edge: WorkflowEdge = {
      from,
      to,
      direction,
      label: label.trim(),
      description: `Transition from ${from} to ${to}`,
      command: command.trim() || null,
      confirmLevel,
    };
    onAdd(edge);
    resetForm();
    onOpenChange(false);
  }, [errors, from, to, direction, label, command, confirmLevel, onAdd, resetForm, onOpenChange]);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-96 -translate-x-1/2 -translate-y-1/2 rounded-lg border border-zinc-800 bg-zinc-900 shadow-xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
            <Dialog.Title className="flex items-center gap-2 text-sm font-medium text-zinc-100">
              <Plus className="h-4 w-4 text-cyan-400" />
              Add Edge
            </Dialog.Title>
            <Dialog.Close className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300">
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>

          {/* Form */}
          <div className="space-y-4 p-5 text-xs">
            {/* From / To */}
            <div className="grid grid-cols-2 gap-3">
              <FieldGroup label="From">
                <select
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  className="w-full rounded border border-zinc-700 bg-zinc-800 px-2.5 py-2 text-zinc-200 outline-none focus:border-zinc-500"
                >
                  <option value="">Select...</option>
                  {listIds.map((id) => <option key={id} value={id}>{id}</option>)}
                </select>
              </FieldGroup>
              <FieldGroup label="To">
                <select
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  className="w-full rounded border border-zinc-700 bg-zinc-800 px-2.5 py-2 text-zinc-200 outline-none focus:border-zinc-500"
                >
                  <option value="">Select...</option>
                  {listIds.map((id) => <option key={id} value={id}>{id}</option>)}
                </select>
              </FieldGroup>
            </div>

            {/* Direction */}
            <FieldGroup label="Direction">
              <div className="flex gap-1">
                {DIRECTIONS.map((d) => {
                  const color = DIRECTION_COLORS[d];
                  return (
                    <button
                      key={d}
                      onClick={() => setDirection(d)}
                      className="flex-1 rounded px-2 py-1.5 text-[10px] font-medium uppercase transition-colors"
                      style={{
                        backgroundColor: direction === d ? `${color}20` : 'transparent',
                        color: direction === d ? color : '#71717a',
                        border: `1px solid ${direction === d ? `${color}40` : '#27272a'}`,
                      }}
                    >
                      {d}
                    </button>
                  );
                })}
              </div>
            </FieldGroup>

            {/* Label */}
            <FieldGroup label="Label">
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                className="w-full rounded border border-zinc-700 bg-zinc-800 px-2.5 py-2 text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-zinc-500"
                placeholder="e.g. Implement"
              />
            </FieldGroup>

            {/* Command */}
            <FieldGroup label="Command (optional)">
              <input
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                className="w-full rounded border border-zinc-700 bg-zinc-800 px-2.5 py-2 font-mono text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-zinc-500"
                placeholder="/scope-implement {id}"
              />
            </FieldGroup>

            {/* Confirm Level */}
            <FieldGroup label="Confirm Level">
              <div className="flex gap-1">
                {CONFIRM_LEVELS.map((cl) => (
                  <button
                    key={cl}
                    onClick={() => setConfirmLevel(cl)}
                    className="flex-1 rounded px-2 py-1.5 text-[10px] font-medium uppercase transition-colors"
                    style={{
                      backgroundColor: confirmLevel === cl ? '#22c55e20' : 'transparent',
                      color: confirmLevel === cl ? '#22c55e' : '#71717a',
                      border: `1px solid ${confirmLevel === cl ? '#22c55e40' : '#27272a'}`,
                    }}
                  >
                    {cl}
                  </button>
                ))}
              </div>
            </FieldGroup>

            {/* Errors */}
            {errors.length > 0 && from.length > 0 && to.length > 0 && (
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
              Add Edge
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
