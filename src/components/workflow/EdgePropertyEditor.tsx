import { useState, useCallback, useMemo } from 'react';
import { X, Trash2, Check } from 'lucide-react';
import type { WorkflowEdge, WorkflowConfig, WorkflowHook, ConfirmLevel, EdgeDirection } from '../../../shared/workflow-config';
import { DirectionSelector } from './DirectionSelector';
import { SkillCommandBuilder } from './SkillCommandBuilder';
import { ChecklistEditor } from './ChecklistEditor';
import { DispatchConfigPanel } from './DispatchConfigPanel';
import { MovementRulesPanel } from './MovementRulesPanel';

// ─── Types ──────────────────────────────────────────────

interface EdgePropertyEditorProps {
  edge: WorkflowEdge;
  config: WorkflowConfig;
  onSave: (updated: WorkflowEdge) => void;
  onDelete: () => void;
  onClose: () => void;
}

// ─── Component ──────────────────────────────────────────

export function EdgePropertyEditor({ edge, config, onSave, onDelete, onClose }: EdgePropertyEditorProps) {
  const [draft, setDraft] = useState<WorkflowEdge>(() => structuredClone(edge));
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const listIds = useMemo(() => config.lists.map((l) => l.id), [config.lists]);
  const availableHooks = useMemo(() => config.hooks ?? [], [config.hooks]);
  const allowedPrefixes = useMemo(() => config.allowedCommandPrefixes ?? [], [config.allowedCommandPrefixes]);
  const fromLabel = useMemo(() => config.lists.find((l) => l.id === draft.from)?.label ?? draft.from, [config.lists, draft.from]);
  const toLabel = useMemo(() => config.lists.find((l) => l.id === draft.to)?.label ?? draft.to, [config.lists, draft.to]);

  const errors = useMemo(() => {
    const errs: string[] = [];
    if (!draft.from) errs.push('From is required');
    if (!draft.to) errs.push('To is required');
    if (draft.from === draft.to) errs.push('From and To must be different');
    if (!draft.label.trim()) errs.push('Label is required');
    if (!draft.description.trim()) errs.push('Description is required');
    const key = `${draft.from}:${draft.to}`;
    const origKey = `${edge.from}:${edge.to}`;
    if (key !== origKey && config.edges.some((e) => `${e.from}:${e.to}` === key)) {
      errs.push('An edge with this from:to already exists');
    }
    return errs;
  }, [draft, edge, config.edges]);

  const updateField = useCallback(<K extends keyof WorkflowEdge>(key: K, value: WorkflowEdge[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }, []);

  const toggleHook = useCallback((hookId: string) => {
    setDraft((prev) => {
      const current = prev.hooks ?? [];
      const has = current.includes(hookId);
      return { ...prev, hooks: has ? current.filter((id) => id !== hookId) : [...current, hookId] };
    });
  }, []);

  const handleSave = useCallback(() => {
    if (errors.length > 0) return;
    onSave(draft);
  }, [draft, errors, onSave]);

  return (
    <div className="flex h-full w-80 shrink-0 flex-col rounded-lg border border-blue-500/30 bg-zinc-900/95 backdrop-blur">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
        <span className="text-sm font-medium">Edit Edge</span>
        <button onClick={onClose} className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Form */}
      <div className="flex-1 space-y-3 overflow-y-auto p-4 text-xs">
        {/* From / To */}
        <div className="grid grid-cols-2 gap-2">
          <FieldGroup label="From">
            <select
              value={draft.from}
              onChange={(e) => updateField('from', e.target.value)}
              className="w-full rounded border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-zinc-200 outline-none focus:border-zinc-500"
            >
              {listIds.map((id) => <option key={id} value={id}>{id}</option>)}
            </select>
          </FieldGroup>
          <FieldGroup label="To">
            <select
              value={draft.to}
              onChange={(e) => updateField('to', e.target.value)}
              className="w-full rounded border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-zinc-200 outline-none focus:border-zinc-500"
            >
              {listIds.map((id) => <option key={id} value={id}>{id}</option>)}
            </select>
          </FieldGroup>
        </div>

        {/* Direction — rich selector */}
        <FieldGroup label="Direction">
          <DirectionSelector
            value={draft.direction}
            onChange={(d: EdgeDirection) => updateField('direction', d)}
            fromLabel={fromLabel}
            toLabel={toLabel}
          />
        </FieldGroup>

        {/* Movement Rules — informational panel */}
        <FieldGroup label="Movement Rules">
          <MovementRulesPanel edge={draft} lists={config.lists} />
        </FieldGroup>

        {/* Label */}
        <FieldGroup label="Label">
          <input
            value={draft.label}
            onChange={(e) => updateField('label', e.target.value)}
            className="w-full rounded border border-zinc-700 bg-zinc-800 px-2.5 py-1.5 text-zinc-200 outline-none focus:border-zinc-500"
          />
        </FieldGroup>

        {/* Description */}
        <FieldGroup label="Description">
          <textarea
            value={draft.description}
            onChange={(e) => updateField('description', e.target.value)}
            rows={2}
            className="w-full resize-none rounded border border-zinc-700 bg-zinc-800 px-2.5 py-1.5 text-zinc-200 outline-none focus:border-zinc-500"
          />
        </FieldGroup>

        {/* Skill Command — rich builder */}
        <FieldGroup label="Skill Command">
          <SkillCommandBuilder
            value={draft.command}
            onChange={(v: string | null) => updateField('command', v)}
            allowedPrefixes={allowedPrefixes}
          />
        </FieldGroup>

        {/* Dispatch Configuration — rich toggles */}
        <FieldGroup label="Dispatch & Confirmation">
          <DispatchConfigPanel
            dispatchOnly={draft.dispatchOnly ?? false}
            humanOnly={draft.humanOnly ?? false}
            skipServerTransition={draft.skipServerTransition ?? false}
            confirmLevel={draft.confirmLevel}
            hasCommand={draft.command !== null}
            onDispatchOnlyChange={(v: boolean) => updateField('dispatchOnly', v || undefined)}
            onHumanOnlyChange={(v: boolean) => updateField('humanOnly', v || undefined)}
            onSkipServerTransitionChange={(v: boolean) => updateField('skipServerTransition', v || undefined)}
            onConfirmLevelChange={(v: ConfirmLevel) => updateField('confirmLevel', v)}
          />
        </FieldGroup>

        {/* Checklist — drag-to-reorder editor */}
        <FieldGroup label={`Checklist (${(draft.checklist ?? []).length})`}>
          <ChecklistEditor
            items={draft.checklist ?? []}
            onChange={(items: string[]) => updateField('checklist', items.length > 0 ? items : undefined)}
            confirmLevel={draft.confirmLevel}
          />
        </FieldGroup>

        {/* Hooks */}
        {availableHooks.length > 0 && (
          <FieldGroup label={`Hooks (${(draft.hooks ?? []).length} selected)`}>
            <div className="space-y-1.5">
              {availableHooks.map((hook) => (
                <HookCheckbox
                  key={hook.id}
                  hook={hook}
                  checked={(draft.hooks ?? []).includes(hook.id)}
                  onToggle={() => toggleHook(hook.id)}
                />
              ))}
            </div>
          </FieldGroup>
        )}

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
        {showDeleteConfirm ? (
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
        )}
        <div className="flex-1" />
        <button
          onClick={handleSave}
          disabled={errors.length > 0}
          className="flex items-center gap-1.5 rounded bg-blue-600 px-3 py-1.5 text-[11px] font-medium text-white hover:bg-blue-500 disabled:opacity-40"
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

function HookCheckbox({ hook, checked, onToggle }: { hook: WorkflowHook; checked: boolean; onToggle: () => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded border border-zinc-800 bg-zinc-950/30 px-2 py-1.5">
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className="h-3.5 w-3.5 rounded border-zinc-600 bg-zinc-800 text-blue-500 focus:ring-0 focus:ring-offset-0"
      />
      <div className="flex-1">
        <span className="text-zinc-300">{hook.label}</span>
        <span className="ml-1.5 text-[9px] text-zinc-600">{hook.timing} · {hook.type}</span>
      </div>
    </label>
  );
}
