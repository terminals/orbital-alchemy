import { useState } from 'react';
import { resolveDrift } from '@/hooks/useSyncState';

interface DriftResolutionDialogProps {
  projectId: string;
  relativePath: string;
  onResolved: () => void;
  onCancel: () => void;
}

export function DriftResolutionDialog({
  projectId,
  relativePath,
  onResolved,
  onCancel,
}: DriftResolutionDialogProps) {
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleResolve(resolution: 'pin-override' | 'reset-global') {
    setResolving(true);
    setError(null);
    try {
      const ok = await resolveDrift(projectId, relativePath, resolution);
      if (ok) {
        onResolved();
      } else {
        setError('Failed to resolve drift. Please try again.');
      }
    } catch {
      setError('Failed to resolve drift. Please try again.');
    } finally {
      setResolving(false);
    }
  }

  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 space-y-3">
      <h4 className="text-sm font-medium text-amber-400">Drift Detected</h4>
      <p className="text-xs text-muted-foreground font-mono">{relativePath}</p>
      <p className="text-xs text-muted-foreground">
        This file was synced with global but has been modified outside the dashboard.
      </p>

      {error && (
        <p className="text-xs text-destructive">{error}</p>
      )}

      <div className="flex gap-2 pt-2">
        <button
          onClick={() => handleResolve('reset-global')}
          disabled={resolving}
          className="rounded border border-border bg-muted px-3 py-1.5 text-xs hover:bg-muted/80 transition-colors disabled:opacity-50"
        >
          {resolving ? 'Resolving\u2026' : 'Reset to Global'}
        </button>
        <button
          onClick={() => handleResolve('pin-override')}
          disabled={resolving}
          className="rounded border border-blue-500/30 bg-blue-500/10 px-3 py-1.5 text-xs text-blue-400 hover:bg-blue-500/20 transition-colors disabled:opacity-50"
        >
          {resolving ? 'Resolving\u2026' : 'Pin as Override'}
        </button>
        <button
          onClick={onCancel}
          disabled={resolving}
          className="ml-auto rounded px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
        >
          Later
        </button>
      </div>
    </div>
  );
}
