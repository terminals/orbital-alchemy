import { useState, useEffect, useCallback } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { GitPullRequest, ExternalLink, Check, Clock, X, ChevronDown, ChevronRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ProjectBadge } from '@/components/ProjectBadge';
import { CIStatusBadge } from './CIStatusBadge';
import type { PullRequestInfo } from '@/types';

interface PropsWithFetch {
  buildUrl: (path: string) => string;
  isAggregate?: false;
  prs?: never;
}

interface PropsWithPrs {
  prs: PullRequestInfo[];
  isAggregate: true;
  buildUrl?: never;
}

type Props = PropsWithFetch | PropsWithPrs;

type ReviewFilter = 'all' | 'pending' | 'approved' | 'changes';

function ReviewIcon({ decision }: { decision?: string | null }) {
  if (decision === 'APPROVED') return <Check className="h-3.5 w-3.5 text-bid-green" />;
  if (decision === 'CHANGES_REQUESTED') return <X className="h-3.5 w-3.5 text-ask-red" />;
  return <Clock className="h-3.5 w-3.5 text-warning-amber" />;
}

export function PRReviewQueue(props: Props) {
  const [expanded, setExpanded] = useState(true);
  const [filter, setFilter] = useState<ReviewFilter>('all');
  const [fetchedPrs, setFetchedPrs] = useState<PullRequestInfo[]>([]);

  const fetchPRs = useCallback(async () => {
    if (props.isAggregate || !props.buildUrl) return;
    try {
      const res = await fetch(props.buildUrl('/github/prs'));
      if (res.ok) setFetchedPrs(await res.json());
    } catch { /* ok */ }
  }, [props.isAggregate, props.buildUrl]);

  useEffect(() => {
    if (!props.isAggregate) fetchPRs();
  }, [props.isAggregate, fetchPRs]);

  const prs = props.isAggregate ? props.prs : fetchedPrs;

  const filtered = prs.filter(pr => {
    if (filter === 'all') return true;
    if (filter === 'pending') return !pr.reviewDecision || pr.reviewDecision === 'REVIEW_REQUIRED';
    if (filter === 'approved') return pr.reviewDecision === 'APPROVED';
    if (filter === 'changes') return pr.reviewDecision === 'CHANGES_REQUESTED';
    return true;
  });

  if (prs.length === 0) return null;

  const filters: { key: ReviewFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'pending', label: 'Pending' },
    { key: 'approved', label: 'Approved' },
    { key: 'changes', label: 'Changes' },
  ];

  return (
    <Card className="mb-6">
      <CardHeader
        className="cursor-pointer select-none pb-2"
        onClick={() => setExpanded(!expanded)}
      >
        <CardTitle className="flex items-center gap-2 text-base">
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
          <GitPullRequest className="h-4 w-4 text-primary" />
          Pull Requests
          <Badge variant="secondary">{prs.length}</Badge>
        </CardTitle>
      </CardHeader>

      {expanded && (
        <CardContent>
          {/* Filter tabs */}
          <div className="mb-3 flex gap-1">
            {filters.map(f => (
              <button
                key={f.key}
                onClick={(e) => { e.stopPropagation(); setFilter(f.key); }}
                className={`rounded-md px-2.5 py-1 text-xs transition-colors ${
                  filter === f.key
                    ? 'bg-surface-light text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* PR list */}
          <div className="space-y-0.5">
            {filtered.map(pr => (
              <a
                key={`${pr.project_id ?? ''}-${pr.number}`}
                href={pr.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 rounded px-2.5 py-1.5 transition-colors hover:bg-surface-light group"
              >
                <ReviewIcon decision={pr.reviewDecision} />

                <span className="shrink-0 font-mono text-xs text-muted-foreground">
                  #{pr.number}
                </span>

                <span className="min-w-0 flex-1 truncate text-sm">
                  {pr.title}
                </span>

                {/* Project badge (aggregate mode) */}
                <ProjectBadge projectId={pr.project_id} />

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

                {/* CI status */}
                <CIStatusBadge pr={pr} />

                <span className="shrink-0 text-xs text-muted-foreground">
                  {pr.author}
                </span>

                <span className="shrink-0 text-xs text-muted-foreground/60">
                  {formatDistanceToNow(new Date(pr.lastActivityAt ?? pr.createdAt), { addSuffix: true })}
                </span>

                <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground/40 opacity-0 group-hover:opacity-100 transition-opacity" />
              </a>
            ))}
          </div>

          {filtered.length === 0 && (
            <p className="py-4 text-center text-xs text-muted-foreground">No PRs match this filter.</p>
          )}
        </CardContent>
      )}
    </Card>
  );
}
