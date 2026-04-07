import { useEffect, useState } from 'react';
import { getImpactPreview } from '@/hooks/useSyncState';

interface ImpactPreviewProps {
  relativePath: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ImpactPreview({ relativePath, onConfirm, onCancel }: ImpactPreviewProps) {
  const [impact, setImpact] = useState<{
    willUpdate: string[];
    willSkip: Array<{ id: string; reason?: string }>;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getImpactPreview(relativePath).then(data => {
      setImpact(data);
      setLoading(false);
    });
  }, [relativePath]);

  if (loading) {
    return (
      <div className="p-4 flex items-center gap-2 text-sm text-muted-foreground">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        Checking impact...
      </div>
    );
  }

  if (!impact) return null;

  return (
    <div className="rounded-lg border border-border bg-surface p-4 space-y-3">
      <h4 className="text-sm font-medium">Impact Preview</h4>
      <p className="text-xs text-muted-foreground font-mono">{relativePath}</p>

      {impact.willUpdate.length > 0 && (
        <div>
          <p className="text-xs font-medium text-emerald-400 mb-1">Will update ({impact.willUpdate.length}):</p>
          <ul className="text-xs text-muted-foreground space-y-0.5">
            {impact.willUpdate.map(id => (
              <li key={id} className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                {id}
              </li>
            ))}
          </ul>
        </div>
      )}

      {impact.willSkip.length > 0 && (
        <div>
          <p className="text-xs font-medium text-blue-400 mb-1">Will NOT update ({impact.willSkip.length}):</p>
          <ul className="text-xs text-muted-foreground space-y-0.5">
            {impact.willSkip.map(s => (
              <li key={s.id} className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                {s.id}
                {s.reason && <span className="text-muted-foreground/60">({s.reason})</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <button
          onClick={onCancel}
          className="rounded px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={onConfirm}
          className="rounded bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Save & Sync
        </button>
      </div>
    </div>
  );
}
