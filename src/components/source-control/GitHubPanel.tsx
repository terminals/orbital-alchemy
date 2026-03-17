import { useState, useEffect, useCallback } from 'react';
import { Github, ChevronDown, ChevronRight, Eye, Lock, Globe } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { GitHubSetupGuide } from './GitHubSetupGuide';
import { PullRequestList } from './PullRequestList';
import type { GitHubStatus, PullRequestInfo } from '@/types';

interface Props {
  github: GitHubStatus | null;
}

export function GitHubPanel({ github }: Props) {
  const [expanded, setExpanded] = useState(true);
  const [prs, setPrs] = useState<PullRequestInfo[]>([]);

  const fetchPRs = useCallback(async () => {
    if (!github?.connected) return;
    try {
      const res = await fetch('/api/orbital/github/prs');
      if (res.ok) setPrs(await res.json());
    } catch { /* ok */ }
  }, [github?.connected]);

  useEffect(() => {
    if (expanded && github?.connected) fetchPRs();
  }, [expanded, github?.connected, fetchPRs]);

  const VisibilityIcon = github?.repo?.visibility === 'public' ? Globe : Lock;

  return (
    <Card className="mt-6">
      <CardHeader
        className="cursor-pointer select-none"
        onClick={() => setExpanded(!expanded)}
      >
        <CardTitle className="flex items-center gap-2 text-base">
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
          <Github className="h-4 w-4 text-primary" />
          GitHub
          {github?.connected && github.repo && (
            <Badge variant="secondary" className="ml-1 text-xs gap-1">
              <VisibilityIcon className="h-2.5 w-2.5" />
              {github.repo.fullName}
            </Badge>
          )}
          {github?.openPRs ? (
            <Badge variant="outline" className="text-xs">
              {github.openPRs} open PR{github.openPRs !== 1 ? 's' : ''}
            </Badge>
          ) : null}
        </CardTitle>
      </CardHeader>

      {expanded && (
        <CardContent>
          {!github || !github.connected ? (
            <GitHubSetupGuide error={github?.error ?? null} />
          ) : (
            <div className="space-y-4">
              {/* Repo info */}
              {github.repo && (
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  <span className="text-muted-foreground">Repository</span>
                  <a
                    href={github.repo.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    {github.repo.fullName}
                  </a>

                  <span className="text-muted-foreground">Default branch</span>
                  <code className="font-mono">{github.repo.defaultBranch}</code>

                  <span className="text-muted-foreground">Visibility</span>
                  <span className="flex items-center gap-1 capitalize">
                    <VisibilityIcon className="h-3 w-3" />
                    {github.repo.visibility}
                  </span>

                  {github.authUser && (
                    <>
                      <span className="text-muted-foreground">Signed in as</span>
                      <span>{github.authUser}</span>
                    </>
                  )}
                </div>
              )}

              {/* PRs */}
              <div className="border-t border-border pt-3">
                <h4 className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <Eye className="h-3 w-3" />
                  Open Pull Requests
                </h4>
                <PullRequestList prs={prs} />
              </div>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
