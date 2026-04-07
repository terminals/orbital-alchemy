import { useState, useCallback } from 'react';
import { useProjectUrl } from '@/hooks/useProjectUrl';
import { Github, ChevronDown, ChevronRight, Lock, Globe, LogOut } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { GitHubConnectDialog } from './GitHubConnectDialog';
import type { GitHubStatus } from '@/types';

interface Props {
  github: GitHubStatus | null;
  onConnectionChange?: () => void;
}

export function GitHubPanel({ github, onConnectionChange }: Props) {
  const buildUrl = useProjectUrl();
  const [expanded, setExpanded] = useState(true);

  const handleDisconnect = useCallback(async () => {
    try {
      await fetch(buildUrl('/github/disconnect'), { method: 'POST' });
      onConnectionChange?.();
    } catch { /* ok */ }
  }, [buildUrl, onConnectionChange]);

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
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Connect to GitHub to see repository info, pull requests, and CI status.
              </p>
              <GitHubConnectDialog
                error={github?.error ?? null}
                onConnected={() => onConnectionChange?.()}
              />
            </div>
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

              {/* Disconnect button */}
              <div className="border-t border-border pt-3">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => { e.stopPropagation(); handleDisconnect(); }}
                  className="gap-2 text-xs text-muted-foreground hover:text-ask-red"
                >
                  <LogOut className="h-3 w-3" />
                  Disconnect
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
