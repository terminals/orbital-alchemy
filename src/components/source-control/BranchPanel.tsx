import { useState } from 'react';
import { GitBranch, GitFork, ArrowRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { BranchList } from './BranchList';
import { WorktreeList } from './WorktreeList';
import type { BranchInfoData, WorktreeDetail, DriftPair } from '@/types';
import { cn } from '@/lib/utils';

interface Props {
  branches: BranchInfoData[];
  worktrees: WorktreeDetail[];
  drift: DriftPair[];
  branchingMode: 'trunk' | 'worktree';
}

type PanelTab = 'branches' | 'worktrees';

function driftColor(count: number): string {
  if (count === 0) return 'text-bid-green';
  if (count <= 5) return 'text-accent-blue';
  if (count <= 20) return 'text-warning-amber';
  return 'text-ask-red';
}

export function BranchPanel({ branches, worktrees, drift, branchingMode }: Props) {
  const showWorktrees = branchingMode === 'worktree';
  const [tab, setTab] = useState<PanelTab>('branches');

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <GitBranch className="h-4 w-4 text-primary" />
            {showWorktrees ? (tab === 'branches' ? 'Branches' : 'Worktrees') : 'Branches'}
            <Badge variant="secondary">
              {tab === 'branches' ? branches.filter(b => !b.isRemote).length : worktrees.length}
            </Badge>
          </CardTitle>
          {showWorktrees && (
            <div className="flex gap-1">
              <button
                onClick={() => setTab('branches')}
                className={cn(
                  'rounded-md px-2.5 py-1 text-xs transition-colors',
                  tab === 'branches'
                    ? 'bg-surface-light text-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <GitBranch className="inline h-3 w-3 mr-1" />
                Branches
              </button>
              <button
                onClick={() => setTab('worktrees')}
                className={cn(
                  'rounded-md px-2.5 py-1 text-xs transition-colors',
                  tab === 'worktrees'
                    ? 'bg-surface-light text-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <GitFork className="inline h-3 w-3 mr-1" />
                Worktrees
              </button>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="max-h-[400px]">
          {tab === 'branches' ? (
            <BranchList branches={branches} />
          ) : (
            <WorktreeList worktrees={worktrees} />
          )}
        </ScrollArea>

        {/* Drift indicators */}
        {drift.length > 0 && (
          <div className="mt-4 border-t border-border pt-3">
            <h4 className="mb-2 text-xs font-medium text-muted-foreground">Branch Drift</h4>
            <div className="space-y-1.5">
              {drift.map(d => (
                <div key={`${d.from}-${d.to}`} className="flex items-center gap-2 text-xs">
                  <code className="font-mono text-muted-foreground">{d.from}</code>
                  <ArrowRight className="h-3 w-3 text-muted-foreground/50" />
                  <code className="font-mono text-muted-foreground">{d.to}</code>
                  <Badge
                    variant="outline"
                    className={cn('ml-auto text-xs', driftColor(d.count))}
                  >
                    {d.count === 0 ? 'in sync' : `${d.count} commit${d.count !== 1 ? 's' : ''}`}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
