import { ShieldCheck } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { useGates } from '@/hooks/useGates';
import { GateIndicator } from '@/components/GateIndicator';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import type { GateStatus } from '@/types';

// Format gate name for display
function formatGateName(name: string): string {
  return name
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function QualityGates() {
  const { gates, stats, loading } = useGates();

  // Calculate overall pass rate from stats
  const totalPassed = stats.reduce((sum, s) => sum + s.passed, 0);
  const totalRuns = stats.reduce((sum, s) => sum + s.total, 0);
  const passRate = totalRuns > 0 ? Math.round((totalPassed / totalRuns) * 100) : 0;

  // Find most failed gate
  const mostFailed = stats.reduce(
    (worst, s) => (s.failed > worst.failed ? s : worst),
    { gate_name: 'none', total: 0, passed: 0, failed: 0 }
  );

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
        <ShieldCheck className="h-4 w-4 text-primary" />
        <h1 className="text-xl font-light">Quality Gates</h1>
        {gates.length > 0 && (
          <Badge variant="secondary">
            {gates.filter((g) => g.status === 'pass').length}/{gates.length} passing
          </Badge>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Gate results table */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">
              {gates.length > 0 ? 'Latest Gate Run' : 'Gate Results'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {gates.length === 0 ? (
              <div className="py-8 text-center">
                <ShieldCheck className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">
                  No gate results yet. Run <code className="rounded bg-muted px-1">/test pre-commit</code> to see results here.
                </p>
              </div>
            ) : (
              <div className="space-y-1">
                {gates.map((gate) => (
                  <div
                    key={gate.id}
                    className={cn('flex items-center gap-4 rounded px-2.5 py-1.5 transition-colors hover:bg-surface-light', gate.status === 'pass' && 'glow-green-sm', gate.status === 'fail' && 'glow-red-sm')}
                  >
                    <GateIndicator status={gate.status as GateStatus} />
                    <span className="flex-1 text-xs font-normal">
                      {formatGateName(gate.gate_name)}
                    </span>
                    {gate.duration_ms != null && (
                      <span className="font-mono text-xs text-muted-foreground">
                        {(gate.duration_ms / 1000).toFixed(1)}s
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground/60">
                      {formatDistanceToNow(new Date(gate.run_at), { addSuffix: true })}
                    </span>
                  </div>
                ))}

                {/* Error details for failed gates */}
                {gates
                  .filter((g) => g.status === 'fail' && g.details)
                  .map((gate) => (
                    <div
                      key={`${gate.id}-details`}
                      className="ml-10 rounded border border-ask-red/20 bg-ask-red/5 p-3"
                    >
                      <p className="mb-1 text-xs font-medium text-ask-red">
                        {formatGateName(gate.gate_name)} Error:
                      </p>
                      <pre className="whitespace-pre-wrap font-mono text-xs text-muted-foreground">
                        {gate.details}
                      </pre>
                    </div>
                  ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Stats sidebar */}
        <div className="space-y-6">
          {/* Pass rate card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Pass Rate</CardTitle>
            </CardHeader>
            <CardContent>
              {totalRuns > 0 ? (
                <div>
                  <div className="mb-2 flex items-baseline gap-2">
                    <span className="text-2xl font-normal">{passRate}%</span>
                    <span className="text-sm text-muted-foreground">
                      ({totalPassed}/{totalRuns})
                    </span>
                  </div>
                  {/* Progress bar */}
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-bid-green transition-all"
                      style={{ width: `${passRate}%` }}
                    />
                  </div>
                  {mostFailed.failed > 0 && (
                    <p className="mt-3 text-xs text-muted-foreground">
                      Most failed: <span className="text-ask-red">{formatGateName(mostFailed.gate_name)}</span>{' '}
                      ({mostFailed.failed}x)
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No data yet</p>
              )}
            </CardContent>
          </Card>

          {/* Per-gate stats chart */}
          {stats.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Gate History</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart
                    data={stats.map((s) => ({
                      name: s.gate_name.replace(/-/g, ' ').slice(0, 10),
                      passed: s.passed,
                      failed: s.failed,
                    }))}
                    layout="vertical"
                    margin={{ left: 0, right: 10, top: 0, bottom: 0 }}
                  >
                    <XAxis type="number" hide />
                    <YAxis
                      dataKey="name"
                      type="category"
                      width={80}
                      tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                    />
                    <RechartsTooltip
                      contentStyle={{
                        background: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '6px',
                        fontSize: '12px',
                      }}
                    />
                    <Bar dataKey="passed" stackId="a" radius={[0, 0, 0, 0]}>
                      {stats.map((_, idx) => (
                        <Cell key={idx} fill="#00c853" />
                      ))}
                    </Bar>
                    <Bar dataKey="failed" stackId="a" radius={[0, 4, 4, 0]}>
                      {stats.map((_, idx) => (
                        <Cell key={idx} fill="#ff1744" />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <Separator className="my-6" />

      {/* Info footer */}
      <p className="text-xs text-muted-foreground">
        Quality gates run automatically during <code className="rounded bg-muted px-1">/test pre-commit</code>.
        Results are captured in real-time and displayed here.
      </p>
    </div>
  );
}
