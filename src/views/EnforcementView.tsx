import { useEffect, useState, useCallback } from 'react';
import { ShieldAlert, Shield, Eye, Cog, ArrowRight } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip,
  ResponsiveContainer, Cell, AreaChart, Area, CartesianGrid,
} from 'recharts';
import { useViolations } from '@/hooks/useViolations';
import { useEnforcementRules } from '@/hooks/useEnforcementRules';
import { useProjectUrl } from '@/hooks/useProjectUrl';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { OrbitalEvent, EnforcementRule, ViolationTrendPoint } from '@/types';

const CATEGORY_ICON: Record<string, typeof Shield> = {
  guard: Shield, gate: ShieldAlert, lifecycle: Cog, observer: Eye,
};

const ENFORCEMENT_STYLES: Record<string, string> = {
  blocker: 'text-red-400 bg-red-500/10 border-red-500/20',
  advisor: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  operator: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
  silent: 'text-zinc-400 bg-zinc-500/10 border-zinc-500/20',
};

export function EnforcementView() {
  const buildUrl = useProjectUrl();
  const { byRule, overrides, totalViolations, totalOverrides, loading: violationsLoading } = useViolations();
  const { data: rulesData, trend, loading: rulesLoading } = useEnforcementRules();

  // Fetch recent violations with scope context
  const [recentViolations, setRecentViolations] = useState<OrbitalEvent[]>([]);
  const fetchRecent = useCallback(async () => {
    try {
      const res = await fetch(buildUrl('/events?type=VIOLATION&limit=20'));
      if (res.ok) setRecentViolations(await res.json());
    } catch { /* server may not be running */ }
  }, [buildUrl]);
  useEffect(() => { fetchRecent(); }, [fetchRecent]);

  const loading = violationsLoading || rulesLoading;
  const overrideRate = (totalViolations + totalOverrides) > 0
    ? Math.round((totalOverrides / (totalViolations + totalOverrides)) * 100) : 0;

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  // Empty state
  if (!rulesData && totalViolations === 0 && totalOverrides === 0) {
    return (
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="mb-6 flex items-center gap-3">
          <ShieldAlert className="h-4 w-4 text-red-400" />
          <h1 className="text-xl font-light">Rule Observatory</h1>
        </div>
        <Card>
          <CardContent className="py-12 text-center">
            <ShieldAlert className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">
              No enforcement rules or events yet. Configure hooks in your workflow to see data here.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      {/* Header */}
      <div className="mb-4 flex items-center gap-3">
        <ShieldAlert className="h-4 w-4 text-red-400" />
        <h1 className="text-xl font-light">Rule Observatory</h1>
        {totalViolations > 0 && (
          <Badge className="bg-red-500/10 text-red-400 border-red-500/20">
            {totalViolations} violation{totalViolations !== 1 ? 's' : ''}
          </Badge>
        )}
      </div>

      {/* Enforcement Model Summary */}
      {rulesData && (
        <div className="mb-5 flex flex-wrap items-center gap-3 rounded-lg border border-border/50 bg-surface-light/20 px-4 py-2.5">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground/50 mr-1">Enforcement Model</span>
          <SummaryChip count={rulesData.summary.guards} label="guards" color="text-red-400" />
          <SummaryChip count={rulesData.summary.gates} label="gates" color="text-amber-400" />
          <SummaryChip count={rulesData.summary.lifecycle} label="lifecycle" color="text-cyan-400" />
          <SummaryChip count={rulesData.summary.observers} label="observers" color="text-zinc-400" />
          <span className="text-border">|</span>
          <span className="text-xs text-muted-foreground">
            {rulesData.totalEdges} edge{rulesData.totalEdges !== 1 ? 's' : ''}
          </span>
        </div>
      )}

      {/* Stats Row */}
      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <StatCard label="Total Violations" value={totalViolations} color="text-red-400" />
        <StatCard label="Total Overrides" value={totalOverrides} color="text-amber-400" />
        <StatCard
          label="Override Rate"
          value={`${overrideRate}%`}
          color={overrideRate > 50 ? 'text-amber-400' : 'text-muted-foreground'}
        />
      </div>

      {/* Rule Configuration Matrix */}
      {rulesData && rulesData.rules.length > 0 && (
        <Card className="mb-5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Rule Configuration</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-left text-[10px] text-muted-foreground uppercase tracking-wider">
                    <th className="px-4 py-2 font-medium">Hook</th>
                    <th className="px-4 py-2 font-medium">Category</th>
                    <th className="px-4 py-2 font-medium">Level</th>
                    <th className="px-4 py-2 font-medium">Edges</th>
                    <th className="px-4 py-2 font-medium text-right">Violations</th>
                    <th className="px-4 py-2 font-medium text-right">Overrides</th>
                    <th className="px-4 py-2 font-medium text-right">Last Fired</th>
                  </tr>
                </thead>
                <tbody>
                  {rulesData.rules.map((rule) => (
                    <RuleRow key={rule.hook.id} rule={rule} />
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Violation Feed */}
        <div className="lg:col-span-2 space-y-5">
          {recentViolations.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Recent Violations</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border text-left text-[10px] text-muted-foreground uppercase tracking-wider">
                        <th className="px-4 py-2 font-medium">Rule</th>
                        <th className="px-4 py-2 font-medium">Scope</th>
                        <th className="px-4 py-2 font-medium">File</th>
                        <th className="px-4 py-2 font-medium">Outcome</th>
                        <th className="px-4 py-2 font-medium text-right">Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentViolations.map((v) => {
                        const data = v.data as Record<string, string>;
                        return (
                          <tr key={v.id} className="border-b border-border/30 last:border-0 hover:bg-surface-light/30">
                            <td className="px-4 py-1.5 font-mono text-red-400">{data?.rule ?? '-'}</td>
                            <td className="px-4 py-1.5 font-mono text-muted-foreground">
                              {v.scope_id ? String(v.scope_id).padStart(3, '0') : '-'}
                            </td>
                            <td className="max-w-[180px] truncate px-4 py-1.5 text-muted-foreground">
                              {data?.file ?? '-'}
                            </td>
                            <td className="px-4 py-1.5">
                              <Badge variant="outline" className="text-[9px] border-red-500/30 text-red-400">
                                {data?.outcome ?? 'blocked'}
                              </Badge>
                            </td>
                            <td className="px-4 py-1.5 text-right text-muted-foreground/60">
                              {v.timestamp ? formatDistanceToNow(new Date(v.timestamp), { addSuffix: true }) : '-'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Violations by Rule */}
          {byRule.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Violations by Rule</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={Math.max(160, byRule.length * 32)}>
                  <BarChart
                    data={byRule.map((r) => ({
                      name: String(r.rule ?? 'unknown').slice(0, 25),
                      count: r.count,
                    }))}
                    layout="vertical"
                    margin={{ left: 10, right: 20, top: 0, bottom: 0 }}
                  >
                    <XAxis type="number" hide />
                    <YAxis dataKey="name" type="category" width={160}
                      tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                    <RechartsTooltip contentStyle={{
                      background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))',
                      borderRadius: '6px', fontSize: '11px',
                    }} />
                    <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                      {byRule.map((_, idx) => <Cell key={idx} fill="#EF4444" />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Violation Trend */}
          {trend.length > 0 && <ViolationTrendChart trend={trend} />}
        </div>

        {/* Sidebar: Overrides */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Recent Overrides</CardTitle>
            </CardHeader>
            <CardContent>
              {overrides.length > 0 ? (
                <div className="space-y-2">
                  {overrides.slice(0, 15).map((o, idx) => (
                    <div key={idx} className="rounded border border-amber-500/20 bg-amber-500/5 px-2.5 py-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-medium text-amber-400">{o.rule ?? 'unknown'}</span>
                        <span className="flex-shrink-0 text-[9px] text-muted-foreground/50">
                          {o.date ? formatDistanceToNow(new Date(o.date), { addSuffix: true }) : '-'}
                        </span>
                      </div>
                      {o.reason && (
                        <p className="mt-0.5 text-[10px] text-muted-foreground line-clamp-2">{o.reason}</p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground text-center py-4">No overrides recorded</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────

function SummaryChip({ count, label, color }: { count: number; label: string; color: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className={cn('text-sm font-medium', color)}>{count}</span>
      <span className="text-[11px] text-muted-foreground">{label}</span>
    </span>
  );
}

function StatCard({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <Card>
      <CardHeader className="pb-1">
        <CardTitle className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <span className={cn('text-xl font-normal', color)}>{value}</span>
      </CardContent>
    </Card>
  );
}

function RuleRow({ rule }: { rule: EnforcementRule }) {
  const Icon = CATEGORY_ICON[rule.hook.category] ?? Shield;
  return (
    <tr className="border-b border-border/30 last:border-0 hover:bg-surface-light/30">
      <td className="px-4 py-2">
        <div className="flex items-center gap-1.5">
          <Icon className="h-3 w-3 text-muted-foreground/50" />
          <span className="font-medium">{rule.hook.label}</span>
        </div>
      </td>
      <td className="px-4 py-2">
        <Badge variant="outline" className={cn('text-[9px] border', ENFORCEMENT_STYLES[rule.enforcement])}>
          {rule.hook.category}
        </Badge>
      </td>
      <td className="px-4 py-2">
        <span className={cn('text-[10px]', ENFORCEMENT_STYLES[rule.enforcement]?.split(' ')[0])}>
          {rule.enforcement}
        </span>
      </td>
      <td className="px-4 py-2">
        {rule.edges.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {rule.edges.slice(0, 3).map((e, idx) => (
              <span key={idx} className="inline-flex items-center gap-0.5 text-[9px] text-muted-foreground font-mono">
                {e.from}<ArrowRight className="h-2 w-2" />{e.to}
              </span>
            ))}
            {rule.edges.length > 3 && (
              <span className="text-[9px] text-muted-foreground">+{rule.edges.length - 3}</span>
            )}
          </div>
        ) : (
          <span className="text-[9px] text-muted-foreground">-</span>
        )}
      </td>
      <td className="px-4 py-2 text-right font-mono">
        {rule.stats.violations > 0 ? (
          <span className="text-red-400">{rule.stats.violations}</span>
        ) : (
          <span className="text-muted-foreground/40">0</span>
        )}
      </td>
      <td className="px-4 py-2 text-right font-mono">
        {rule.stats.overrides > 0 ? (
          <span className="text-amber-400">{rule.stats.overrides}</span>
        ) : (
          <span className="text-muted-foreground/40">0</span>
        )}
      </td>
      <td className="px-4 py-2 text-right text-muted-foreground/60">
        {rule.stats.last_triggered
          ? formatDistanceToNow(new Date(rule.stats.last_triggered), { addSuffix: true })
          : '-'}
      </td>
    </tr>
  );
}

function ViolationTrendChart({ trend }: { trend: ViolationTrendPoint[] }) {
  // Aggregate by day for a simple area chart
  const dailyTotals = new Map<string, number>();
  for (const point of trend) {
    dailyTotals.set(point.day, (dailyTotals.get(point.day) ?? 0) + point.count);
  }
  const chartData = [...dailyTotals.entries()]
    .map(([day, count]) => ({ day: day.slice(5), count })) // MM-DD format
    .slice(-30);

  if (chartData.length < 2) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Violation Trend (30d)</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={140}>
          <AreaChart data={chartData} margin={{ left: 0, right: 10, top: 5, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
            <XAxis dataKey="day" tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} />
            <YAxis tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} width={30} />
            <RechartsTooltip contentStyle={{
              background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))',
              borderRadius: '6px', fontSize: '11px',
            }} />
            <Area type="monotone" dataKey="count" stroke="#EF4444" fill="#EF444420" strokeWidth={1.5} />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
