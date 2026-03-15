import { useState } from 'react';
import { format, formatDistanceToNow } from 'date-fns';
import {
  Rocket,
  CheckCircle2,
  XCircle,
  Loader2,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { Deployment, DeployStatus } from '@/types';

const STATUS_CONFIG: Record<DeployStatus, {
  icon: typeof CheckCircle2;
  color: string;
  label: string;
  animate?: string;
}> = {
  deploying: { icon: Loader2, color: 'text-accent-blue', label: 'Deploying', animate: 'animate-spin' },
  healthy: { icon: CheckCircle2, color: 'text-bid-green', label: 'Healthy' },
  failed: { icon: XCircle, color: 'text-ask-red', label: 'Failed' },
  'rolled-back': { icon: XCircle, color: 'text-warning-amber', label: 'Rolled Back' },
};

const DEFAULT_VISIBLE = 20;

interface Props {
  deployments: Deployment[];
}

function groupByDate(deployments: Deployment[]): Map<string, Deployment[]> {
  const groups = new Map<string, Deployment[]>();
  for (const d of deployments) {
    const dateKey = d.started_at ? format(new Date(d.started_at), 'yyyy-MM-dd') : 'Unknown';
    const existing = groups.get(dateKey);
    if (existing) {
      existing.push(d);
    } else {
      groups.set(dateKey, [d]);
    }
  }
  return groups;
}

function computeDuration(d: Deployment): string | null {
  if (!d.started_at || !d.completed_at) return null;
  const ms = new Date(d.completed_at).getTime() - new Date(d.started_at).getTime();
  if (ms < 1000) return '<1s';
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  return `${Math.round(ms / 60_000)}m`;
}

export function DeployHistory({ deployments }: Props) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? deployments : deployments.slice(0, DEFAULT_VISIBLE);
  const grouped = groupByDate(visible);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          Deployment History
          <Badge variant="secondary" className="ml-2">
            {deployments.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {deployments.length === 0 ? (
          <div className="py-8 text-center">
            <Rocket className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">
              No deployments recorded yet.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {[...grouped.entries()].map(([dateKey, deploys]) => (
              <div key={dateKey}>
                <div className="sticky top-0 z-10 bg-card pb-1 pt-0.5">
                  <span className="text-xxs font-medium uppercase tracking-wider text-muted-foreground">
                    {dateKey === 'Unknown' ? 'Unknown date' : format(new Date(dateKey), 'EEEE, MMM d')}
                  </span>
                </div>
                <div className="space-y-0.5">
                  {deploys.map((deploy) => {
                    const config = STATUS_CONFIG[deploy.status];
                    const Icon = config.icon;
                    const duration = computeDuration(deploy);
                    return (
                      <div
                        key={deploy.id}
                        className="flex items-center gap-4 rounded px-2.5 py-1.5 transition-colors hover:bg-surface-light"
                      >
                        <Icon className={cn('h-4 w-4 shrink-0', config.color, config.animate)} />
                        <Badge variant="outline" className="capitalize shrink-0">
                          {deploy.environment}
                        </Badge>
                        <span className="text-xs font-normal shrink-0">{config.label}</span>
                        {deploy.commit_sha && (
                          <code className="font-mono text-xs text-muted-foreground shrink-0">
                            {deploy.commit_sha.slice(0, 7)}
                          </code>
                        )}
                        {deploy.branch && (
                          <span className="truncate text-xs text-muted-foreground">
                            {deploy.branch}
                          </span>
                        )}
                        {duration && (
                          <span className="font-mono text-xs text-muted-foreground/60 shrink-0">
                            {duration}
                          </span>
                        )}
                        <span className="ml-auto text-xs text-muted-foreground/60 shrink-0">
                          {deploy.started_at
                            ? formatDistanceToNow(new Date(deploy.started_at), { addSuffix: true })
                            : '—'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

            {!showAll && deployments.length > DEFAULT_VISIBLE && (
              <button
                onClick={() => setShowAll(true)}
                className="w-full rounded border border-border py-2 text-xs text-muted-foreground transition-colors hover:bg-surface-light hover:text-foreground"
              >
                Show all {deployments.length} deployments
              </button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
