import { useState, useCallback, useMemo } from 'react';
import { X, Settings, AlertTriangle } from 'lucide-react';
import type { WorkflowConfig } from '../../../shared/workflow-config';
import { CommandPrefixManager } from './CommandPrefixManager';

// ─── Types ──────────────────────────────────────────────

interface ConfigSettingsPanelProps {
  config: WorkflowConfig;
  onUpdate: (config: WorkflowConfig) => void;
  onClose: () => void;
}

// ─── Component ──────────────────────────────────────────

export function ConfigSettingsPanel({ config, onUpdate, onClose }: ConfigSettingsPanelProps) {
  const [name, setName] = useState(config.name);
  const [description, setDescription] = useState(config.description ?? '');
  const [commitPatterns, setCommitPatterns] = useState(config.commitBranchPatterns ?? '');
  const [branchingMode, setBranchingMode] = useState<'trunk' | 'worktree'>(config.branchingMode ?? 'trunk');

  const allListIds = useMemo(() => config.lists.map((l) => l.id), [config.lists]);
  const [terminalStatuses, setTerminalStatuses] = useState<Set<string>>(
    new Set(config.terminalStatuses ?? []),
  );

  const regexError = useMemo(() => {
    if (!commitPatterns) return null;
    try {
      new RegExp(commitPatterns);
      return null;
    } catch {
      return 'Invalid regex pattern';
    }
  }, [commitPatterns]);

  const toggleTerminal = useCallback((listId: string) => {
    setTerminalStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(listId)) next.delete(listId);
      else next.add(listId);
      return next;
    });
  }, []);

  const handlePrefixChange = useCallback((prefixes: string[]) => {
    onUpdate({ ...config, allowedCommandPrefixes: prefixes });
  }, [config, onUpdate]);

  const handleApply = useCallback(() => {
    onUpdate({
      ...config,
      name: name.trim() || config.name,
      description: description.trim() || undefined,
      branchingMode,
      terminalStatuses: [...terminalStatuses],
      commitBranchPatterns: commitPatterns || undefined,
    });
  }, [config, name, description, branchingMode, terminalStatuses, commitPatterns, onUpdate]);

  return (
    <div className="flex h-full w-80 shrink-0 flex-col rounded-lg border border-zinc-700 bg-zinc-900/95 backdrop-blur">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
        <div className="flex items-center gap-2">
          <Settings className="h-3.5 w-3.5 text-zinc-400" />
          <span className="text-sm font-medium">Config Settings</span>
        </div>
        <button onClick={onClose} className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Form */}
      <div className="flex-1 space-y-4 overflow-y-auto p-4 text-xs">
        {/* Name */}
        <FieldGroup label="Config Name">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded border border-zinc-700 bg-zinc-800 px-2.5 py-1.5 text-zinc-200 outline-none focus:border-zinc-500"
          />
        </FieldGroup>

        {/* Description */}
        <FieldGroup label="Description">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="w-full resize-none rounded border border-zinc-700 bg-zinc-800 px-2.5 py-1.5 text-zinc-200 outline-none focus:border-zinc-500"
            placeholder="Optional config description..."
          />
        </FieldGroup>

        {/* Branching Mode */}
        <FieldGroup label="Branching Mode">
          <div className="flex gap-2">
            {(['trunk', 'worktree'] as const).map((mode) => (
              <label key={mode} className="flex flex-1 cursor-pointer items-center gap-2 rounded border border-zinc-800 bg-zinc-950/30 px-2 py-1.5">
                <input
                  type="radio"
                  name="branchingMode"
                  value={mode}
                  checked={branchingMode === mode}
                  onChange={() => setBranchingMode(mode)}
                  className="h-3.5 w-3.5 border-zinc-600 bg-zinc-800 text-cyan-500 focus:ring-0 focus:ring-offset-0"
                />
                <span className="text-zinc-300 capitalize">{mode}</span>
              </label>
            ))}
          </div>
          <p className="mt-1 text-[9px] text-zinc-600">
            Trunk: all work on current branch. Worktree: git worktree per scope for isolation.
          </p>
        </FieldGroup>

        {/* Command Prefixes */}
        <FieldGroup label="Allowed Command Prefixes">
          <CommandPrefixManager
            prefixes={config.allowedCommandPrefixes ?? []}
            edges={config.edges}
            onChange={handlePrefixChange}
          />
        </FieldGroup>

        {/* Terminal Statuses */}
        <FieldGroup label="Terminal Statuses">
          <div className="space-y-1">
            {allListIds.map((id) => (
              <label key={id} className="flex cursor-pointer items-center gap-2 rounded border border-zinc-800 bg-zinc-950/30 px-2 py-1.5">
                <input
                  type="checkbox"
                  checked={terminalStatuses.has(id)}
                  onChange={() => toggleTerminal(id)}
                  className="h-3.5 w-3.5 rounded border-zinc-600 bg-zinc-800 text-cyan-500 focus:ring-0 focus:ring-offset-0"
                />
                <span className="text-zinc-300">{id}</span>
              </label>
            ))}
          </div>
          <p className="mt-1 text-[9px] text-zinc-600">
            Terminal statuses mark a scope as &quot;done&quot; — no further progression expected.
          </p>
        </FieldGroup>

        {/* Commit Branch Patterns */}
        <FieldGroup label="Commit Branch Patterns">
          <input
            value={commitPatterns}
            onChange={(e) => setCommitPatterns(e.target.value)}
            className="w-full rounded border border-zinc-700 bg-zinc-800 px-2.5 py-1.5 font-mono text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-zinc-500"
            placeholder="^(dev|feat/|fix/|scope/)"
          />
          {regexError && (
            <div className="mt-1 flex items-center gap-1.5 text-[9px] text-amber-400">
              <AlertTriangle className="h-3 w-3 shrink-0" />
              {regexError}
            </div>
          )}
          <p className="mt-1 text-[9px] text-zinc-600">
            Regex pattern for branches that should trigger commit-session hooks.
          </p>
        </FieldGroup>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-end border-t border-zinc-800 px-4 py-3">
        <button
          onClick={handleApply}
          className="rounded bg-cyan-600 px-3 py-1.5 text-[11px] font-medium text-white hover:bg-cyan-500"
        >
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
      <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{label}</label>
      {children}
    </div>
  );
}
