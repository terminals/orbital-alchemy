import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ShieldCheck, ArrowRight, CheckCircle2, Clock, Shield, ShieldAlert, Eye, Cog,
  GitCommit, Play, Square, AlertTriangle, Zap, FileText, TerminalSquare,
  Wrench, CheckCheck, XCircle,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip,
  ResponsiveContainer, Cell, AreaChart, Area, CartesianGrid,
} from 'recharts';
import { useGates } from '@/hooks/useGates';
import { useViolations } from '@/hooks/useViolations';
import { useEnforcementRules } from '@/hooks/useEnforcementRules';
import { useScopes } from '@/hooks/useScopes';
import { useProjectUrl } from '@/hooks/useProjectUrl';
import { ProjectTabBar } from '@/components/ProjectTabBar';
import { GateIndicator } from '@/components/GateIndicator';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { socket } from '@/socket';
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

// ─── Event type display config ──────────────────────────────

const EVENT_CONFIG: Record<string, { icon: typeof Shield; color: string; label: string }> = {
  VIOLATION:                { icon: AlertTriangle, color: 'text-red-400',           label: 'Violation' },
  OVERRIDE:                 { icon: ShieldAlert,   color: 'text-amber-400',         label: 'Override' },
  GATE_PASSED:              { icon: CheckCircle2,  color: 'text-green-400',         label: 'Gate passed' },
  GATE_FAILED:              { icon: XCircle,       color: 'text-red-400',           label: 'Gate failed' },
  ALL_GATES_PASSED:         { icon: CheckCheck,    color: 'text-green-400',         label: 'All gates passed' },
  SCOPE_STATUS_CHANGED:     { icon: Zap,           color: 'text-cyan-400',          label: 'Status changed' },
  SCOPE_TRANSITION:         { icon: ArrowRight,    color: 'text-cyan-400',          label: 'Transition' },
  SCOPE_GATE_LIFTED:        { icon: Shield,        color: 'text-cyan-400',          label: 'Gate lifted' },
  COMMIT:                   { icon: GitCommit,     color: 'text-foreground',        label: 'Commit' },
  SESSION_START:            { icon: Play,          color: 'text-green-400',         label: 'Session started' },
  SESSION_END:              { icon: Square,        color: 'text-muted-foreground',  label: 'Session ended' },
  AGENT_STARTED:            { icon: Zap,           color: 'text-purple-400',        label: 'Agent started' },
  AGENT_COMPLETED:          { icon: CheckCircle2,  color: 'text-purple-400',        label: 'Agent completed' },
  SCOPE_CREATED:            { icon: FileText,      color: 'text-cyan-400',          label: 'Scope created' },
  SCOPE_COMPLETED:          { icon: CheckCircle2,  color: 'text-green-400',         label: 'Scope completed' },
  DISPATCH:                 { icon: TerminalSquare, color: 'text-cyan-400',         label: 'Dispatch' },
  REVIEW_FIXES_COMPLETED:   { icon: Wrench,        color: 'text-purple-400',        label: 'Review fixes' },
  SKILL_INVOKED:            { icon: Zap,           color: 'text-foreground',        label: 'Skill invoked' },
  SKILL_COMPLETED:          { icon: CheckCircle2,  color: 'text-foreground',        label: 'Skill completed' },
};

// ─── Main Page ──────────────────────────────────────────────

export function QualityGates() {
  return (
    <div className="flex flex-1 min-h-0 flex-col">
      <ProjectTabBar />
      <div className="mb-3 flex items-center gap-3">
        <ShieldCheck className="h-4 w-4 text-primary" />
        <h1 className="text-xl font-light">Guards</h1>
      </div>
      <div className="flex flex-1 min-h-0 gap-4">
        {/* Left pane — Rules */}
        <div className="flex w-1/2 min-w-0 flex-col overflow-y-auto rounded-lg border border-border/50">
          <RulesPane />
        </div>
        {/* Right pane — Activity + CI */}
        <div className="flex w-1/2 min-w-0 flex-col space-y-4">
          <ActivityPane />
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
      {/* Header strip with summary */}
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

// ─── Right Pane: Activity ──────────────────────────────────

/** Event type filter categories */
const EVENT_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'workflow', label: 'Workflow', types: new Set(['SCOPE_STATUS_CHANGED', 'SCOPE_TRANSITION', 'SCOPE_GATE_LIFTED', 'SCOPE_CREATED', 'SCOPE_COMPLETED', 'DISPATCH']) },
  { key: 'enforcement', label: 'Enforcement', types: new Set(['VIOLATION', 'OVERRIDE', 'GATE_PASSED', 'GATE_FAILED', 'ALL_GATES_PASSED', 'REVIEW_FIXES_COMPLETED']) },
  { key: 'sessions', label: 'Sessions', types: new Set(['SESSION_START', 'SESSION_END', 'AGENT_STARTED', 'AGENT_COMPLETED', 'COMMIT', 'SKILL_INVOKED', 'SKILL_COMPLETED']) },
] as const;

function ActivityPane() {
  const buildUrl = useProjectUrl();
  const { scopes } = useScopes();
  const { totalViolations, totalOverrides, loading: violationsLoading } = useViolations();
  const { trend, loading: trendLoading } = useEnforcementRules();

  const [events, setEvents] = useState<OrbitalEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');
  const [resumingSession, setResumingSession] = useState<string | null>(null);

  const fetchEvents = useCallback(async () => {
    try {
      const res = await fetch(buildUrl('/events?limit=50'));
      if (res.ok) setEvents(await res.json());
    } catch { /* ok */ }
    finally { setEventsLoading(false); }
  }, [buildUrl]);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  useEffect(() => {
    const handler = () => { fetchEvents(); };
    socket.on('event:new', handler);
    return () => { socket.off('event:new', handler); };
  }, [fetchEvents]);

  // Scope title lookup
  const scopeMap = useMemo(() => {
    const map = new Map<number, string>();
    for (const s of scopes) map.set(s.id, s.title);
    return map;
  }, [scopes]);

  // Filter events
  const filteredEvents = useMemo(() => {
    const filterDef = EVENT_FILTERS.find((f) => f.key === filter);
    if (!filterDef || filter === 'all') return events;
    return events.filter((e) => (filterDef as { types: Set<string> }).types.has(e.type));
  }, [events, filter]);

  const overrideRate = (totalViolations + totalOverrides) > 0
    ? Math.round((totalOverrides / (totalViolations + totalOverrides)) * 100) : 0;

  const isLoading = violationsLoading || trendLoading || eventsLoading;

  // Resume session handler
  async function handleResume(sessionId: string) {
    setResumingSession(sessionId);
    try {
      // Fetch session to get claude_session_id
      const detailRes = await fetch(buildUrl(`/sessions/${sessionId}/content`));
      if (!detailRes.ok) return;
      const detail = await detailRes.json();
      if (!detail.claude_session_id) return;
      await fetch(buildUrl(`/sessions/${sessionId}/resume`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ claude_session_id: detail.claude_session_id }),
      });
    } catch { /* ok */ }
    finally { setTimeout(() => setResumingSession(null), 2000); }
  }

  return (
    <Card className="flex-1 min-h-0 flex flex-col">
      <CardHeader className="pb-2 pt-3 px-4 shrink-0">
        <div className="flex items-center gap-2 flex-wrap">
          <ShieldAlert className="h-3.5 w-3.5 text-red-400" />
          <CardTitle className="text-sm font-medium">Activity</CardTitle>
          <div className="flex items-center gap-3 ml-auto text-xs">
            <span><span className="text-red-400 font-medium">{totalViolations}</span> <span className="text-muted-foreground">violations</span></span>
            <span><span className="text-amber-400 font-medium">{totalOverrides}</span> <span className="text-muted-foreground">overrides</span></span>
            {(totalViolations + totalOverrides) > 0 && (
              <span className={cn('font-medium', overrideRate > 50 ? 'text-amber-400' : 'text-muted-foreground')}>{overrideRate}%</span>
            )}
          </div>
        </div>
        {/* Filter pills */}
        <div className="flex gap-1 mt-2">
          {EVENT_FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                'rounded-full px-2.5 py-0.5 text-[10px] font-medium transition-colors',
                filter === f.key
                  ? 'bg-primary/15 text-primary border border-primary/30'
                  : 'text-muted-foreground hover:text-foreground hover:bg-surface-light/50 border border-transparent',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4 flex-1 min-h-0 overflow-y-auto space-y-3">
        {isLoading ? (
          <div className="flex h-20 items-center justify-center">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : (
          <>
            <ViolationTrendChart trend={trend} />

            {filteredEvents.length === 0 ? (
              <p className="text-xs text-muted-foreground py-4 text-center">No events recorded yet</p>
            ) : (
              <div className="space-y-px">
                {filteredEvents.map((event) => (
                  <EventRow
                    key={event.id}
                    event={event}
                    scopeTitle={event.scope_id ? scopeMap.get(event.scope_id) ?? null : null}
                    onResume={event.session_id ? () => handleResume(event.session_id!) : undefined}
                    resuming={resumingSession === event.session_id}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function EventRow({ event, scopeTitle, onResume, resuming }: {
  event: OrbitalEvent;
  scopeTitle: string | null;
  onResume?: () => void;
  resuming?: boolean;
}) {
  const config = EVENT_CONFIG[event.type] ?? { icon: Zap, color: 'text-muted-foreground', label: event.type };
  const Icon = config.icon;
  const data = (event.data ?? {}) as Record<string, unknown>;

  return (
    <div className="flex items-center gap-2 rounded px-2 py-1 hover:bg-surface-light/30 group border-l-2 border-transparent hover:border-primary/20">
      <Icon className={cn('h-3.5 w-3.5 shrink-0', config.color)} />
      <span className={cn('text-[11px] font-medium shrink-0', config.color)}>{config.label}</span>
      {event.scope_id && (
        <Badge variant="outline" className="text-[9px] font-mono px-1.5 py-0 h-4 gap-1 border-border/50 shrink-0">
          #{String(event.scope_id).padStart(3, '0')}
          {scopeTitle && (
            <span className="font-sans text-muted-foreground truncate max-w-[120px]">{scopeTitle}</span>
          )}
        </Badge>
      )}
      <EventTags type={event.type} data={data} />
      <span className="flex-1 min-w-0">
        <EventDescription type={event.type} data={data} />
      </span>
      {/* Right side: resume button + time */}
      <div className="flex items-center gap-1.5 shrink-0">
        {onResume && (
          <Button
            size="sm"
            variant="ghost"
            className="h-5 px-1.5 text-[10px] gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={onResume}
            disabled={resuming}
          >
            <Play className="h-2.5 w-2.5" />
            {resuming ? 'Opening...' : 'Resume'}
          </Button>
        )}
        <span className="text-[9px] text-muted-foreground/40 tabular-nums whitespace-nowrap">
          {event.timestamp ? formatDistanceToNow(new Date(event.timestamp), { addSuffix: true }) : ''}
        </span>
      </div>
    </div>
  );
}

/** Inline tag badges for key event metadata */
function EventTags({ type, data }: { type: string; data: Record<string, unknown> }) {
  const tags: Array<{ label: string; color?: string }> = [];

  if (data.rule) tags.push({ label: String(data.rule), color: 'border-red-500/30 text-red-400' });
  if (data.outcome === 'blocked') tags.push({ label: 'blocked', color: 'border-red-500/30 text-red-400' });
  if (data.outcome === 'overridden') tags.push({ label: 'overridden', color: 'border-amber-500/30 text-amber-400' });
  if (data.verdict === 'PASS') tags.push({ label: 'PASS', color: 'border-green-500/30 text-green-400' });
  if (data.verdict === 'FAIL') tags.push({ label: 'FAIL', color: 'border-red-500/30 text-red-400' });
  if (type === 'COMMIT' && data.hash) tags.push({ label: String(data.hash).slice(0, 7) });
  if (type === 'DISPATCH' && data.command) tags.push({ label: String(data.command) });
  if (type === 'SCOPE_GATE_LIFTED' && data.mode) tags.push({ label: String(data.mode) });
  if (type === 'AGENT_COMPLETED' && data.action) tags.push({ label: String(data.action) });
  if (type === 'SKILL_INVOKED' && data.skill) tags.push({ label: String(data.skill) });

  if (tags.length === 0) return null;

  return (
    <>
      {tags.map((tag, idx) => (
        <Badge key={idx} variant="outline" className={cn('text-[9px] px-1 py-0 h-3.5 font-mono', tag.color ?? 'border-border/50')}>
          {tag.label}
        </Badge>
      ))}
    </>
  );
}

/** Rich second-line description based on event type and data */
function EventDescription({ type, data }: { type: string; data: Record<string, unknown> }) {
  let text: string | null = null;

  switch (type) {
    case 'VIOLATION':
      text = [data.details, data.file].filter(Boolean).join(' \u2014 ') || null;
      break;
    case 'OVERRIDE':
      text = data.reason ? String(data.reason) : null;
      break;
    case 'SCOPE_STATUS_CHANGED':
    case 'SCOPE_TRANSITION': {
      const from = data.from ? String(data.from) : null;
      const to = data.to ? String(data.to) : null;
      const name = data.scope_name ? String(data.scope_name) : null;
      const parts: string[] = [];
      if (from && to) parts.push(`${from} \u2192 ${to}`);
      else if (to) parts.push(`\u2192 ${to}`);
      if (name) parts.push(name);
      text = parts.join(' \u2014 ') || null;
      break;
    }
    case 'COMMIT':
      text = data.message ? String(data.message).slice(0, 100) : null;
      break;
    case 'AGENT_COMPLETED': {
      const parts: string[] = [];
      if (data.outcome) parts.push(String(data.outcome));
      if (data.commit_hash) parts.push(`commit ${String(data.commit_hash).slice(0, 7)}`);
      text = parts.join(' \u2014 ') || null;
      break;
    }
    case 'AGENT_STARTED':
      text = data.agents ? String(data.agents) : data.mode ? String(data.mode) : null;
      break;
    case 'REVIEW_FIXES_COMPLETED': {
      const total = data.findings_total;
      const fixed = data.findings_fixed;
      const agents = data.agents_used;
      text = total != null ? `${fixed}/${total} findings fixed${agents ? ` by ${agents} agents` : ''}` : null;
      break;
    }
    case 'GATE_PASSED':
    case 'GATE_FAILED':
      text = data.gate_name ? formatGateName(String(data.gate_name)) : null;
      break;
    case 'DISPATCH':
      text = null; // command shown as tag
      break;
    case 'SESSION_START':
      text = data.source ? `source: ${data.source}` : null;
      break;
    case 'SCOPE_GATE_LIFTED':
      text = data.scope_file ? String(data.scope_file).split('/').pop() ?? null : null;
      break;
    default:
      text = (data.details || data.message) ? String(data.details || data.message).slice(0, 100) : null;
  }

  if (!text) return null;

  return <p className="text-[10px] text-muted-foreground truncate">{text}</p>;
}

// ─── Right Pane: CI Gates ───────────────────────────────────

function CIGatesPane() {
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

// ─── Chart: Violation Trend ─────────────────────────────────

function ViolationTrendChart({ trend }: { trend: ViolationTrendPoint[] }) {
  const dailyTotals = new Map<string, number>();
  for (const point of trend) {
    dailyTotals.set(point.day, (dailyTotals.get(point.day) ?? 0) + point.count);
  }
  const chartData = [...dailyTotals.entries()]
    .map(([day, count]) => ({ day: day.slice(5), count }))
    .slice(-30);

  if (chartData.length < 2) return null;

  return (
    <div>
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground/50 mb-1.5 block">Violation Trend (30d)</span>
      <ResponsiveContainer width="100%" height={100}>
        <AreaChart data={chartData} margin={{ left: 0, right: 10, top: 5, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
          <XAxis dataKey="day" tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} />
          <YAxis tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} width={30} />
          <RechartsTooltip contentStyle={TOOLTIP_STYLE} />
          <Area type="monotone" dataKey="count" stroke="#EF4444" fill="#EF444420" strokeWidth={1.5} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
