import { formatDistanceToNow } from 'date-fns';
import { GitBranch, ArrowUp, ArrowDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { BranchInfoData } from '@/types';

interface Props {
  branches: BranchInfoData[];
}

export function BranchList({ branches }: Props) {
  // Sort: current first, then by date descending, stale at bottom
  const sorted = [...branches]
    .filter(b => !b.isRemote)
    .sort((a, b) => {
      if (a.isCurrent) return -1;
      if (b.isCurrent) return 1;
      if (a.isStale !== b.isStale) return a.isStale ? 1 : -1;
      return new Date(b.headDate).getTime() - new Date(a.headDate).getTime();
    });

  if (sorted.length === 0) {
    return (
      <div className="py-6 text-center">
        <GitBranch className="mx-auto mb-2 h-8 w-8 text-muted-foreground/50" />
        <p className="text-xs text-muted-foreground">No branches found.</p>
      </div>
    );
  }

  return (
    <div className="space-y-0.5">
      {sorted.map(branch => (
        <div
          key={branch.name}
          className={cn(
            'flex items-center gap-2 rounded px-2.5 py-1.5 transition-colors hover:bg-surface-light',
            branch.isStale && 'opacity-50',
          )}
        >
          <GitBranch className={cn(
            'h-3.5 w-3.5 shrink-0',
            branch.isCurrent ? 'text-primary' : 'text-muted-foreground',
          )} />

          <span className={cn(
            'min-w-0 flex-1 truncate font-mono text-xs',
            branch.isCurrent && 'text-foreground font-medium',
          )}>
            {branch.name}
          </span>

          {/* Scope badge */}
          {branch.scopeId && (
            <Badge variant="secondary" className="shrink-0 text-xs">
              #{branch.scopeId}
            </Badge>
          )}

          {/* Ahead/behind */}
          {branch.aheadBehind && (
            <div className="flex shrink-0 items-center gap-1 text-xs">
              {branch.aheadBehind.ahead > 0 && (
                <span className="flex items-center gap-0.5 text-bid-green">
                  <ArrowUp className="h-2.5 w-2.5" />
                  {branch.aheadBehind.ahead}
                </span>
              )}
              {branch.aheadBehind.behind > 0 && (
                <span className="flex items-center gap-0.5 text-ask-red">
                  <ArrowDown className="h-2.5 w-2.5" />
                  {branch.aheadBehind.behind}
                </span>
              )}
            </div>
          )}

          {/* SHA */}
          <code className="shrink-0 font-mono text-xs text-muted-foreground/60">
            {branch.headSha}
          </code>

          {/* Last commit time */}
          {branch.headDate && (
            <span className="shrink-0 text-xs text-muted-foreground/60">
              {formatDistanceToNow(new Date(branch.headDate), { addSuffix: true })}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
