import {
  GitBranch,
  Circle,
  ArrowUpDown,
  GitFork,
  Github,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import type { GitOverview, GitHubStatus } from '@/types';

interface Props {
  overview: GitOverview;
  github: GitHubStatus | null;
}

export function GitOverviewBar({ overview, github }: Props) {
  return (
    <Card className="mb-6">
      <CardContent className="flex flex-wrap items-center gap-4 py-3">
        {/* Current branch */}
        <div className="flex items-center gap-2">
          <GitBranch className="h-4 w-4 text-primary" />
          <code className="font-mono text-sm">{overview.currentBranch}</code>
          {overview.dirty && (
            <Tooltip>
              <TooltipTrigger>
                <Circle className="h-2.5 w-2.5 fill-warning-amber text-warning-amber" />
              </TooltipTrigger>
              <TooltipContent>Uncommitted changes</TooltipContent>
            </Tooltip>
          )}
        </div>

        {/* Branching mode badge */}
        <Badge variant="outline" className="text-xs">
          {overview.branchingMode}
        </Badge>

        {/* HEAD SHA */}
        {overview.mainHead && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span>HEAD</span>
            <code className="font-mono text-xs">{overview.mainHead.sha.slice(0, 7)}</code>
            <span className="max-w-[200px] truncate">{overview.mainHead.message}</span>
          </div>
        )}

        {/* Ahead/Behind */}
        {overview.aheadBehind && (overview.aheadBehind.ahead > 0 || overview.aheadBehind.behind > 0) && (
          <div className="flex items-center gap-1 text-xs">
            <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
            {overview.aheadBehind.ahead > 0 && (
              <span className="text-bid-green">{overview.aheadBehind.ahead}↑</span>
            )}
            {overview.aheadBehind.behind > 0 && (
              <span className="text-ask-red">{overview.aheadBehind.behind}↓</span>
            )}
          </div>
        )}

        {/* Worktree / feature branch count */}
        {overview.branchingMode === 'worktree' && overview.worktreeCount > 0 && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <GitFork className="h-3 w-3" />
            <span>{overview.worktreeCount} worktree{overview.worktreeCount !== 1 ? 's' : ''}</span>
          </div>
        )}
        {overview.branchingMode === 'trunk' && overview.featureBranchCount > 0 && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <GitBranch className="h-3 w-3" />
            <span>{overview.featureBranchCount} feature branch{overview.featureBranchCount !== 1 ? 'es' : ''}</span>
          </div>
        )}

        {/* GitHub connection badge — pushed to the right */}
        <div className="ml-auto flex items-center gap-1.5">
          <Github className="h-3.5 w-3.5 text-muted-foreground" />
          {github?.connected ? (
            <Tooltip>
              <TooltipTrigger>
                <Badge variant="secondary" className="text-xs gap-1">
                  <Circle className="h-1.5 w-1.5 fill-bid-green text-bid-green" />
                  {github.repo?.fullName ?? 'Connected'}
                </Badge>
              </TooltipTrigger>
              <TooltipContent>
                {github.authUser ? `Signed in as ${github.authUser}` : 'Connected to GitHub'}
              </TooltipContent>
            </Tooltip>
          ) : (
            <Badge variant="outline" className="text-xs text-muted-foreground">
              Not connected
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
