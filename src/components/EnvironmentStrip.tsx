import { formatDistanceToNow } from 'date-fns';
import { ArrowRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { PipelineDrift } from '@/types';

interface Props {
  drift: PipelineDrift;
}

function driftColor(count: number): string {
  if (count === 0) return 'text-bid-green';
  if (count <= 5) return 'text-accent-blue';
  if (count <= 20) return 'text-warning-amber';
  return 'text-ask-red';
}

function driftGlow(count: number): string {
  if (count === 0) return 'glow-green-sm';
  if (count <= 5) return '';
  if (count <= 20) return 'glow-amber';
  return 'glow-red-sm';
}

function driftLabel(count: number): string {
  if (count === 0) return 'synced';
  return `${count} ahead`;
}

function EnvCard({ name, sha, date }: { name: string; sha: string; date: string }) {
  return (
    <div className="flex flex-col items-center gap-1 rounded border border-border bg-surface p-3 min-w-[130px]">
      <span className="text-xs font-medium uppercase tracking-wider text-foreground">
        {name}
      </span>
      <code className="font-mono text-xxs text-muted-foreground">
        {sha ? sha.slice(0, 7) : '—'}
      </code>
      {date && (
        <span className="text-[10px] text-muted-foreground/60">
          {formatDistanceToNow(new Date(date), { addSuffix: true })}
        </span>
      )}
    </div>
  );
}

function DriftArrow({ count }: { count: number }) {
  const color = driftColor(count);
  const glow = driftGlow(count);

  return (
    <div className={cn('flex flex-col items-center gap-0.5', glow)}>
      <span className={cn('text-[10px] font-medium', color)}>
        {driftLabel(count)}
      </span>
      <ArrowRight className={cn('h-4 w-4', color)} />
    </div>
  );
}

export function EnvironmentStrip({ drift }: Props) {
  return (
    <Card>
      <CardContent className="py-4">
        <div className="grid grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-3">
          <EnvCard
            name="dev"
            sha={drift.heads.dev.sha}
            date={drift.heads.dev.date}
          />
          <DriftArrow count={drift.devToStaging.count} />
          <EnvCard
            name="staging"
            sha={drift.heads.staging.sha}
            date={drift.heads.staging.date}
          />
          <DriftArrow count={drift.stagingToMain.count} />
          <EnvCard
            name="main"
            sha={drift.heads.main.sha}
            date={drift.heads.main.date}
          />
        </div>
      </CardContent>
    </Card>
  );
}
