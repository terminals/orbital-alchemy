import { GitFork, Circle, ArrowUp, ArrowDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { WorktreeDetail } from '@/types';

interface Props {
  worktrees: WorktreeDetail[];
}

export function WorktreeList({ worktrees }: Props) {
  if (worktrees.length === 0) {
    return (
      <div className="py-6 text-center">
        <GitFork className="mx-auto mb-2 h-8 w-8 text-muted-foreground/50" />
        <p className="text-xs text-muted-foreground">No active worktrees.</p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {worktrees.map(wt => (
        <div
          key={wt.path}
          className="rounded border border-border/50 px-3 py-2 transition-colors hover:bg-surface-light"
        >
          <div className="flex items-center gap-2">
            <GitFork className="h-3.5 w-3.5 shrink-0 text-primary" />
            <code className="min-w-0 flex-1 truncate font-mono text-xs">
              {wt.branch}
            </code>
            {wt.dirty && (
              <Circle className="h-2 w-2 shrink-0 fill-warning-amber text-warning-amber" />
            )}
            <code className="shrink-0 font-mono text-xs text-muted-foreground/60">
              {wt.head}
            </code>
          </div>

          {/* Scope info */}
          {wt.scopeId && (
            <div className="mt-1 flex items-center gap-2">
              <Badge variant="secondary" className="text-xs">
                #{wt.scopeId}
              </Badge>
              {wt.scopeTitle && (
                <span className="min-w-0 truncate text-xs text-muted-foreground">
                  {wt.scopeTitle}
                </span>
              )}
              {wt.scopeStatus && (
                <Badge variant="outline" className={cn('shrink-0 text-xs capitalize')}>
                  {wt.scopeStatus}
                </Badge>
              )}
            </div>
          )}

          {/* Ahead/behind */}
          {wt.aheadBehind && (wt.aheadBehind.ahead > 0 || wt.aheadBehind.behind > 0) && (
            <div className="mt-1 flex items-center gap-2 text-xs">
              {wt.aheadBehind.ahead > 0 && (
                <span className="flex items-center gap-0.5 text-bid-green">
                  <ArrowUp className="h-2.5 w-2.5" />
                  {wt.aheadBehind.ahead} ahead
                </span>
              )}
              {wt.aheadBehind.behind > 0 && (
                <span className="flex items-center gap-0.5 text-ask-red">
                  <ArrowDown className="h-2.5 w-2.5" />
                  {wt.aheadBehind.behind} behind
                </span>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
