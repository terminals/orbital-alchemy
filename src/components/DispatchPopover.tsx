import { useEffect, useRef, useState } from 'react';
import { ArrowRight, AlertTriangle, Terminal, ExternalLink } from 'lucide-react';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn, formatScopeId } from '@/lib/utils';
import type { WorkflowEdge } from '../../shared/workflow-config';
import type { Scope } from '@/types';

interface DispatchPopoverProps {
  open: boolean;
  scope: Scope | null;
  transition: WorkflowEdge | null;
  hasActiveSession: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  onViewDetails: () => void;
}

export function DispatchPopover({
  open,
  scope,
  transition,
  hasActiveSession,
  onConfirm,
  onCancel,
  onViewDetails,
}: DispatchPopoverProps) {
  const launchRef = useRef<HTMLButtonElement>(null);
  const [loading, setLoading] = useState(false);

  // Auto-focus launch button when dialog opens
  useEffect(() => {
    if (open) {
      setTimeout(() => launchRef.current?.focus(), 100);
      setLoading(false);
    }
  }, [open]);

  if (!scope || !transition) return null;

  const command = transition.command?.replace('{id}', String(scope.id)) ?? null;
  const entryPointPromotion = transition.direction === 'forward' && !transition.command && transition.from !== transition.to;
  const isIdeaPromotion = scope.status === transition.from && entryPointPromotion;
  const displayCommand = isIdeaPromotion ? '/scope-create' : command;
  const actionLabel = isIdeaPromotion ? 'Launch' : command ? 'Launch' : 'Move';

  function handleConfirm() {
    setLoading(true);
    onConfirm();
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onCancel(); }}>
      <DialogContent className="max-w-xs p-3 gap-0">
        {/* Transition arrow */}
        <div className="mb-2.5 flex items-center gap-2">
          <Badge variant="outline" className="text-xxs capitalize">{transition.from}</Badge>
          <ArrowRight className="h-3 w-3 text-muted-foreground" />
          <Badge variant="default" className="text-xxs capitalize [color:#000]">{transition.to}</Badge>
        </div>

        {/* Scope preview */}
        <div className="mb-2 text-xs text-muted-foreground">
          {isIdeaPromotion ? (
            <span className="font-light">{scope.title}</span>
          ) : (
            <>
              <span className="font-mono">{formatScopeId(scope.id)}</span>
              {' '}
              <span className="font-light">{scope.title}</span>
            </>
          )}
        </div>

        {/* Command preview */}
        {displayCommand && (
          <div className="mb-3 flex items-center gap-1.5 rounded bg-black/40 px-2 py-1.5">
            <Terminal className="h-3 w-3 shrink-0 text-primary" />
            <code className="text-xxs font-mono text-primary">{displayCommand}</code>
          </div>
        )}

        {/* Idea promotion info */}
        {isIdeaPromotion && (
          <p className="mb-3 text-xxs text-muted-foreground">
            Creates a scope document from this idea
          </p>
        )}

        {/* Active session warning */}
        {hasActiveSession && (
          <div className={cn(
            'mb-3 flex items-start gap-1.5 rounded border px-2 py-1.5 text-xxs',
            'border-warning-amber/30 bg-warning-amber/10 text-warning-amber'
          )}>
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
            <span>A CLI session is already running for this scope.</span>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2">
          <Button
            ref={launchRef}
            size="sm"
            onClick={handleConfirm}
            disabled={loading}
            className="flex-1"
          >
            {loading ? 'Launching...' : actionLabel}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={onCancel}
            disabled={loading}
          >
            Cancel
          </Button>
        </div>

        {/* View details link */}
        {(command || isIdeaPromotion) && (
          <button
            onClick={onViewDetails}
            className="mt-2 flex items-center gap-1 text-xxs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ExternalLink className="h-2.5 w-2.5" />
            View Details
          </button>
        )}
      </DialogContent>
    </Dialog>
  );
}
