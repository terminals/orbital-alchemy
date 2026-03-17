import { useState, useCallback, useMemo } from 'react';
import { Plus, X, Terminal, AlertTriangle } from 'lucide-react';
import type { WorkflowEdge } from '../../../shared/workflow-config';

// ─── Types ──────────────────────────────────────────────

interface CommandPrefixManagerProps {
  prefixes: string[];
  edges: WorkflowEdge[];
  onChange: (prefixes: string[]) => void;
}

// ─── Component ──────────────────────────────────────────

export function CommandPrefixManager({ prefixes, edges, onChange }: CommandPrefixManagerProps) {
  const [newPrefix, setNewPrefix] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Cross-reference: which edges use commands starting with each prefix
  const prefixUsage = useMemo(() => {
    const usage = new Map<string, string[]>();
    for (const prefix of prefixes) {
      const matching = edges
        .filter((e) => e.command?.startsWith(prefix))
        .map((e) => `${e.from} → ${e.to}`);
      usage.set(prefix, matching);
    }
    return usage;
  }, [prefixes, edges]);

  const validate = useCallback((value: string): string | null => {
    if (!value.startsWith('/')) return 'Must start with /';
    if (!value.endsWith(' ')) return 'Must end with a space';
    if (prefixes.includes(value)) return 'Already exists';
    return null;
  }, [prefixes]);

  const handleAdd = useCallback(() => {
    const trimmed = newPrefix;
    const err = validate(trimmed);
    if (err) {
      setError(err);
      return;
    }
    onChange([...prefixes, trimmed]);
    setNewPrefix('');
    setError(null);
  }, [newPrefix, prefixes, onChange, validate]);

  const handleRemove = useCallback((prefix: string) => {
    onChange(prefixes.filter((p) => p !== prefix));
  }, [prefixes, onChange]);

  return (
    <div className="space-y-2">
      {/* Current prefixes */}
      {prefixes.length > 0 ? (
        <div className="space-y-1">
          {prefixes.map((prefix) => {
            const usage = prefixUsage.get(prefix) ?? [];
            return (
              <div key={prefix} className="group flex items-start gap-2 rounded border border-zinc-800 bg-zinc-950/30 px-2.5 py-1.5">
                <Terminal className="mt-0.5 h-3 w-3 shrink-0 text-zinc-600" />
                <div className="flex-1 min-w-0">
                  <code className="text-xs font-mono text-cyan-400">{prefix.trim()}</code>
                  {usage.length > 0 ? (
                    <p className="mt-0.5 text-[9px] text-zinc-600">
                      Used by: {usage.join(', ')}
                    </p>
                  ) : (
                    <p className="mt-0.5 text-[9px] text-zinc-700">No edges use this prefix</p>
                  )}
                </div>
                <button
                  onClick={() => handleRemove(prefix)}
                  className="rounded p-0.5 text-zinc-700 opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-[10px] text-zinc-600">No command prefixes configured.</p>
      )}

      {/* Add new prefix */}
      <div className="flex gap-1.5">
        <input
          value={newPrefix}
          onChange={(e) => { setNewPrefix(e.target.value); setError(null); }}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          className="flex-1 rounded border border-zinc-700 bg-zinc-800 px-2 py-1 font-mono text-xs text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-zinc-500"
          placeholder="/prefix "
        />
        <button
          onClick={handleAdd}
          disabled={!newPrefix}
          className="rounded bg-zinc-800 p-1.5 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200 disabled:opacity-40"
        >
          <Plus className="h-3 w-3" />
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-1.5 text-[9px] text-amber-400">
          <AlertTriangle className="h-3 w-3 shrink-0" />
          {error}
        </div>
      )}

      <p className="text-[9px] text-zinc-600">
        Prefixes must start with <code className="text-zinc-400">/</code> and end with a space
      </p>
    </div>
  );
}
