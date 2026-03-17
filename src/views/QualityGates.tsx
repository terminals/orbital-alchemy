import { useState, useMemo, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ShieldCheck, ArrowRight, CheckCircle2, XCircle, MinusCircle,
  AlertTriangle, Clock, Terminal, Shield, ShieldAlert, Eye, Cog,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip,
  ResponsiveContainer, Cell, AreaChart, Area, CartesianGrid,
  PieChart, Pie, Legend,
} from 'recharts';
import { useScopes } from '@/hooks/useScopes';
import { useTransitionReadiness } from '@/hooks/useTransitionReadiness';
import { useGates } from '@/hooks/useGates';
import { useViolations } from '@/hooks/useViolations';
import { useEnforcementRules } from '@/hooks/useEnforcementRules';
import { useWorkflow } from '@/hooks/useWorkflow';
import { GateIndicator } from '@/components/GateIndicator';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { Scope, GateStatus, HookStatus, EnforcementRule, ViolationTrendPoint, OrbitalEvent } from '@/types';

function formatGateName(name: string): string {
  return name.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

const ENFORCEMENT_COLORS: Record<string, string> = {
  blocker: 'text-red-400 bg-red-500/10 border-red-500/20',
  advisor: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  operator: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
  silent: 'text-zinc-400 bg-zinc-500/10 border-zinc-500/20',
};

const CATEGORY_LABELS: Record<string, string> = {
  guard: 'GUARD', gate: 'GATE', lifecycle: 'LIFECYCLE', observer: 'OBSERVER',
};

const CATEGORY_ICON: Record<string, typeof Shield> = {
  guard: Shield, gate: ShieldAlert, lifecycle: Cog, observer: Eye,
};

// ─── Main Page ──────────────────────────────────────────────

export function QualityGates() {
  const { scopes } = useScopes();
  const { engine } = useWorkflow();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedScopeId, setSelectedScopeId] = useState<number | null>(() => {
    const param = searchParams.get('scope');
    return param ? Number(param) : null;
  });

  useEffect(() => {
    if (selectedScopeId != null) {
      setSearchParams({ scope: String(selectedScopeId) }, { replace: true });
    }
  }, [selectedScopeId, setSearchParams]);

  const activeScopes = useMemo(() => {
    return scopes
      .filter((s) => !engine.isTerminalStatus(s.status) && s.status !== 'icebox' && !s.is_ghost)
      .sort((a, b) => a.id - b.id);
  }, [scopes, engine]);

  const scopesByStatus = useMemo(() => {
    const map = new Map<string, Scope[]>();
    for (const scope of activeScopes) {
      const existing = map.get(scope.status) ?? [];
      existing.push(scope);
      map.set(scope.status, existing);
    }
    return map;
  }, [activeScopes]);

  const effectiveScopeId = selectedScopeId ?? activeScopes[0]?.id ?? null;
  const { readiness, loading: readinessLoading } = useTransitionReadiness(effectiveScopeId);
  const selectedScope = activeScopes.find((s) => s.id === effectiveScopeId);

  return (
    <div className="flex-1 min-h-0 overflow-y-auto space-y-6">
      {/* ═══ Section 1: Transition Readiness ═══ */}
      <section>
        <div className="mb-4 flex items-center gap-3">
          <ShieldCheck className="h-4 w-4 text-primary" />
          <h1 className="text-xl font-light">Safeguards</h1>
          {readiness && (
            <Badge variant="secondary">
              {readiness.transitions.filter((t) => t.ready).length}/{readiness.transitions.length} ready
            </Badge>
          )}
        </div>

        {/* Scope Selector */}
        <div className="mb-4 flex flex-wrap gap-1.5">
          {engine.getLists()
            .filter((l) => !engine.isTerminalStatus(l.id) && l.id !== 'icebox' && scopesByStatus.has(l.id))
            .map((list) => (
              <div key={list.id} className="flex items-center gap-1">
                <span className="mr-0.5 text-[10px] uppercase tracking-wider text-muted-foreground/50">
                  {list.label}
                </span>
                {(scopesByStatus.get(list.id) ?? []).map((scope) => (
                  <button
                    key={scope.id}
                    onClick={() => setSelectedScopeId(scope.id)}
                    className={cn(
                      'rounded border px-2 py-0.5 text-xs font-mono transition-all',
                      scope.id === effectiveScopeId
                        ? 'border-primary/50 bg-primary/10 text-primary'
                        : 'border-border/50 bg-surface-light/30 text-muted-foreground hover:border-primary/30 hover:text-foreground',
                    )}
                  >
                    {String(scope.id).padStart(3, '0')}
                  </button>
                ))}
                <span className="mx-1.5 text-border">|</span>
              </div>
            ))}
          {activeScopes.length === 0 && (
            <span className="text-xs text-muted-foreground">No active scopes</span>
          )}
        </div>

        {/* Scope Readiness Overview Chart */}
        {activeScopes.length > 0 && (
          <ScopeReadinessOverview
            scopes={activeScopes}
            selectedId={effectiveScopeId}
            onSelect={setSelectedScopeId}
          />
        )}

        {/* Transition Cards + Scope Sidebar */}
        {effectiveScopeId && selectedScope && (
          <div className="grid gap-5 lg:grid-cols-3">
            <div className="lg:col-span-2 space-y-4">
              {readinessLoading ? (
                <div className="flex h-32 items-center justify-center">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                </div>
              ) : readiness && readiness.transitions.length > 0 ? (
                readiness.transitions.map((transition) => (
                  <TransitionCard
                    key={`${transition.from}-${transition.to}`}
                    transition={transition}
                    scopeId={effectiveScopeId}
                  />
                ))
              ) : (
                <Card>
                  <CardContent className="py-8 text-center">
                    <CheckCircle2 className="mx-auto mb-3 h-8 w-8 text-muted-foreground/50" />
                    <p className="text-sm text-muted-foreground">
                      No forward transitions from <span className="font-mono">{selectedScope.status}</span>
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>

            <div className="space-y-4">
              <ScopeInfoCard scope={selectedScope} />
              {readiness && readiness.transitions.length > 0 && readiness.transitions[0].gates.length > 0 && (
                <CIGatesCard gates={readiness.transitions[0].gates} />
              )}
            </div>
          </div>
        )}
      </section>

      {/* ═══ Section 2: Rule Configuration ═══ */}
      <RuleConfigSection />

      {/* ═══ Section 3: Enforcement Activity ═══ */}
      <EnforcementActivitySection />

      {/* ═══ Section 4: CI Gates ═══ */}
      <GlobalCISection />
    </div>
  );
}

// ─── Section: Scope Info ────────────────────────────────────

function ScopeInfoCard({ scope }: { scope: Scope }) {
  const id = String(scope.id).padStart(3, '0');
  const title = scope.title.length > 30 ? scope.title.slice(0, 30) + '...' : scope.title;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-mono">{id} {title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-xs">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Status</span>
          <Badge variant="outline" className="text-[10px]">{scope.status}</Badge>
        </div>
        {scope.priority && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Priority</span>
            <span>{scope.priority}</span>
          </div>
        )}
        {scope.blocked_by.length > 0 && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Blocked by</span>
            <span className="font-mono text-amber-400">
              {scope.blocked_by.map((bid) => String(bid).padStart(3, '0')).join(', ')}
            </span>
          </div>
        )}
        {Object.keys(scope.sessions).length > 0 && (
          <div className="pt-1 border-t border-border/50">
            <span className="text-muted-foreground text-[10px] uppercase tracking-wider">Sessions</span>
            {Object.entries(scope.sessions).map(([key, ids]) => (
              <div key={key} className="flex justify-between mt-1">
                <span className="text-muted-foreground">{key}</span>
                <span className="font-mono text-[10px]">{ids.length} recorded</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CIGatesCard({ gates }: { gates: Array<{ gate_name: string; status: string; duration_ms: number | null }> }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">CI Gates</CardTitle>
      </CardHeader>
      <CardContent className="space-y-0.5">
        {gates.map((gate) => (
          <div key={gate.gate_name} className="flex items-center gap-2 py-0.5">
            <GateIndicator status={gate.status as GateStatus} />
            <span className="flex-1 text-[11px]">{formatGateName(gate.gate_name)}</span>
            {gate.duration_ms != null && (
              <span className="font-mono text-[10px] text-muted-foreground">
                {(gate.duration_ms / 1000).toFixed(1)}s
              </span>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// ─── Section: Transition Card ───────────────────────────────

function TransitionCard({
  transition,
  scopeId,
}: {
  transition: import('@/types').TransitionReadiness;
  scopeId: number;
}) {
  const [dispatching, setDispatching] = useState(false);
  const command = transition.edge.command?.replace('{id}', String(scopeId)) ?? null;

  async function handleDispatch() {
    if (!command) return;
    setDispatching(true);
    try {
      await fetch('/api/orbital/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scope_id: scopeId,
          command,
          transition: { from: transition.from, to: transition.to },
        }),
      });
    } catch {
      // dispatch error
    } finally {
      setDispatching(false);
    }
  }

  return (
    <Card className={cn('transition-all', transition.ready ? 'border-bid-green/20' : 'border-border')}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[10px] font-mono">{transition.from}</Badge>
            <ArrowRight className="h-3 w-3 text-muted-foreground" />
            <Badge variant="outline" className="text-[10px] font-mono">{transition.to}</Badge>
            <span className="text-xs text-muted-foreground ml-1">{transition.edge.label}</span>
          </div>
          <div className="flex items-center gap-2">
            {transition.ready && (
              <Badge className="bg-bid-green/10 text-bid-green border-bid-green/20 text-[10px]">Ready</Badge>
            )}
            {command && transition.edge.dispatchOnly && (
              <Button
                size="sm"
                variant={transition.ready ? 'default' : 'outline'}
                className="h-6 text-[11px] gap-1"
                disabled={!transition.ready || dispatching}
                onClick={handleDispatch}
              >
                <Terminal className="h-3 w-3" />
                {dispatching ? 'Dispatching...' : 'Dispatch'}
              </Button>
            )}
          </div>
        </div>
        {command && (
          <code className="text-[10px] font-mono text-muted-foreground/60 mt-1">{command}</code>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {transition.hooks.length > 0 && (
          <div>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground/50 mb-1.5 block">
              Workflow Hooks
            </span>
            <div className="space-y-1">
              {transition.hooks.map((hook) => (
                <HookStatusRow key={hook.id} hook={hook} />
              ))}
            </div>
          </div>
        )}
        {transition.edge.checklist && transition.edge.checklist.length > 0 && (
          <div>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground/50 mb-1.5 block">Checklist</span>
            <div className="space-y-1">
              {transition.edge.checklist.map((item, idx) => (
                <div key={idx} className="flex items-start gap-2 text-xs text-muted-foreground">
                  <MinusCircle className="h-3 w-3 mt-0.5 flex-shrink-0 text-muted-foreground/40" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {transition.blockers.length > 0 && (
          <div className="rounded border border-red-500/20 bg-red-500/5 p-2">
            <div className="flex items-center gap-1.5 mb-1">
              <AlertTriangle className="h-3 w-3 text-red-400" />
              <span className="text-[10px] font-medium text-red-400">
                {transition.blockers.length} Blocker{transition.blockers.length !== 1 ? 's' : ''}
              </span>
            </div>
            {transition.blockers.map((blocker, idx) => (
              <p key={idx} className="text-[11px] text-red-400/80 ml-4.5">{blocker}</p>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function HookStatusRow({ hook }: { hook: HookStatus }) {
  const statusIcon = hook.status === 'pass'
    ? <CheckCircle2 className="h-3.5 w-3.5 text-bid-green" />
    : hook.status === 'fail'
      ? <XCircle className="h-3.5 w-3.5 text-red-400" />
      : <MinusCircle className="h-3.5 w-3.5 text-muted-foreground/50" />;

  return (
    <div className="flex items-center gap-2 rounded px-2 py-1 hover:bg-surface-light/50">
      {statusIcon}
      <span className="flex-1 text-xs">{hook.label}</span>
      <Badge
        variant="outline"
        className={cn('text-[9px] px-1.5 py-0 h-4 border', ENFORCEMENT_COLORS[hook.enforcement])}
      >
        {CATEGORY_LABELS[hook.category]}
      </Badge>
      {hook.reason && (
        <span className="text-[10px] text-muted-foreground/60 max-w-[200px] truncate">{hook.reason}</span>
      )}
    </div>
  );
}

// ─── Section: Rule Configuration ────────────────────────────

function RuleConfigSection() {
  const { data: rulesData, loading } = useEnforcementRules();

  if (loading || !rulesData || rulesData.rules.length === 0) return null;

  return (
    <section>
      <div className="mb-3 flex items-center gap-3">
        <Shield className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-base font-light">Rule Configuration</h2>
      </div>

      {/* Summary strip + Donut */}
      <div className="mb-4 grid gap-4 lg:grid-cols-4">
        <div className="lg:col-span-3 flex flex-wrap items-center gap-3 rounded-lg border border-border/50 bg-surface-light/20 px-4 py-2 self-start">
          <SummaryChip count={rulesData.summary.guards} label="guards" color="text-red-400" />
          <SummaryChip count={rulesData.summary.gates} label="gates" color="text-amber-400" />
          <SummaryChip count={rulesData.summary.lifecycle} label="lifecycle" color="text-cyan-400" />
          <SummaryChip count={rulesData.summary.observers} label="observers" color="text-zinc-400" />
          <span className="text-border">|</span>
          <span className="text-xs text-muted-foreground">
            {rulesData.totalEdges} edge{rulesData.totalEdges !== 1 ? 's' : ''}
          </span>
        </div>
        <Card className="flex items-center justify-center">
          <CardContent className="p-2">
            <HookCategoryDonut summary={rulesData.summary} />
          </CardContent>
        </Card>
      </div>

      {/* Matrix */}
      <Card>
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
    </section>
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
        <Badge variant="outline" className={cn('text-[9px] border', ENFORCEMENT_COLORS[rule.enforcement])}>
          {rule.hook.category}
        </Badge>
      </td>
      <td className="px-4 py-2">
        <span className={cn('text-[10px]', ENFORCEMENT_COLORS[rule.enforcement]?.split(' ')[0])}>
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

// ─── Section: Enforcement Activity ──────────────────────────

function EnforcementActivitySection() {
  const { byRule, overrides, totalViolations, totalOverrides, loading: violationsLoading } = useViolations();
  const { trend, loading: trendLoading } = useEnforcementRules();

  const [recentViolations, setRecentViolations] = useState<OrbitalEvent[]>([]);
  const fetchRecent = useCallback(async () => {
    try {
      const res = await fetch('/api/orbital/events?type=VIOLATION&limit=15');
      if (res.ok) setRecentViolations(await res.json());
    } catch { /* ok */ }
  }, []);
  useEffect(() => { fetchRecent(); }, [fetchRecent]);

  const overrideRate = (totalViolations + totalOverrides) > 0
    ? Math.round((totalOverrides / (totalViolations + totalOverrides)) * 100) : 0;

  const isLoading = violationsLoading || trendLoading;

  return (
    <section>
      {/* Header with inline stats */}
      <div className="mb-3 flex items-center gap-3 flex-wrap">
        <ShieldAlert className="h-4 w-4 text-red-400" />
        <h2 className="text-base font-light">Enforcement Activity</h2>
        <div className="flex items-center gap-3 ml-auto text-xs">
          <span><span className="text-red-400 font-medium">{totalViolations}</span> <span className="text-muted-foreground">violations</span></span>
          <span><span className="text-amber-400 font-medium">{totalOverrides}</span> <span className="text-muted-foreground">overrides</span></span>
          <span className={cn('font-medium', overrideRate > 50 ? 'text-amber-400' : 'text-muted-foreground')}>{overrideRate}% <span className="font-normal text-muted-foreground">override rate</span></span>
        </div>
      </div>

      {isLoading ? (
        <div className="flex h-20 items-center justify-center">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Left: charts */}
          <div className="space-y-4">
            <ViolationsVsOverridesChart byRule={byRule} overrides={overrides} />
            <ViolationTrendChart trend={trend} />
          </div>

          {/* Right: tables */}
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-1"><CardTitle className="text-sm">Recent Violations</CardTitle></CardHeader>
              <CardContent className={recentViolations.length > 0 ? 'p-0' : undefined}>
                {recentViolations.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-3">No violations recorded</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-border text-left text-[10px] text-muted-foreground uppercase tracking-wider">
                          <th className="px-3 py-1.5 font-medium">Rule</th>
                          <th className="px-3 py-1.5 font-medium">Scope</th>
                          <th className="px-3 py-1.5 font-medium">Outcome</th>
                          <th className="px-3 py-1.5 font-medium text-right">Time</th>
                        </tr>
                      </thead>
                      <tbody>
                        {recentViolations.map((v) => {
                          const data = v.data as Record<string, string>;
                          return (
                            <tr key={v.id} className="border-b border-border/30 last:border-0 hover:bg-surface-light/30">
                              <td className="px-3 py-1 font-mono text-red-400">{data?.rule ?? '-'}</td>
                              <td className="px-3 py-1 font-mono text-muted-foreground">
                                {v.scope_id ? String(v.scope_id).padStart(3, '0') : '-'}
                              </td>
                              <td className="px-3 py-1">
                                <Badge variant="outline" className="text-[9px] border-red-500/30 text-red-400">
                                  {data?.outcome ?? 'blocked'}
                                </Badge>
                              </td>
                              <td className="px-3 py-1 text-right text-muted-foreground/60">
                                {v.timestamp ? formatDistanceToNow(new Date(v.timestamp), { addSuffix: true }) : '-'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-1"><CardTitle className="text-sm">Recent Overrides</CardTitle></CardHeader>
              <CardContent>
                {overrides.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-3">No overrides recorded</p>
                ) : (
                  <div className="space-y-1.5">
                    {overrides.slice(0, 8).map((o, idx) => (
                      <div key={idx} className="rounded border border-amber-500/20 bg-amber-500/5 px-2.5 py-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-medium text-amber-400">{o.rule ?? 'unknown'}</span>
                          <span className="flex-shrink-0 text-[9px] text-muted-foreground/50">
                            {o.date ? formatDistanceToNow(new Date(o.date), { addSuffix: true }) : '-'}
                          </span>
                        </div>
                        {o.reason && <p className="mt-0.5 text-[10px] text-muted-foreground line-clamp-1">{o.reason}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </section>
  );
}

// ─── Section: Global CI ─────────────────────────────────────

function GlobalCISection() {
  const { gates, stats, loading } = useGates();

  const totalPassed = stats.reduce((sum, s) => sum + s.passed, 0);
  const totalRuns = stats.reduce((sum, s) => sum + s.total, 0);
  const passRate = totalRuns > 0 ? Math.round((totalPassed / totalRuns) * 100) : 0;
  const passing = gates.filter((g) => g.status === 'pass').length;

  return (
    <section>
      {/* Header with inline pass rate */}
      <div className="mb-3 flex items-center gap-3 flex-wrap">
        <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-base font-light">CI Gates</h2>
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

      {loading ? (
        <div className="flex h-20 items-center justify-center">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Latest run */}
          <Card>
            <CardHeader className="pb-1"><CardTitle className="text-sm">Latest Run</CardTitle></CardHeader>
            <CardContent>
              {gates.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-3">
                  No gate results yet. Run <code className="rounded bg-muted px-1">/test-checks</code> to populate.
                </p>
              ) : (
                <div className="space-y-0.5">
                  {gates.map((gate) => (
                    <div key={gate.id} className="flex items-center gap-3 rounded px-2 py-0.5 hover:bg-surface-light/50">
                      <GateIndicator status={gate.status as GateStatus} />
                      <span className="flex-1 text-[11px]">{formatGateName(gate.gate_name)}</span>
                      {gate.duration_ms != null && (
                        <span className="font-mono text-[10px] text-muted-foreground">{(gate.duration_ms / 1000).toFixed(1)}s</span>
                      )}
                      <span className="text-[10px] text-muted-foreground/50">
                        <Clock className="inline h-2.5 w-2.5 mr-0.5" />
                        {formatDistanceToNow(new Date(gate.run_at), { addSuffix: true })}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Charts: history + duration */}
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-1"><CardTitle className="text-sm">Gate History</CardTitle></CardHeader>
              <CardContent>
                {stats.length === 0 ? (
                  <ChartEmpty height={120} message="No history data" />
                ) : (
                  <ResponsiveContainer width="100%" height={Math.max(120, stats.length * 18)}>
                    <BarChart
                      data={stats.map((s) => ({ name: s.gate_name.replace(/-/g, ' ').slice(0, 12), passed: s.passed, failed: s.failed }))}
                      layout="vertical" margin={{ left: 0, right: 10, top: 0, bottom: 0 }}
                    >
                      <XAxis type="number" hide />
                      <YAxis dataKey="name" type="category" width={85}
                        tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} />
                      <RechartsTooltip contentStyle={{
                        background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))',
                        borderRadius: '6px', fontSize: '11px',
                      }} />
                      <Bar dataKey="passed" stackId="a" radius={[0, 0, 0, 0]}>
                        {stats.map((_, idx) => <Cell key={idx} fill="#00c853" />)}
                      </Bar>
                      <Bar dataKey="failed" stackId="a" radius={[0, 4, 4, 0]}>
                        {stats.map((_, idx) => <Cell key={idx} fill="#ff1744" />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-1"><CardTitle className="text-sm">Gate Duration</CardTitle></CardHeader>
              <CardContent>
                {!gates.some((g) => g.duration_ms != null) ? (
                  <ChartEmpty height={120} message="No duration data" />
                ) : (
                  <ResponsiveContainer width="100%" height={Math.max(120, gates.filter((g) => g.duration_ms != null).length * 18)}>
                    <BarChart
                      data={gates
                        .filter((g) => g.duration_ms != null)
                        .map((g) => ({
                          name: g.gate_name.replace(/-/g, ' ').slice(0, 12),
                          seconds: Number((g.duration_ms! / 1000).toFixed(1)),
                          status: g.status,
                        }))}
                      layout="vertical" margin={{ left: 0, right: 10, top: 0, bottom: 0 }}
                    >
                      <XAxis type="number" unit="s" tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} />
                      <YAxis dataKey="name" type="category" width={85}
                        tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} />
                      <RechartsTooltip
                        formatter={(val: number) => [`${val}s`, 'Duration']}
                        contentStyle={{
                          background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))',
                          borderRadius: '6px', fontSize: '11px',
                        }}
                      />
                      <Bar dataKey="seconds" radius={[0, 4, 4, 0]}>
                        {gates.filter((g) => g.duration_ms != null).map((g, idx) => (
                          <Cell key={idx} fill={g.status === 'pass' ? '#00c85340' : g.status === 'fail' ? '#ff174440' : '#06b6d440'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </section>
  );
}

// ─── Shared Components ──────────────────────────────────────

function SummaryChip({ count, label, color }: { count: number; label: string; color: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className={cn('text-sm font-medium', color)}>{count}</span>
      <span className="text-[11px] text-muted-foreground">{label}</span>
    </span>
  );
}


// ─── Chart: Scope Readiness Overview ────────────────────────

function ScopeReadinessOverview({
  scopes,
}: {
  scopes: Scope[];
  selectedId: number | null;
  onSelect: (id: number) => void;
}) {
  // For each scope, we show a mini readiness indicator
  // Fetch readiness for all active scopes would be expensive,
  // so we show a distribution bar based on scope status position in the workflow
  const { engine } = useWorkflow();
  const lists = engine.getLists().filter((l) => !engine.isTerminalStatus(l.id) && l.id !== 'icebox');
  const statusCounts = new Map<string, number>();
  for (const scope of scopes) {
    statusCounts.set(scope.status, (statusCounts.get(scope.status) ?? 0) + 1);
  }

  const chartData = lists
    .filter((l) => statusCounts.has(l.id))
    .map((l) => ({
      name: l.label,
      count: statusCounts.get(l.id) ?? 0,
      color: l.hex,
    }));

  if (chartData.length === 0) return null;

  return (
    <Card className="mb-4">
      <CardHeader className="pb-1">
        <CardTitle className="text-sm">Scope Distribution</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={100}>
          <BarChart data={chartData} margin={{ left: 0, right: 10, top: 5, bottom: 0 }}>
            <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} width={20} />
            <RechartsTooltip
              contentStyle={{
                background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))',
                borderRadius: '6px', fontSize: '11px',
              }}
            />
            <Bar dataKey="count" radius={[4, 4, 0, 0]}>
              {chartData.map((d, idx) => <Cell key={idx} fill={d.color} fillOpacity={0.7} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
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
      <ResponsiveContainer width={120} height={120}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={32}
            outerRadius={50}
            paddingAngle={3}
            dataKey="value"
            stroke="none"
          >
            {data.map((_, idx) => <Cell key={idx} fill={colors[idx]} fillOpacity={0.8} />)}
          </Pie>
          <RechartsTooltip
            contentStyle={{
              background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))',
              borderRadius: '6px', fontSize: '11px',
            }}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <span className="text-lg font-light text-foreground">{total}</span>
      </div>
    </div>
  );
}

// ─── Empty overlay for charts ───────────────────────────────

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
    name: String(r.rule ?? 'unknown').slice(0, 22),
    violations: r.count,
    overrides: overrideCountByRule.get(String(r.rule)) ?? 0,
  }));

  const empty = chartData.length === 0;

  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm">Violations vs Overrides by Rule</CardTitle></CardHeader>
      <CardContent>
        {empty ? (
          <ChartEmpty height={120} message="No violation data yet" />
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(140, chartData.length * 30)}>
            <BarChart data={chartData} layout="vertical" margin={{ left: 10, right: 20, top: 0, bottom: 0 }}>
              <XAxis type="number" hide />
              <YAxis dataKey="name" type="category" width={150}
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
              <RechartsTooltip contentStyle={{
                background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))',
                borderRadius: '6px', fontSize: '11px',
              }} />
              <Legend verticalAlign="top" height={24} iconSize={8}
                wrapperStyle={{ fontSize: '10px', color: 'hsl(var(--muted-foreground))' }} />
              <Bar dataKey="violations" stackId="a" fill="#EF4444" fillOpacity={0.8} radius={[0, 0, 0, 0]} />
              <Bar dataKey="overrides" stackId="a" fill="#F59E0B" fillOpacity={0.8} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
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
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm">Violation Trend (30d)</CardTitle></CardHeader>
      <CardContent>
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
        )}
      </CardContent>
    </Card>
  );
}
