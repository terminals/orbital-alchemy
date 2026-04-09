import { useState, useEffect } from 'react';
import { Play, ArrowRight, AlertTriangle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatScopeId } from '@/lib/utils';
import type { Sprint } from '@/types';

interface SprintPreflightModalProps {
  open: boolean;
  sprint: Sprint | null;
  graph: { layers: number[][]; edges: Array<{ from: number; to: number }> } | null;
  loading: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function SprintPreflightModal({
  open,
  sprint,
  graph,
  loading,
  onConfirm,
  onCancel,
}: SprintPreflightModalProps) {
  const [dispatching, setDispatching] = useState(false);

  useEffect(() => {
    if (open) setDispatching(false);
  }, [open]);

  if (!sprint) return null;

  const scopeMap = new Map(sprint.scopes.map((s) => [s.scope_id, s]));
  const layers = graph?.layers ?? [];
  const totalScopes = sprint.scope_ids.length;

  const handleConfirm = async () => {
    setDispatching(true);
    onConfirm();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <Play className="h-4 w-4 text-cyan-400" />
            Dispatch Sprint: {sprint.name}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {totalScopes} scope{totalScopes !== 1 ? 's' : ''} will be dispatched in{' '}
            {layers.length} layer{layers.length !== 1 ? 's' : ''} with max{' '}
            {sprint.concurrency_cap} concurrent agents.
          </DialogDescription>
        </DialogHeader>

        {/* Execution Graph */}
        <div className="my-3 space-y-3 max-h-64 overflow-y-auto">
          {layers.map((layer, idx) => (
            <div key={layer.join('-')}>
              <div className="flex items-center gap-2 mb-1">
                <Badge variant="outline" className="text-[10px]">Layer {idx}</Badge>
                {idx === 0 && <span className="text-[10px] text-cyan-400">Launches first</span>}
                {idx > 0 && (
                  <span className="text-[10px] text-muted-foreground">
                    Waits for Layer {idx - 1}
                  </span>
                )}
              </div>
              <div className="ml-4 space-y-1">
                {layer.map((scopeId) => {
                  const ss = scopeMap.get(scopeId);
                  return (
                    <div key={scopeId} className="flex items-center gap-2 text-xs">
                      <span className="font-mono text-muted-foreground w-8 shrink-0">
                        {formatScopeId(scopeId)}
                      </span>
                      <span className="truncate flex-1">{ss?.title ?? 'Unknown'}</span>
                      {ss?.effort_estimate && (
                        <span className="text-[10px] text-muted-foreground shrink-0">
                          {ss.effort_estimate}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
              {idx < layers.length - 1 && (
                <div className="flex justify-center my-1">
                  <ArrowRight className="h-3 w-3 text-muted-foreground rotate-90" />
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Warnings */}
        {layers.length === 0 && !loading && (
          <div className="flex items-center gap-2 rounded border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-400">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            Could not compute execution layers. Sprint may have issues.
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-2 border-t">
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={dispatching}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleConfirm}
            disabled={dispatching || loading || layers.length === 0}
            className="bg-cyan-600 hover:bg-cyan-700"
          >
            {dispatching ? (
              <span className="flex items-center gap-1">
                <span className="h-3 w-3 animate-spin rounded-full border border-white border-t-transparent" />
                Dispatching...
              </span>
            ) : (
              <>
                <Play className="h-3 w-3 mr-1" /> Dispatch Sprint
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
