import { useState, useEffect } from 'react';
import { ArrowRight, AlertTriangle, Terminal } from 'lucide-react';
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
  const { engine } = useWorkflow();
  const [dispatching, setDispatching] = useState(false);

  useEffect(() => {
    if (open) setDispatching(false);
  }, [open]);

  if (!sprint) return null;

  const scopeMap = new Map(sprint.scopes.map((s) => [s.scope_id, s]));
  const layers = graph?.layers ?? [];
  const totalScopes = sprint.scope_ids.length;
  const targetStatus = engine.getBatchTargetStatus(sprint.target_column);
  const edge = targetStatus ? engine.findEdge(sprint.target_column, targetStatus) : undefined;
  const sprintCommand = engine.getBatchCommand(sprint.target_column) ?? null;

  const handleConfirm = async () => {
    setDispatching(true);
    onConfirm();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="sm:max-w-lg p-0 gap-0">
        <DialogHeader className="px-5 pt-4 pb-3">
          {/* Transition arrow */}
          {targetStatus && (
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="outline" className="text-xxs capitalize">{sprint.target_column}</Badge>
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
              <Badge variant="default" className="text-xxs capitalize [color:#000]">{targetStatus}</Badge>
            </div>
          )}
          <DialogTitle className="text-sm font-normal">
            {edge?.label ?? 'Dispatch Sprint'}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground mt-1">
            {totalScopes} scope{totalScopes !== 1 ? 's' : ''} in{' '}
            {layers.length} layer{layers.length !== 1 ? 's' : ''}, max{' '}
            {sprint.concurrency_cap} concurrent
          </DialogDescription>
        </DialogHeader>

        <div className="px-5 pb-4 space-y-3">
          {/* Command preview */}
          {sprintCommand && (
            <div className="flex items-center gap-2 rounded border border-border bg-surface/30 px-3 py-2">
              <Terminal className="h-3.5 w-3.5 shrink-0 text-primary" />
              <code className="text-xs font-mono text-primary">{sprintCommand}</code>
            </div>
          )}

          {/* Execution Graph */}
          <div className="max-h-64 overflow-y-auto space-y-3 rounded border border-border bg-surface/30 px-3 py-2">
            {layers.map((layer, idx) => (
              <div key={layer.join('-')}>
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="outline" className="text-xxs">Layer {idx}</Badge>
                  {idx === 0 && <span className="text-xxs text-primary">Launches first</span>}
                  {idx > 0 && (
                    <span className="text-xxs text-muted-foreground">
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
                        <span className="truncate flex-1 font-light">{ss?.title ?? 'Unknown'}</span>
                        {ss?.effort_estimate && (
                          <span className="text-xxs text-muted-foreground shrink-0">
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

          {/* Warning */}
          {layers.length === 0 && !loading && (
            <div className={cn(
              'flex items-start gap-2 rounded border px-3 py-2 text-xs',
              'border-warning-amber/30 bg-warning-amber/10 text-warning-amber'
            )}>
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>Could not compute execution layers. Sprint may have issues.</span>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 pt-1">
            <Button
              onClick={handleConfirm}
              disabled={dispatching || loading || layers.length === 0}
              className="flex-1"
            >
              {dispatching ? 'Dispatching...' : sprintCommand ? 'Launch in iTerm' : 'Dispatch Sprint'}
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
