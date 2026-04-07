import { GitBranch, Circle, ArrowUpDown, GitPullRequest } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { ActivitySparkline } from './ActivitySparkline';
import type { ProjectGitOverview, ActivityDataPoint } from '@/types';

interface Props {
  overviews: ProjectGitOverview[];
  activitySeries: Map<string, ActivityDataPoint[]>;
}

export function RepoOverviewCards({ overviews, activitySeries }: Props) {
  if (overviews.length === 0) return null;

  return (
    <div className="mb-6 grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
      {overviews.map((proj) => (
        <ProjectCard
          key={proj.projectId}
          project={proj}
          activity={activitySeries.get(proj.projectId) ?? []}
        />
      ))}
    </div>
  );
}

function ProjectCard({ project, activity }: { project: ProjectGitOverview; activity: ActivityDataPoint[] }) {
  const { projectName, projectColor, status, overview, error } = project;

  return (
    <Card className="overflow-hidden">
      <CardContent className="py-4 space-y-3">
        {/* Project header */}
        <div className="flex items-center gap-2">
          <span
            className="h-2.5 w-2.5 rounded-full shrink-0"
            style={{ backgroundColor: `hsl(${projectColor})` }}
          />
          <span className="font-medium text-sm" style={{ color: `hsl(${projectColor})` }}>
            {projectName}
          </span>
          {status === 'error' && (
            <Badge variant="destructive" className="text-xs ml-auto">Error</Badge>
          )}
        </div>

        {status === 'error' ? (
          <p className="text-xs text-muted-foreground">{error}</p>
        ) : overview ? (
          <>
            {/* Branch + dirty */}
            <div className="flex items-center gap-2">
              <GitBranch className="h-3.5 w-3.5 text-muted-foreground" />
              <code className="font-mono text-xs">{overview.currentBranch}</code>
              {overview.dirty && (
                <Tooltip>
                  <TooltipTrigger>
                    <Circle className="h-2 w-2 fill-warning-amber text-warning-amber" />
                  </TooltipTrigger>
                  <TooltipContent>Uncommitted changes</TooltipContent>
                </Tooltip>
              )}
            </div>

            {/* Stats row */}
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              {/* Ahead/Behind */}
              {overview.aheadBehind && (overview.aheadBehind.ahead > 0 || overview.aheadBehind.behind > 0) && (
                <span className="flex items-center gap-1">
                  <ArrowUpDown className="h-3 w-3" />
                  {overview.aheadBehind.ahead > 0 && (
                    <span className="text-bid-green">{overview.aheadBehind.ahead}↑</span>
                  )}
                  {overview.aheadBehind.behind > 0 && (
                    <span className="text-ask-red">{overview.aheadBehind.behind}↓</span>
                  )}
                </span>
              )}

              {/* Feature branches / worktrees */}
              {overview.featureBranchCount > 0 && (
                <span>{overview.featureBranchCount} branch{overview.featureBranchCount !== 1 ? 'es' : ''}</span>
              )}

              {/* Open PRs from overview — not available here, but we show branch mode */}
              <Badge variant="outline" className="text-[10px] py-0">
                {overview.branchingMode}
              </Badge>
            </div>

            {/* Last commit */}
            {overview.mainHead && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <GitPullRequest className="h-3 w-3 shrink-0" />
                <span className="truncate max-w-[180px]">{overview.mainHead.message}</span>
                <span className="shrink-0 text-muted-foreground/60">
                  {formatDistanceToNow(new Date(overview.mainHead.date), { addSuffix: true })}
                </span>
              </div>
            )}

            {/* Sparkline */}
            {activity.length > 0 && (
              <ActivitySparkline data={activity} color={projectColor} />
            )}
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
