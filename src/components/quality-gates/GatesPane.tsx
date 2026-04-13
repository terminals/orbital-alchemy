import { CheckCircle2, Clock } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip,
  ResponsiveContainer, Cell, CartesianGrid,
} from 'recharts';
import { useGates } from '@/hooks/useGates';
import { GateIndicator } from '@/components/GateIndicator';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TOOLTIP_STYLE, formatGateName } from './constants';
import type { GateStatus } from '@/types';

export function GatesPane() {
  const { gates, stats, loading } = useGates();

  const totalPassed = stats.reduce((sum, s) => sum + s.passed, 0);
  const totalRuns = stats.reduce((sum, s) => sum + s.total, 0);
  const passRate = totalRuns > 0 ? Math.round((totalPassed / totalRuns) * 100) : 0;
  const passing = gates.filter((g) => g.status === 'pass').length;

  return (
    <Card className="shrink-0 basis-2/5 min-h-0 flex flex-col">
      <CardHeader className="pb-2 pt-3 px-4 shrink-0">
        <div className="flex items-center gap-2 flex-wrap">
          <CheckCircle2 className="h-3.5 w-3.5 text-muted-foreground" />
          <CardTitle className="text-sm font-medium">CI Gates</CardTitle>
          {gates.length > 0 && (
            <Badge variant="secondary" className="text-[10px]">{passing}/{gates.length} passing</Badge>
          )}
          {totalRuns > 0 && (
            <div className="ml-auto flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Pass rate</span>
              <span className="text-sm font-medium">{passRate}%</span>
              <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-bid-green transition-all" style={{ width: `${passRate}%` }} />
              </div>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4 flex-1 min-h-0 overflow-y-auto">
        {loading ? (
          <div className="flex h-20 items-center justify-center">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : gates.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-3">
            No gate results yet. Run <code className="rounded bg-muted px-1">/test-checks</code> to populate.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            {/* Latest run */}
            <div>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground/50 mb-1.5 block">Latest Run</span>
              <div className="space-y-0.5">
                {gates.map((gate) => (
                  <div key={gate.id} className="flex items-center gap-2 rounded px-2 py-0.5 hover:bg-surface-light/50">
                    <GateIndicator status={gate.status as GateStatus} />
                    <span className="flex-1 text-[11px] truncate">{formatGateName(gate.gate_name)}</span>
                    {gate.duration_ms != null && (
                      <span className="font-mono text-[10px] text-muted-foreground shrink-0">{(gate.duration_ms / 1000).toFixed(1)}s</span>
                    )}
                    <span className="text-[10px] text-muted-foreground/50 shrink-0">
                      <Clock className="inline h-2.5 w-2.5 mr-0.5" />
                      {formatDistanceToNow(new Date(gate.run_at), { addSuffix: true })}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* History + Duration charts */}
            <div className="space-y-3">
              <div>
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground/50 mb-1.5 block">Gate History</span>
                {stats.length === 0 ? (
                  <ChartEmpty height={100} message="No history data" />
                ) : (
                  <ResponsiveContainer width="100%" height={Math.max(100, stats.length * 16)}>
                    <BarChart
                      data={stats.map((s) => ({ name: s.gate_name.replace(/-/g, ' ').slice(0, 12), passed: s.passed, failed: s.failed }))}
                      layout="vertical" margin={{ left: 0, right: 8, top: 0, bottom: 0 }}
                    >
                      <XAxis type="number" hide />
                      <YAxis dataKey="name" type="category" width={80}
                        tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} />
                      <RechartsTooltip contentStyle={TOOLTIP_STYLE} />
                      <Bar dataKey="passed" stackId="a" radius={[0, 0, 0, 0]}>
                        {stats.map((_, idx) => <Cell key={idx} fill="#00c853" />)}
                      </Bar>
                      <Bar dataKey="failed" stackId="a" radius={[0, 4, 4, 0]}>
                        {stats.map((_, idx) => <Cell key={idx} fill="#ff1744" />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>

              <div>
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground/50 mb-1.5 block">Gate Duration</span>
                {!gates.some((g) => g.duration_ms != null) ? (
                  <ChartEmpty height={100} message="No duration data" />
                ) : (
                  <ResponsiveContainer width="100%" height={Math.max(100, gates.filter((g) => g.duration_ms != null).length * 16)}>
                    <BarChart
                      data={gates
                        .filter((g) => g.duration_ms != null)
                        .map((g) => ({
                          name: g.gate_name.replace(/-/g, ' ').slice(0, 12),
                          seconds: Number((g.duration_ms! / 1000).toFixed(1)),
                          status: g.status,
                        }))}
                      layout="vertical" margin={{ left: 0, right: 8, top: 0, bottom: 0 }}
                    >
                      <XAxis type="number" unit="s" tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} />
                      <YAxis dataKey="name" type="category" width={80}
                        tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} />
                      <RechartsTooltip
                        formatter={(val: number) => [`${val}s`, 'Duration']}
                        contentStyle={TOOLTIP_STYLE}
                      />
                      <Bar dataKey="seconds" radius={[0, 4, 4, 0]}>
                        {gates.filter((g) => g.duration_ms != null).map((g, idx) => (
                          <Cell key={idx} fill={g.status === 'pass' ? '#00c85340' : g.status === 'fail' ? '#ff174440' : '#06b6d440'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ChartEmpty({ height, message }: { height: number; message: string }) {
  return (
    <div className="relative">
      <div style={{ height }} className="opacity-30">
        <ResponsiveContainer width="100%" height={height}>
          <BarChart data={[{ name: '', value: 0 }]} layout="vertical" margin={{ left: 10, right: 20, top: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
            <XAxis type="number" domain={[0, 10]} tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} />
            <YAxis dataKey="name" type="category" width={80} tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-xs text-muted-foreground">{message}</span>
      </div>
    </div>
  );
}
