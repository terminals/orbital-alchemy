import { useState, useEffect, useCallback } from 'react';
import {
  ShieldCheck, ArrowRight, CheckCircle2, Clock, Shield, ShieldAlert, Eye, Cog,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip,
  ResponsiveContainer, Cell, AreaChart, Area, CartesianGrid,
  PieChart, Pie, Legend,
} from 'recharts';
import { useGates } from '@/hooks/useGates';
import { useViolations } from '@/hooks/useViolations';
import { useEnforcementRules } from '@/hooks/useEnforcementRules';
import { useProjectUrl } from '@/hooks/useProjectUrl';
import { ProjectTabBar } from '@/components/ProjectTabBar';
import { GateIndicator } from '@/components/GateIndicator';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { GateStatus, EnforcementRule, ViolationTrendPoint, OrbitalEvent } from '@/types';

function formatGateName(name: string): string {
  return name.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

const ENFORCEMENT_COLORS: Record<string, string> = {
  blocker: 'text-red-400 bg-red-500/10 border-red-500/20',
  advisor: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  operator: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
  silent: 'text-zinc-400 bg-zinc-500/10 border-zinc-500/20',
};

const CATEGORY_ICON: Record<string, typeof Shield> = {
  guard: Shield, gate: ShieldAlert, lifecycle: Cog, observer: Eye,
};

const TOOLTIP_STYLE = {
  background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))',
  borderRadius: '6px', fontSize: '11px',
};

// ─── Main Page ──────────────────────────────────────────────

export function QualityGates() {
  return (
    <div className="flex flex-1 min-h-0 flex-col">
      <ProjectTabBar />
      <div className="mb-3 flex items-center gap-3">
        <ShieldCheck className="h-4 w-4 text-primary" />
        <h1 className="text-xl font-light">Safeguards</h1>
      </div>
      <div className="flex flex-1 min-h-0 gap-4">
        {/* Left pane — Rules */}
        <div className="flex w-1/2 min-w-0 flex-col overflow-y-auto rounded-lg border border-border/50">
          <RulesPane />
        </div>
        {/* Right pane — Enforcement + CI */}
        <div className="flex w-1/2 min-w-0 flex-col overflow-y-auto space-y-4">
          <EnforcementPane />
          <CIGatesPane />
        </div>
      </div>
    </div>
  );
}

// ─── Left Pane: Rules ──────────────────────────────────────

function RulesPane() {
  const { data: rulesData, loading } = useEnforcementRules();

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!rulesData || rulesData.rules.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-xs text-muted-foreground">No rules configured</p>
      </div>
    );
  }

  return (
    <>
      {/* Header strip with summary + donut */}
      <div className="sticky top-0 z-10 border-b border-border/50 bg-surface-light/40 backdrop-blur-sm px-3 py-2">
        <div className="flex items-center gap-3">
          <Shield className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-medium">Rules</span>
          <div className="flex items-center gap-2.5 ml-auto">
            <SummaryChip count={rulesData.summary.guards} label="guards" color="text-red-400" />
            <SummaryChip count={rulesData.summary.gates} label="gates" color="text-amber-400" />
            <SummaryChip count={rulesData.summary.lifecycle} label="lifecycle" color="text-cyan-400" />
            <SummaryChip count={rulesData.summary.observers} label="observers" color="text-zinc-400" />
            <span className="text-border">|</span>
            <span className="text-[10px] text-muted-foreground">{rulesData.totalEdges} edges</span>
          </div>
        </div>
      </div>

      {/* Donut chart row */}
      <div className="flex items-center justify-center border-b border-border/30 py-2">
        <HookCategoryDonut summary={rulesData.summary} />
      </div>

      {/* Rule table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border text-left text-[10px] text-muted-foreground uppercase tracking-wider">
              <th className="px-3 py-1.5 font-medium">Hook</th>
              <th className="px-3 py-1.5 font-medium">Category</th>
              <th className="px-3 py-1.5 font-medium">Level</th>
              <th className="px-3 py-1.5 font-medium">Edges</th>
              <th className="px-3 py-1.5 font-medium text-right">Vio</th>
              <th className="px-3 py-1.5 font-medium text-right">Ovr</th>
              <th className="px-3 py-1.5 font-medium text-right">Fired</th>
            </tr>
          </thead>
          <tbody>
            {rulesData.rules.map((rule) => (
              <RuleRow key={rule.hook.id} rule={rule} />
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function RuleRow({ rule }: { rule: EnforcementRule }) {
  const Icon = CATEGORY_ICON[rule.hook.category] ?? Shield;
  return (
    <tr className="border-b border-border/30 last:border-0 hover:bg-surface-light/30">
      <td className="px-3 py-1.5">
        <div className="flex items-center gap-1.5">
          <Icon className="h-3 w-3 text-muted-foreground/50 shrink-0" />
          <span className="font-medium truncate">{rule.hook.label}</span>
        </div>
      </td>
      <td className="px-3 py-1.5">
        <Badge variant="outline" className={cn('text-[9px] border', ENFORCEMENT_COLORS[rule.enforcement])}>
          {rule.hook.category}
        </Badge>
      </td>
      <td className="px-3 py-1.5">
        <span className={cn('text-[10px]', ENFORCEMENT_COLORS[rule.enforcement]?.split(' ')[0])}>
          {rule.enforcement}
        </span>
      </td>
      <td className="px-3 py-1.5">
        {rule.edges.length > 0 ? (
          <div className="flex flex-wrap gap-0.5">
            {rule.edges.slice(0, 2).map((e, idx) => (
              <span key={idx} className="inline-flex items-center gap-0.5 text-[9px] text-muted-foreground font-mono">
                {e.from}<ArrowRight className="h-2 w-2" />{e.to}
              </span>
            ))}
            {rule.edges.length > 2 && (
              <span className="text-[9px] text-muted-foreground">+{rule.edges.length - 2}</span>
            )}
          </div>
        ) : (
          <span className="text-[9px] text-muted-foreground">-</span>
        )}
      </td>
      <td className="px-3 py-1.5 text-right font-mono">
        {rule.stats.violations > 0 ? (
          <span className="text-red-400">{rule.stats.violations}</span>
        ) : (
          <span className="text-muted-foreground/40">0</span>
        )}
      </td>
      <td className="px-3 py-1.5 text-right font-mono">
        {rule.stats.overrides > 0 ? (
          <span className="text-amber-400">{rule.stats.overrides}</span>
        ) : (
          <span className="text-muted-foreground/40">0</span>
        )}
      </td>
      <td className="px-3 py-1.5 text-right text-muted-foreground/60">
        {rule.stats.last_triggered
          ? formatDistanceToNow(new Date(rule.stats.last_triggered), { addSuffix: true })
          : '-'}
      </td>
    </tr>
  );
}

// ─── Right Pane: Enforcement ────────────────────────────────

function EnforcementPane() {
  const buildUrl = useProjectUrl();
  const { byRule, overrides, totalViolations, totalOverrides, loading: violationsLoading } = useViolations();
  const { trend, loading: trendLoading } = useEnforcementRules();

  const [recentViolations, setRecentViolations] = useState<OrbitalEvent[]>([]);
  const fetchRecent = useCallback(async () => {
    try {
      const res = await fetch(buildUrl('/events?type=VIOLATION&limit=15'));
      if (res.ok) setRecentViolations(await res.json());
    } catch { /* ok */ }
  }, [buildUrl]);
  useEffect(() => { fetchRecent(); }, [fetchRecent]);

  const overrideRate = (totalViolations + totalOverrides) > 0
    ? Math.round((totalOverrides / (totalViolations + totalOverrides)) * 100) : 0;

  const isLoading = violationsLoading || trendLoading;

  return (
    <Card>
      {/* Header */}
      <CardHeader className="pb-2 pt-3 px-4">
        <div className="flex items-center gap-2 flex-wrap">
          <ShieldAlert className="h-3.5 w-3.5 text-red-400" />
          <CardTitle className="text-sm font-medium">Enforcement Activity</CardTitle>
          <div className="flex items-center gap-3 ml-auto text-xs">
            <span><span className="text-red-400 font-medium">{totalViolations}</span> <span className="text-muted-foreground">violations</span></span>
            <span><span className="text-amber-400 font-medium">{totalOverrides}</span> <span className="text-muted-foreground">overrides</span></span>
            <span className={cn('font-medium', overrideRate > 50 ? 'text-amber-400' : 'text-muted-foreground')}>{overrideRate}% <span className="font-normal text-muted-foreground">override rate</span></span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-4">
        {isLoading ? (
          <div className="flex h-20 items-center justify-center">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : (
          <>
            {/* Charts row */}
            <div className="grid grid-cols-2 gap-4">
              <ViolationsVsOverridesChart byRule={byRule} overrides={overrides} />
              <ViolationTrendChart trend={trend} />
            </div>

            {/* Tables row */}
            <div className="grid grid-cols-2 gap-4">
              {/* Recent violations */}
              <div>
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground/50 mb-1.5 block">Recent Violations</span>
                {recentViolations.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-2">No violations recorded</p>
                ) : (
                  <div className="space-y-0.5">
                    {recentViolations.slice(0, 8).map((v) => {
                      const data = v.data as Record<string, string>;
                      return (
                        <div key={v.id} className="flex items-center justify-between gap-2 rounded px-2 py-0.5 hover:bg-surface-light/30">
                          <span className="text-[11px] font-mono text-red-400 truncate">{data?.rule ?? '-'}</span>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {v.scope_id && <span className="font-mono text-[10px] text-muted-foreground">{String(v.scope_id).padStart(3, '0')}</span>}
                            <span className="text-[10px] text-muted-foreground/50">
                              {v.timestamp ? formatDistanceToNow(new Date(v.timestamp), { addSuffix: true }) : '-'}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Recent overrides */}
              <div>
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground/50 mb-1.5 block">Recent Overrides</span>
                {overrides.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-2">No overrides recorded</p>
                ) : (
                  <div className="space-y-1">
                    {overrides.slice(0, 8).map((o, idx) => (
                      <div key={idx} className="rounded border border-amber-500/20 bg-amber-500/5 px-2 py-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-medium text-amber-400 truncate">{o.rule ?? 'unknown'}</span>
                          <span className="flex-shrink-0 text-[9px] text-muted-foreground/50">
                            {o.date ? formatDistanceToNow(new Date(o.date), { addSuffix: true }) : '-'}
                          </span>
                        </div>
                        {o.reason && <p className="mt-0.5 text-[10px] text-muted-foreground line-clamp-1">{o.reason}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Right Pane: CI Gates ───────────────────────────────────

function CIGatesPane() {
  const { gates, stats, loading } = useGates();

  const totalPassed = stats.reduce((sum, s) => sum + s.passed, 0);
  const totalRuns = stats.reduce((sum, s) => sum + s.total, 0);
  const passRate = totalRuns > 0 ? Math.round((totalPassed / totalRuns) * 100) : 0;
  const passing = gates.filter((g) => g.status === 'pass').length;

  return (
    <Card>
      <CardHeader className="pb-2 pt-3 px-4">
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
      <CardContent className="px-4 pb-4">
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

// ─── Shared Components ──────────────────────────────────────

function SummaryChip({ count, label, color }: { count: number; label: string; color: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className={cn('text-xs font-medium', color)}>{count}</span>
      <span className="text-[10px] text-muted-foreground">{label}</span>
    </span>
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

// ─── Chart: Hook Category Donut ─────────────────────────────

const CATEGORY_DONUT_COLORS: Record<string, string> = {
  guards: '#EF4444',
  gates: '#F59E0B',
  lifecycle: '#3B82F6',
  observers: '#71717A',
};

function HookCategoryDonut({ summary }: { summary: { guards: number; gates: number; lifecycle: number; observers: number } }) {
  const data = [
    { name: 'Guards', value: summary.guards },
    { name: 'Gates', value: summary.gates },
    { name: 'Lifecycle', value: summary.lifecycle },
    { name: 'Observers', value: summary.observers },
  ].filter((d) => d.value > 0);

  const colors = [
    CATEGORY_DONUT_COLORS.guards,
    CATEGORY_DONUT_COLORS.gates,
    CATEGORY_DONUT_COLORS.lifecycle,
    CATEGORY_DONUT_COLORS.observers,
  ];

  const total = data.reduce((sum, d) => sum + d.value, 0);

  return (
    <div className="relative">
      <PieChart width={100} height={100}>
        <Pie
          data={data}
          cx={49}
          cy={49}
          innerRadius={26}
          outerRadius={42}
          paddingAngle={3}
          dataKey="value"
          stroke="none"
        >
          {data.map((_, idx) => <Cell key={idx} fill={colors[idx]} fillOpacity={0.8} />)}
        </Pie>
        <RechartsTooltip contentStyle={TOOLTIP_STYLE} />
      </PieChart>
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <span className="text-sm font-light text-foreground">{total}</span>
      </div>
    </div>
  );
}

// ─── Chart: Violations vs Overrides ─────────────────────────

function ViolationsVsOverridesChart({
  byRule,
  overrides,
}: {
  byRule: Array<{ rule: string; count: number }>;
  overrides: Array<{ rule: string }>;
}) {
  const overrideCountByRule = new Map<string, number>();
  for (const o of overrides) {
    const rule = o.rule ?? 'unknown';
    overrideCountByRule.set(rule, (overrideCountByRule.get(rule) ?? 0) + 1);
  }

  const chartData = byRule.map((r) => ({
    name: String(r.rule ?? 'unknown').slice(0, 18),
    violations: r.count,
    overrides: overrideCountByRule.get(String(r.rule)) ?? 0,
  }));

  const empty = chartData.length === 0;

  return (
    <div>
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground/50 mb-1.5 block">Violations vs Overrides</span>
      {empty ? (
        <ChartEmpty height={120} message="No violation data yet" />
      ) : (
        <ResponsiveContainer width="100%" height={Math.max(120, chartData.length * 24)}>
          <BarChart data={chartData} layout="vertical" margin={{ left: 10, right: 8, top: 0, bottom: 0 }}>
            <XAxis type="number" hide />
            <YAxis dataKey="name" type="category" width={120}
              tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} />
            <RechartsTooltip contentStyle={TOOLTIP_STYLE} />
            <Legend verticalAlign="top" height={20} iconSize={8}
              wrapperStyle={{ fontSize: '10px', color: 'hsl(var(--muted-foreground))' }} />
            <Bar dataKey="violations" stackId="a" fill="#EF4444" fillOpacity={0.8} radius={[0, 0, 0, 0]} />
            <Bar dataKey="overrides" stackId="a" fill="#F59E0B" fillOpacity={0.8} radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

// ─── Chart: Violation Trend ─────────────────────────────────

function ViolationTrendChart({ trend }: { trend: ViolationTrendPoint[] }) {
  const dailyTotals = new Map<string, number>();
  for (const point of trend) {
    dailyTotals.set(point.day, (dailyTotals.get(point.day) ?? 0) + point.count);
  }
  const chartData = [...dailyTotals.entries()]
    .map(([day, count]) => ({ day: day.slice(5), count }))
    .slice(-30);

  const empty = chartData.length < 2;

  return (
    <div>
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground/50 mb-1.5 block">Violation Trend (30d)</span>
      {empty ? (
        <div className="relative">
          <div style={{ height: 120 }} className="opacity-30">
            <ResponsiveContainer width="100%" height={120}>
              <AreaChart data={[{ day: '', count: 0 }]} margin={{ left: 0, right: 10, top: 5, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
                <XAxis dataKey="day" tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis domain={[0, 10]} tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} width={30} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-xs text-muted-foreground">No trend data yet</span>
          </div>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={120}>
          <AreaChart data={chartData} margin={{ left: 0, right: 10, top: 5, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
            <XAxis dataKey="day" tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} />
            <YAxis tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} width={30} />
            <RechartsTooltip contentStyle={TOOLTIP_STYLE} />
            <Area type="monotone" dataKey="count" stroke="#EF4444" fill="#EF444420" strokeWidth={1.5} />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
