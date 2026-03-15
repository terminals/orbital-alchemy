import { useEffect, useState, useCallback } from 'react';
import { ShieldAlert } from 'lucide-react';
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
import { useViolations } from '@/hooks/useViolations';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { OrbitalEvent } from '@/types';

export function EnforcementView() {
  const { byRule, overrides, totalViolations, totalOverrides, loading } = useViolations();

  // Fetch 20 most recent violation events for the table
  const [recentViolations, setRecentViolations] = useState<OrbitalEvent[]>([]);
  const fetchRecent = useCallback(async () => {
    try {
      const res = await fetch('/api/orbital/events?type=VIOLATION&limit=20');
      if (res.ok) setRecentViolations(await res.json());
    } catch { /* CC server may not be running */ }
  }, []);
  useEffect(() => { fetchRecent(); }, [fetchRecent]);

  const overrideRate = (totalViolations + totalOverrides) > 0
    ? Math.round((totalOverrides / (totalViolations + totalOverrides)) * 100)
    : 0;

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  // Empty state
  if (totalViolations === 0 && totalOverrides === 0) {
    return (
      <div>
        <div className="mb-6 flex items-center gap-3">
          <ShieldAlert className="h-4 w-4 text-red-400" />
          <h1 className="text-xl font-light">Enforcement</h1>
        </div>
        <Card>
          <CardContent className="py-12 text-center">
            <ShieldAlert className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">
              No enforcement events yet. Violations will appear here as hooks detect blocked patterns.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <ShieldAlert className="h-4 w-4 text-red-400" />
        <h1 className="text-xl font-light">Enforcement</h1>
        <Badge className="bg-red-500/10 text-red-400">
          {totalViolations} violation{totalViolations !== 1 ? 's' : ''}
        </Badge>
      </div>

      {/* Stats cards */}
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground">Total Violations</CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-2xl font-normal text-red-400">{totalViolations}</span>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground">Total Overrides</CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-2xl font-normal text-amber-400">{totalOverrides}</span>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground">Override Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <span className={cn(
              'text-2xl font-normal',
              overrideRate > 50 ? 'text-amber-400' : 'text-muted-foreground'
            )}>
              {overrideRate}%
            </span>
          </CardContent>
        </Card>
      </div>

      {/* Violations Table — 20 most recent */}
      {recentViolations.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base">Recent Violations</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="px-4 py-2 font-medium">Rule</th>
                    <th className="px-4 py-2 font-medium">File</th>
                    <th className="px-4 py-2 font-medium">Outcome</th>
                    <th className="px-4 py-2 font-medium text-right">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {recentViolations.map((v) => (
                    <tr key={v.id} className="border-b border-border/50 last:border-0">
                      <td className="px-4 py-2 font-mono text-xs text-red-400">
                        {(v.data as Record<string, string>)?.rule ?? '—'}
                      </td>
                      <td className="max-w-[200px] truncate px-4 py-2 text-xs text-muted-foreground">
                        {(v.data as Record<string, string>)?.file ?? '—'}
                      </td>
                      <td className="px-4 py-2">
                        <Badge variant="outline" className="text-xxs border-red-500/30 text-red-400">
                          {(v.data as Record<string, string>)?.outcome ?? 'blocked'}
                        </Badge>
                      </td>
                      <td className="px-4 py-2 text-right text-xs text-muted-foreground/60">
                        {v.timestamp
                          ? formatDistanceToNow(new Date(v.timestamp), { addSuffix: true })
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Violations by Rule — horizontal bar chart */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Violations by Rule</CardTitle>
          </CardHeader>
          <CardContent>
            {byRule.length > 0 ? (
              <ResponsiveContainer width="100%" height={Math.max(200, byRule.length * 36)}>
                <BarChart
                  data={byRule.map((r) => ({
                    name: String(r.rule ?? 'unknown').slice(0, 30),
                    count: r.count,
                  }))}
                  layout="vertical"
                  margin={{ left: 10, right: 20, top: 0, bottom: 0 }}
                >
                  <XAxis type="number" hide />
                  <YAxis
                    dataKey="name"
                    type="category"
                    width={180}
                    tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                  />
                  <RechartsTooltip
                    contentStyle={{
                      background: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '6px',
                      fontSize: '12px',
                    }}
                  />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                    {byRule.map((_, idx) => (
                      <Cell key={idx} fill="#EF4444" />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground">No violations recorded yet.</p>
            )}
          </CardContent>
        </Card>

        {/* Recent Overrides */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent Overrides</CardTitle>
          </CardHeader>
          <CardContent>
            {overrides.length > 0 ? (
              <div className="space-y-3">
                {overrides.slice(0, 15).map((o, idx) => (
                  <div key={idx} className="rounded border border-amber-500/20 bg-amber-500/5 px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-amber-400">
                        {o.rule ?? 'unknown rule'}
                      </span>
                      <span className="flex-shrink-0 text-[10px] text-muted-foreground/60">
                        {o.date
                          ? formatDistanceToNow(new Date(o.date), { addSuffix: true })
                          : '—'}
                      </span>
                    </div>
                    {o.reason && (
                      <p className="mt-1 text-xxs text-muted-foreground line-clamp-2">
                        {o.reason}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No overrides recorded.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
