import { formatDistanceToNow } from 'date-fns';
import { GitPullRequest, ExternalLink } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { PullRequestInfo } from '@/types';

interface Props {
  prs: PullRequestInfo[];
}

export function PullRequestList({ prs }: Props) {
  if (prs.length === 0) {
    return (
      <div className="py-4 text-center">
        <GitPullRequest className="mx-auto mb-2 h-8 w-8 text-muted-foreground/50" />
        <p className="text-xs text-muted-foreground">No open pull requests.</p>
      </div>
    );
  }

  return (
    <div className="space-y-0.5">
      {prs.map(pr => (
        <a
          key={pr.number}
          href={pr.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 rounded px-2.5 py-1.5 transition-colors hover:bg-surface-light group"
        >
          <GitPullRequest className="h-4 w-4 shrink-0 text-bid-green" />

          <span className="shrink-0 font-mono text-xs text-muted-foreground">
            #{pr.number}
          </span>

          <span className="min-w-0 flex-1 truncate text-sm">
            {pr.title}
          </span>

          {/* Branch badges */}
          <Badge variant="outline" className="shrink-0 text-xs font-normal">
            {pr.branch}
          </Badge>
          <span className="text-xs text-muted-foreground">→</span>
          <Badge variant="outline" className="shrink-0 text-xs font-normal">
            {pr.baseBranch}
          </Badge>

          {/* Scope IDs */}
          {pr.scopeIds.map(id => (
            <Badge key={id} variant="secondary" className="shrink-0 text-xs">
              #{id}
            </Badge>
          ))}

          <span className="shrink-0 text-xs text-muted-foreground">
            {pr.author}
          </span>

          <span className="shrink-0 text-xs text-muted-foreground/60">
            {formatDistanceToNow(new Date(pr.createdAt), { addSuffix: true })}
          </span>

          <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground/40 opacity-0 group-hover:opacity-100 transition-opacity" />
        </a>
      ))}
    </div>
  );
}
