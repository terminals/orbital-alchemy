import { useState, useEffect } from 'react';
import { Play, Package } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { formatScopeId } from '@/lib/utils';
import { useWorkflow } from '@/hooks/useWorkflow';
import type { Sprint } from '@/types';

interface BatchPreflightModalProps {
  open: boolean;
  batch: Sprint | null;
  onConfirm: (mergeMode?: string) => void;
  onCancel: () => void;
}

export function BatchPreflightModal({ open, batch, onConfirm, onCancel }: BatchPreflightModalProps) {
  const { engine } = useWorkflow();
  const [dispatching, setDispatching] = useState(false);
  const [mergeMode, setMergeMode] = useState<string>('push');

  useEffect(() => {
    if (open) setDispatching(false);
  }, [open]);

  if (!batch) return null;

  const totalScopes = batch.scope_ids.length;
  // Get the batch target edge to derive the action description
  const targetStatus = engine.getBatchTargetStatus(batch.target_column);
  const edge = targetStatus ? engine.findEdge(batch.target_column, targetStatus) : undefined;
  const action = edge?.description ?? 'Will dispatch this batch';

  const handleConfirm = () => {
    setDispatching(true);
    onConfirm(mergeMode);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="sm:max-w-md p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-4 pt-3 pb-2">
          <DialogTitle className="flex items-center gap-2 text-sm">
            <Package className="h-4 w-4 text-amber-400" />
            Dispatch Batch: {batch.name}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {action} ({totalScopes} scope{totalScopes !== 1 ? 's' : ''})
          </DialogDescription>
        </DialogHeader>

        {/* Scope list */}
        <div className="max-h-48 overflow-y-auto space-y-1 bg-[#0a0a12] px-4 py-3">
          {batch.scopes.map((ss) => (
            <div key={ss.scope_id} className="flex items-center gap-2 text-xs">
              <span className="font-mono text-muted-foreground w-8 shrink-0">
                {formatScopeId(ss.scope_id)}
              </span>
              <span className="truncate flex-1">{ss.title}</span>
            </div>
          ))}
        </div>

        {/* Merge mode selector */}
        <div className="px-4 py-2 border-t border-border/50 space-y-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Merge Mode</span>
          <div className="flex gap-2">
            {['push', 'pr', 'direct'].map((mode) => (
              <button
                key={mode}
                onClick={() => setMergeMode(mode)}
                className={`rounded px-2 py-1 text-xs transition-colors ${
                  mergeMode === mode
                    ? 'bg-cyan-600/80 text-black'
                    : 'bg-muted text-muted-foreground hover:bg-accent'
                }`}
              >
                {mode === 'push' ? 'Push' : mode === 'pr' ? 'PR' : 'Direct Merge'}
              </button>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 px-4 py-2 border-t border-border/50">
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={dispatching}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleConfirm}
            disabled={dispatching || totalScopes === 0}
            className="bg-cyan-600/80 hover:bg-cyan-500/80 transition-colors"
          >
            {dispatching ? (
              <span className="flex items-center gap-1">
                <span className="h-3 w-3 animate-spin rounded-full border border-white border-t-transparent" />
                Dispatching...
              </span>
            ) : (
              <>
                <Play className="h-3 w-3 mr-1" /> Dispatch
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
