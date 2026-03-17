import { useState, useEffect } from 'react';
import { ArrowRight, AlertTriangle, Terminal, Check } from 'lucide-react';
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
import type { WorkflowEdge } from '../../shared/workflow-config';
import type { Scope } from '@/types';

interface DispatchModalProps {
  open: boolean;
  scope: Scope | null;
  transition: WorkflowEdge | null;
  hasActiveSession: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function DispatchModal({
  open,
  scope,
  transition,
  hasActiveSession,
  onConfirm,
  onCancel,
}: DispatchModalProps) {
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);

  const checklist = transition?.checklist ?? [];
  const allChecked = checklist.length === 0 || checked.size === checklist.length;

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setChecked(new Set());
      setLoading(false);
    }
  }, [open]);

  if (!scope || !transition) return null;

  const command = transition.command?.replace('{id}', String(scope.id)) ?? null;

  function toggleCheck(idx: number) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }

  async function handleConfirm() {
    setLoading(true);
    onConfirm();
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onCancel(); }}>
      <DialogContent className="max-w-md p-0 gap-0">
        <DialogHeader className="px-5 pt-4 pb-3">
          {/* Transition arrow */}
          <div className="flex items-center gap-2 mb-2">
            <Badge variant="outline" className="text-xxs capitalize">{transition.from}</Badge>
            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
            <Badge variant="default" className="text-xxs capitalize [color:#000]">{transition.to}</Badge>
          </div>
          <DialogTitle className="text-sm font-normal">
            {transition.label}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground mt-1">
            {transition.description}
          </DialogDescription>
        </DialogHeader>

        <div className="px-5 pb-4 space-y-3">
          {/* Scope info */}
          <div className="flex items-center gap-2 text-xs">
            <span className="font-mono text-muted-foreground">{formatScopeId(scope.id)}</span>
            <span className="font-light truncate">{scope.title}</span>
            {scope.category && (
              <Badge variant="secondary" className="ml-auto text-xxs">{scope.category}</Badge>
            )}
          </div>

          {/* Command block */}
          {command && (
            <div className="flex items-center gap-2 rounded border border-border bg-black/40 px-3 py-2">
              <Terminal className="h-3.5 w-3.5 shrink-0 text-primary" />
              <code className="text-xs font-mono text-primary">{command}</code>
            </div>
          )}

          {/* Checklist */}
          {checklist.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xxs font-medium text-muted-foreground uppercase tracking-wider">
                Pre-launch checklist
              </p>
              {checklist.map((item, idx) => (
                <button
                  key={idx}
                  onClick={() => toggleCheck(idx)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-xs text-left transition-colors',
                    checked.has(idx)
                      ? 'bg-primary/10 text-foreground'
                      : 'bg-muted/30 text-muted-foreground hover:bg-muted/50'
                  )}
                >
                  <div className={cn(
                    'flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border transition-colors',
                    checked.has(idx)
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-muted-foreground/30'
                  )}>
                    {checked.has(idx) && <Check className="h-2.5 w-2.5" />}
                  </div>
                  <span className="font-light">{item}</span>
                </button>
              ))}
            </div>
          )}

          {/* Active session warning */}
          {hasActiveSession && (
            <div className={cn(
              'flex items-start gap-2 rounded border px-3 py-2 text-xs',
              'border-warning-amber/30 bg-warning-amber/10 text-warning-amber'
            )}>
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>A CLI session is already running for this scope. Launching will start a new one.</span>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 pt-1">
            <Button
              onClick={handleConfirm}
              disabled={!allChecked || loading}
              className="flex-1"
            >
              {loading ? 'Launching...' : command ? 'Launch in iTerm' : 'Confirm Move'}
            </Button>
            <Button
              variant="ghost"
              onClick={onCancel}
              disabled={loading}
            >
              Cancel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
