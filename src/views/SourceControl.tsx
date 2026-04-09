import { useState } from 'react';
import { GitFork, ChevronDown, ChevronRight, Rocket } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { useSourceControl } from '@/hooks/useSourceControl';
import { useAggregateSourceControl } from '@/hooks/useAggregateSourceControl';
import { usePipeline } from '@/hooks/usePipeline';
import { useProjects } from '@/hooks/useProjectContext';
import { ProjectTabBar } from '@/components/ProjectTabBar';
import { GitOverviewBar } from '@/components/source-control/GitOverviewBar';
import { CommitLog } from '@/components/source-control/CommitLog';
import { BranchPanel } from '@/components/source-control/BranchPanel';
import { GitHubPanel } from '@/components/source-control/GitHubPanel';
import { PRReviewQueue } from '@/components/source-control/PRReviewQueue';
import { RepoOverviewCards } from '@/components/source-control/RepoOverviewCards';
import { BranchHealthSummary } from '@/components/source-control/BranchHealthSummary';
import { RepoHealthScore } from '@/components/source-control/RepoHealthScore';
import { DeployHistory } from '@/components/DeployHistory';

export function SourceControl() {
  const { activeProjectId, hasMultipleProjects } = useProjects();
  const isAllProjects = hasMultipleProjects && activeProjectId === null;

  const sourceControl = useSourceControl();
  const aggregate = useAggregateSourceControl(isAllProjects);
  const { deployments } = usePipeline();
  const [deployExpanded, setDeployExpanded] = useState(true);

  const loading = isAllProjects ? aggregate.loading : sourceControl.loading;

  if (loading) {
    return (
      <div className="flex flex-1 min-h-0 flex-col">
        <ProjectTabBar />
        <div className="flex h-64 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 min-h-0 flex-col">
      <ProjectTabBar />

      <div className="flex-1 min-h-0 overflow-y-auto">
        {isAllProjects ? (
          <AggregateView aggregate={aggregate} />
        ) : (
          <PerProjectView
            sourceControl={sourceControl}
            deployments={deployments}
            deployExpanded={deployExpanded}
            setDeployExpanded={setDeployExpanded}
          />
        )}
      </div>
    </div>
  );
}

// ─── Per-Project View ──────────────────────────────────────

function PerProjectView({
  sourceControl,
  deployments,
  deployExpanded,
  setDeployExpanded,
}: {
  sourceControl: ReturnType<typeof useSourceControl>;
  deployments: ReturnType<typeof usePipeline>['deployments'];
  deployExpanded: boolean;
  setDeployExpanded: (v: boolean) => void;
}) {
  const { overview, commits, branches, worktrees, github, drift, loadMoreCommits, hasMoreCommits, health, activity, refetch } = sourceControl;

  return (
    <>
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <GitFork className="h-4 w-4 text-primary" />
        <h1 className="text-xl font-light">Repo</h1>
        {overview && (
          <Badge variant="secondary">
            {overview.currentBranch}
          </Badge>
        )}
      </div>

      {/* Git Overview Bar + Health Score */}
      {overview && <GitOverviewBar overview={overview} github={github} activity={activity} />}
      {health && <RepoHealthScore health={health} />}

      {/* PR Review Queue */}
      {github?.connected && <PRReviewQueue buildUrl={sourceControl.buildUrl} />}

      {/* Commit Log + Branch Panel */}
      <div className="grid gap-6 lg:grid-cols-3">
        <CommitLog
          commits={commits}
          branches={branches}
          hasMore={hasMoreCommits}
          onLoadMore={loadMoreCommits}
        />
        <BranchPanel
          branches={branches}
          worktrees={worktrees}
          drift={drift}
          branchingMode={overview?.branchingMode ?? 'trunk'}
        />
      </div>

      {/* GitHub Panel */}
      <GitHubPanel github={github} onConnectionChange={refetch} />

      {/* Deploy History */}
      {deployments.length > 0 && (
        <div className="mt-6">
          {!deployExpanded ? (
            <Card
              className="cursor-pointer select-none"
              onClick={() => setDeployExpanded(true)}
            >
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  <Rocket className="h-4 w-4 text-primary" />
                  Deploy History
                  <Badge variant="secondary">{deployments.length}</Badge>
                </CardTitle>
              </CardHeader>
            </Card>
          ) : (
            <div>
              <button
                onClick={() => setDeployExpanded(false)}
                className="mb-2 flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <ChevronDown className="h-4 w-4" />
                <Rocket className="h-4 w-4" />
                Deploy History
              </button>
              <DeployHistory deployments={deployments} />
            </div>
          )}
        </div>
      )}
    </>
  );
}

// ─── Aggregate View (All Projects) ─────────────────────────

function AggregateView({ aggregate }: { aggregate: ReturnType<typeof useAggregateSourceControl> }) {
  const { projectOverviews, commits, prs, branchHealth, activitySeries } = aggregate;

  return (
    <>
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <GitFork className="h-4 w-4 text-primary" />
        <h1 className="text-xl font-light">Repo</h1>
        <Badge variant="secondary">All Projects</Badge>
      </div>

      {/* Per-project overview cards */}
      <RepoOverviewCards overviews={projectOverviews} activitySeries={activitySeries} />

      {/* Cross-project PR queue */}
      {prs.length > 0 && <PRReviewQueue prs={prs} isAggregate />}

      {/* Cross-project commit log */}
      <div className="grid gap-6 lg:grid-cols-3">
        <CommitLog
          commits={commits}
          branches={[]}
          hasMore={false}
          onLoadMore={() => {}}
        />
        <BranchHealthSummary health={branchHealth} />
      </div>
    </>
  );
}
