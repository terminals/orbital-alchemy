import { formatDistanceToNow } from 'date-fns';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { PipelineDrift, DeployFrequencyWeek, Deployment } from '@/types';

interface Props {
  drift: PipelineDrift;
  frequency: DeployFrequencyWeek[];
  deployments: Deployment[];
}

function driftColor(count: number): string {
  if (count === 0) return 'text-bid-green';
  if (count <= 5) return 'text-accent-blue';
  if (count <= 20) return 'text-warning-amber';
  return 'text-ask-red';
}

function timeBehind(oldestDate: string | null): string {
  if (!oldestDate) return 'synced';
  return formatDistanceToNow(new Date(oldestDate)) + ' behind';
}

export function DriftSidebar({ drift, frequency, deployments }: Props) {
  const latestStaging = deployments.find((d) => d.environment === 'staging');
  const latestProd = deployments.find((d) => d.environment === 'production');

  return (
    <div className="space-y-6">
      {/* Branch Drift Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Branch Drift</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <DriftRow
            label="dev → staging"
            count={drift.devToStaging.count}
            oldestDate={drift.devToStaging.oldestDate}
          />
          <DriftRow
            label="staging → main"
            count={drift.stagingToMain.count}
            oldestDate={drift.stagingToMain.oldestDate}
          />

          <div className="mt-4 border-t border-border pt-3 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Last staging deploy</span>
              <span className="text-foreground">
                {latestStaging?.started_at
                  ? formatDistanceToNow(new Date(latestStaging.started_at), { addSuffix: true })
                  : '—'}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Last production deploy</span>
              <span className="text-foreground">
                {latestProd?.started_at
                  ? formatDistanceToNow(new Date(latestProd.started_at), { addSuffix: true })
                  : '—'}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Deploy Frequency Chart */}
      {frequency.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Deploy Frequency</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart
                data={frequency}
                margin={{ left: 0, right: 10, top: 0, bottom: 0 }}
              >
                <XAxis
                  dataKey="week"
                  tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                  tickFormatter={(w: string) => w.replace(/^\d{4}-/, '')}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                  width={24}
                />
                <RechartsTooltip
                  contentStyle={{
                    background: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '6px',
                    fontSize: '12px',
                  }}
                />
                <Legend
                  iconSize={8}
                  wrapperStyle={{ fontSize: '10px' }}
                />
                <Bar dataKey="staging" stackId="a" fill="#EC4899" radius={[0, 0, 0, 0]} />
                <Bar dataKey="production" stackId="a" fill="#00c853" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function DriftRow({ label, count, oldestDate }: {
  label: string;
  count: number;
  oldestDate: string | null;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <span className={cn('font-mono text-xs font-medium', driftColor(count))}>
          {count} commits
        </span>
        <span className="text-[10px] text-muted-foreground/60">
          {timeBehind(oldestDate)}
        </span>
      </div>
    </div>
  );
}
