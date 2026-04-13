import { useMemo } from 'react';
import {
  Shield, Zap, Bot,
  ChevronRight, Clock,
} from 'lucide-react';
import type {
  WorkflowEdge, HookCategory, UnifiedHook, CcHookEvent,
} from '../../../shared/workflow-config';
import { HookExecutionLog } from './HookExecutionLog';
import { CATEGORY_CONFIG } from '@/lib/workflow-constants';

// ─── Types ──────────────────────────────────────────

interface HooksDashboardProps {
  hooks: UnifiedHook[];
  edges: WorkflowEdge[];
  onHookClick: (hook: UnifiedHook) => void;
}

interface MatcherGroup {
  matcher: string;
  hooks: UnifiedHook[];
}

const CATEGORY_ORDER: HookCategory[] = ['guard', 'gate', 'lifecycle', 'observer'];

const CC_EVENT_ORDER: CcHookEvent[] = ['SessionStart', 'PreToolUse', 'PostToolUse', 'SessionEnd'];

const CC_EVENT_COLORS: Record<CcHookEvent, string> = {
  SessionStart: '#22c55e',
  PreToolUse: '#eab308',
  PostToolUse: '#3b82f6',
  SessionEnd: '#ef4444',
};

// ─── Component ──────────────────────────────────────────

export function HooksDashboard({ hooks, edges, onHookClick }: HooksDashboardProps) {
  // Split hooks into workflow (including shared) and CC-only
  const { workflowHooks, ccOnlyHooks, stats } = useMemo(() => {
    const wf: UnifiedHook[] = [];
    const cc: UnifiedHook[] = [];
    let sharedCount = 0;

    for (const h of hooks) {
      if (h.source === 'workflow' || h.source === 'both') {
        wf.push(h);
        if (h.source === 'both') sharedCount++;
      } else {
        cc.push(h);
      }
    }

    const edgesWithHooks = edges.filter((e) => (e.hooks ?? []).length > 0).length;

    return {
      workflowHooks: wf,
      ccOnlyHooks: cc,
      stats: {
        total: hooks.length,
        workflow: wf.length,
        ccOnly: cc.length,
        shared: sharedCount,
        edgesWithHooks,
      },
    };
  }, [hooks, edges]);

  // Group workflow hooks by category
  const categoryGroups = useMemo(() => {
    const groups = new Map<HookCategory, UnifiedHook[]>();
    for (const h of workflowHooks) {
      if (!h.workflow) continue;
      const cat = h.workflow.category;
      const arr = groups.get(cat);
      if (arr) arr.push(h);
      else groups.set(cat, [h]);
    }
    return groups;
  }, [workflowHooks]);

  // Group CC-only hooks by event, then by matcher within each event
  const eventGroups = useMemo(() => {
    const groups = new Map<CcHookEvent, MatcherGroup[]>();
    for (const h of ccOnlyHooks) {
      if (!h.ccTriggers?.length) continue;
      // Use the first trigger's event as the primary grouping
      const primaryTrigger = h.ccTriggers[0];
      const event = primaryTrigger.event;
      const matcher = primaryTrigger.matcher ?? '(all)';

      if (!groups.has(event)) groups.set(event, []);
      const matcherGroups = groups.get(event)!;
      const existing = matcherGroups.find((g) => g.matcher === matcher);
      if (existing) existing.hooks.push(h);
      else matcherGroups.push({ matcher, hooks: [h] });
    }
    return groups;
  }, [ccOnlyHooks]);

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-6">
      {/* Stats Bar */}
      <StatsBar stats={stats} />

      {/* Transition Enforcement Section */}
      <section>
        <div className="mb-3 flex items-center gap-2">
          <Shield className="h-4 w-4 text-orange-400" />
          <h2 className="text-sm font-medium text-zinc-200">Transition Enforcement</h2>
          <span className="text-[10px] text-zinc-500">
            {workflowHooks.length} hooks on {stats.edgesWithHooks} edges
          </span>
        </div>
        <p className="mb-4 text-[11px] text-zinc-500">
          Hooks that fire during scope transitions
        </p>

        <div className="flex flex-col md:flex-row gap-3 md:gap-1 items-stretch">
          {/* BEFORE label — vertical on desktop, horizontal pill on narrow */}
          <div className="md:flex md:items-center hidden">
            <span className="rounded-l bg-yellow-500/10 px-2 py-1 text-[9px] font-semibold uppercase tracking-wider text-yellow-500 [writing-mode:vertical-lr] rotate-180">
              Before
            </span>
          </div>
          <div className="md:hidden">
            <span className="inline-block rounded bg-yellow-500/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-yellow-500">
              Before Transition
            </span>
          </div>

          {/* First 3 columns: Guards, Gates, Lifecycle */}
          <div className="grid flex-1 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {CATEGORY_ORDER.slice(0, 3).map((cat, i) => (
              <PipelineColumn
                key={cat}
                category={cat}
                hooks={categoryGroups.get(cat) ?? []}
                onHookClick={onHookClick}
                showArrow={i < 2}
              />
            ))}
          </div>

          {/* BEFORE/AFTER divider — hidden on narrow (stacked) */}
          <div className="hidden md:flex flex-col items-center justify-center px-2">
            <div className="h-full w-px bg-zinc-800" />
          </div>

          {/* AFTER label — vertical on desktop, horizontal pill on narrow */}
          <div className="md:flex md:items-center hidden">
            <span className="rounded-l bg-cyan-500/10 px-2 py-1 text-[9px] font-semibold uppercase tracking-wider text-cyan-500 [writing-mode:vertical-lr] rotate-180">
              After
            </span>
          </div>
          <div className="md:hidden">
            <span className="inline-block rounded bg-cyan-500/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-cyan-500">
              After Transition
            </span>
          </div>

          {/* Last column: Observers */}
          <div className="w-full md:w-56">
            <PipelineColumn
              category="observer"
              hooks={categoryGroups.get('observer') ?? []}
              onHookClick={onHookClick}
              showArrow={false}
            />
          </div>
        </div>
      </section>

      {/* Session Enforcement Section */}
      <section>
        <div className="mb-3 flex items-center gap-2">
          <Bot className="h-4 w-4 text-emerald-400" />
          <h2 className="text-sm font-medium text-zinc-200">Session Enforcement</h2>
          <span className="text-[10px] text-zinc-500">
            {ccOnlyHooks.length} CC hooks
          </span>
        </div>
        <p className="mb-4 text-[11px] text-zinc-500">
          Hooks that fire on Claude Code tool events
        </p>

        <div className="grid grid-cols-4 gap-3">
          {CC_EVENT_ORDER.map((event, i) => (
            <EventColumn
              key={event}
              event={event}
              matcherGroups={eventGroups.get(event) ?? []}
              onHookClick={onHookClick}
              showArrow={i < 3}
            />
          ))}
        </div>
      </section>

      {/* Execution Log Placeholder */}
      <section>
        <div className="mb-3 flex items-center gap-2">
          <Clock className="h-4 w-4 text-zinc-500" />
          <h2 className="text-sm font-medium text-zinc-200">Execution Log</h2>
          <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[9px] text-zinc-500">scope 079</span>
        </div>
        <HookExecutionLog />
      </section>
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────

function StatsBar({ stats }: { stats: { total: number; workflow: number; ccOnly: number; shared: number; edgesWithHooks: number } }) {
  return (
    <div className="flex items-center gap-4 rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-2.5">
      <Stat icon={Zap} color="#f97316" label="hooks" value={stats.total} />
      <Divider />
      <Stat icon={Shield} color="#f97316" label="workflow" value={stats.workflow} />
      <Divider />
      <Stat icon={Bot} color="#10b981" label="CC-only" value={stats.ccOnly} />
      <Divider />
      <span className="text-[10px] text-zinc-500">
        {stats.shared} shared scripts
      </span>
    </div>
  );
}

function Stat({ icon: Icon, color, label, value }: {
  icon: typeof Zap; color: string; label: string; value: number;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <Icon className="h-3.5 w-3.5" style={{ color }} />
      <span className="text-sm font-semibold text-zinc-200">{value}</span>
      <span className="text-[10px] text-zinc-500">{label}</span>
    </div>
  );
}

function Divider() {
  return <div className="h-4 w-px bg-zinc-800" />;
}

function PipelineColumn({ category, hooks, onHookClick, showArrow }: {
  category: HookCategory;
  hooks: UnifiedHook[];
  onHookClick: (hook: UnifiedHook) => void;
  showArrow: boolean;
}) {
  const config = CATEGORY_CONFIG[category];
  const CatIcon = config.icon;

  return (
    <div className="relative">
      {/* Column header */}
      <div className="mb-2 flex items-center gap-1.5">
        <CatIcon className="h-3 w-3" style={{ color: config.color }} />
        <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: config.color }}>
          {config.label}
        </span>
        {' '}
        <span className="text-[9px] text-zinc-600">({hooks.length})</span>
      </div>

      {/* Hook cards */}
      <div className="space-y-1.5">
        {hooks.length === 0 ? (
          <div className="rounded border border-dashed border-zinc-800 px-3 py-4 text-center text-[10px] text-zinc-700">
            No {config.label.toLowerCase()}
          </div>
        ) : (
          hooks.map((h) => (
            <CompactHookCard key={h.id} hook={h} onHookClick={onHookClick} />
          ))
        )}
      </div>

      {/* Flow arrow */}
      {showArrow && (
        <div className="absolute -right-2.5 top-1/2 -translate-y-1/2 text-zinc-700">
          <ChevronRight className="h-4 w-4" />
        </div>
      )}
    </div>
  );
}

function EventColumn({ event, matcherGroups, onHookClick, showArrow }: {
  event: CcHookEvent;
  matcherGroups: MatcherGroup[];
  onHookClick: (hook: UnifiedHook) => void;
  showArrow: boolean;
}) {
  const color = CC_EVENT_COLORS[event];
  const totalHooks = matcherGroups.reduce((sum, g) => sum + g.hooks.length, 0);

  return (
    <div className="relative">
      {/* Column header */}
      <div className="mb-2 flex items-center gap-1.5">
        <div className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
        <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color }}>
          {event}
        </span>
        {totalHooks > 0 && <span className="text-[9px] text-zinc-600">({totalHooks})</span>}
      </div>

      {/* Matcher sub-groups */}
      <div className="space-y-2">
        {matcherGroups.length === 0 ? (
          <div className="rounded border border-dashed border-zinc-800 px-3 py-4 text-center text-[10px] text-zinc-700">
            No hooks
          </div>
        ) : (
          matcherGroups.map((group) => (
            <div key={group.matcher}>
              {group.matcher !== '(all)' && (
                <div className="mb-1 rounded bg-zinc-800/50 px-1.5 py-0.5 font-mono text-[9px] text-zinc-500 w-fit">
                  {group.matcher}
                </div>
              )}
              <div className="space-y-1.5">
                {group.hooks.map((h) => (
                  <CompactHookCard key={h.id} hook={h} onHookClick={onHookClick} />
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Flow arrow */}
      {showArrow && (
        <div className="absolute -right-2.5 top-1/2 -translate-y-1/2 text-zinc-700">
          <ChevronRight className="h-4 w-4" />
        </div>
      )}
    </div>
  );
}

function CompactHookCard({ hook, onHookClick }: { hook: UnifiedHook; onHookClick: (hook: UnifiedHook) => void }) {
  const isBlocking = hook.workflow?.blocking;
  const hasCC = hook.source === 'both';

  return (
    <button
      onClick={() => onHookClick(hook)}
      className="w-full rounded border bg-zinc-950/50 px-2.5 py-2 text-left transition-colors hover:border-zinc-600 hover:bg-zinc-900/70"
      style={{ borderColor: isBlocking ? '#ef444440' : '#27272a' }}
    >
      <div className="flex items-center gap-1.5">
        <span className="text-[11px] font-medium text-zinc-300 truncate">{hook.label}</span>
        {isBlocking && <Shield className="h-2.5 w-2.5 shrink-0 text-red-400" />}
        {hasCC && (
          <span className="ml-auto shrink-0 rounded bg-emerald-500/15 px-1 py-0.5 text-[8px] font-bold text-emerald-400">
            +CC
          </span>
        )}
      </div>
    </button>
  );
}
