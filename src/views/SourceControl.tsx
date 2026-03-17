import { useState } from 'react';
import { GitFork, ChevronDown, ChevronRight, Rocket } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { useSourceControl } from '@/hooks/useSourceControl';
import { usePipeline } from '@/hooks/usePipeline';
import { GitOverviewBar } from '@/components/source-control/GitOverviewBar';
import { CommitLog } from '@/components/source-control/CommitLog';
import { BranchPanel } from '@/components/source-control/BranchPanel';
import { GitHubPanel } from '@/components/source-control/GitHubPanel';
import { DeployHistory } from '@/components/DeployHistory';

export function SourceControl() {
  const { overview, commits, branches, worktrees, github, drift, loading, loadMoreCommits, hasMoreCommits } = useSourceControl();
  const { deployments } = usePipeline();
  const [deployExpanded, setDeployExpanded] = useState(true);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
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

      {/* Section A: Git Overview Bar */}
      {overview && <GitOverviewBar overview={overview} github={github} />}

      {/* Section B + C: Commit Log + Branch Panel */}
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

      {/* Section D: GitHub Panel (collapsible) */}
      <GitHubPanel github={github} />

      {/* Section E: Deploy History (collapsible) */}
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
    </div>
  );
}
