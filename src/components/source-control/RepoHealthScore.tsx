import { Activity, GitBranch, GitPullRequest, AlertTriangle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { RepoHealthMetrics } from '@/types';

interface Props {
  health: RepoHealthMetrics;
}

function gradeColor(grade: string): string {
  if (grade === 'A') return 'text-bid-green';
  if (grade === 'B') return 'text-accent-blue';
  if (grade === 'C') return 'text-warning-amber';
  return 'text-ask-red';
}

function gradeBg(grade: string): string {
  if (grade === 'A') return 'bg-bid-green/10';
  if (grade === 'B') return 'bg-accent-blue/10';
  if (grade === 'C') return 'bg-warning-amber/10';
  return 'bg-ask-red/10';
}

export function RepoHealthScore({ health }: Props) {
  return (
    <Card className="mb-6">
      <CardContent className="flex items-center gap-6 py-3">
        {/* Grade */}
        <div className={cn(
          'flex items-center justify-center h-12 w-12 rounded-lg text-2xl font-bold shrink-0',
          gradeBg(health.grade),
          gradeColor(health.grade),
        )}>
          {health.grade}
        </div>

        {/* Metrics */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
          <Metric
            icon={<Activity className="h-3.5 w-3.5" />}
            label="Commits/week"
            value={String(health.commitsPerWeek)}
            warn={health.commitsPerWeek < 5}
          />
          <Metric
            icon={<GitPullRequest className="h-3.5 w-3.5" />}
            label="Avg PR age"
            value={health.avgPrAgeDays > 0 ? `${health.avgPrAgeDays}d` : '--'}
            warn={health.avgPrAgeDays > 3}
          />
          <Metric
            icon={<GitBranch className="h-3.5 w-3.5" />}
            label="Stale branches"
            value={String(health.staleBranchCount)}
            warn={health.staleBranchCount > 0}
          />
          <Metric
            icon={<AlertTriangle className="h-3.5 w-3.5" />}
            label="Drift"
            value={health.driftSeverity}
            warn={health.driftSeverity !== 'clean'}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function Metric({ icon, label, value, warn }: { icon: React.ReactNode; label: string; value: string; warn: boolean }) {
  return (
    <div className="flex items-center gap-1.5 text-xs">
      <span className={warn ? 'text-warning-amber' : 'text-muted-foreground'}>{icon}</span>
      <span className="text-muted-foreground">{label}</span>
      <span className={cn('font-medium', warn ? 'text-warning-amber' : 'text-foreground')}>
        {value}
      </span>
    </div>
  );
}
