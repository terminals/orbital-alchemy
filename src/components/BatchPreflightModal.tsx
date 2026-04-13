import { useState, useEffect } from 'react';
import { ArrowRight, Terminal } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn, formatScopeId } from '@/lib/utils';
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
  const targetStatus = engine.getBatchTargetStatus(batch.target_column);
  const edge = targetStatus ? engine.findEdge(batch.target_column, targetStatus) : undefined;
  const batchCommand = engine.getBatchCommand(batch.target_column) ?? null;

  const handleConfirm = () => {
    setDispatching(true);
    onConfirm(mergeMode);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-md p-0 gap-0">
        <DialogHeader className="px-5 pt-4 pb-3">
          {/* Transition arrow */}
          {targetStatus && (
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="outline" className="text-xxs capitalize">{batch.target_column}</Badge>
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
              <Badge variant="default" className="text-xxs capitalize [color:#000]">{targetStatus}</Badge>
            </div>
          )}
          <DialogTitle className="text-sm font-normal">
            {edge?.label ?? 'Dispatch Batch'}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground mt-1">
            {edge?.description ?? 'Dispatch all scopes in this batch'} — {totalScopes} scope{totalScopes !== 1 ? 's' : ''}
          </DialogDescription>
        </DialogHeader>

        <div className="px-5 pb-4 space-y-3">
          {/* Scope list */}
          <div className="max-h-48 overflow-y-auto space-y-1 rounded border border-border bg-surface/30 px-3 py-2">
            {batch.scopes.map((ss) => (
              <div key={ss.scope_id} className="flex items-center gap-2 text-xs">
                <span className="font-mono text-muted-foreground w-8 shrink-0">
                  {formatScopeId(ss.scope_id)}
                </span>
                <span className="truncate flex-1 font-light">{ss.title}</span>
              </div>
            ))}
          </div>

          {/* Command preview */}
          {batchCommand && (
            <div className="flex items-center gap-2 rounded border border-border bg-surface/30 px-3 py-2">
              <Terminal className="h-3.5 w-3.5 shrink-0 text-primary" />
              <code className="text-xs font-mono text-primary">{batchCommand}</code>
            </div>
          )}

          {/* Merge mode selector */}
          <div className="space-y-1.5">
            <p className="text-xxs font-medium text-muted-foreground uppercase tracking-wider">
              Merge Mode
            </p>
            <div className="flex gap-2">
              {['push', 'pr', 'direct'].map((mode) => (
                <button
                  key={mode}
                  onClick={() => setMergeMode(mode)}
                  className={cn(
                    'rounded px-2.5 py-1.5 text-xs transition-colors',
                    mergeMode === mode
                      ? 'bg-primary/10 text-foreground border border-primary/30'
                      : 'bg-muted/30 text-muted-foreground hover:bg-muted/50'
                  )}
                >
                  {mode === 'push' ? 'Push' : mode === 'pr' ? 'PR' : 'Direct Merge'}
                </button>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 pt-1">
            <Button
              onClick={handleConfirm}
              disabled={dispatching || totalScopes === 0}
              className="flex-1"
            >
              {dispatching ? 'Dispatching...' : batchCommand ? 'Launch in iTerm' : 'Dispatch'}
            </Button>
            <Button
              variant="ghost"
              onClick={onCancel}
              disabled={dispatching}
            >
              Cancel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
