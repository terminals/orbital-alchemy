import { useMemo } from 'react';
import { X, ArrowRight, CheckCircle2, Terminal, Radio, Globe } from 'lucide-react';
import type { WorkflowEdge, WorkflowHook, HookCategory } from '../../../shared/workflow-config';
import { getHookEnforcement } from '../../../shared/workflow-config';
import { CATEGORY_CONFIG, ENFORCEMENT_HEX } from '@/lib/workflow-constants';

interface EdgeDetailPanelProps {
  edge: WorkflowEdge | null;
  hooks: WorkflowHook[];
  onClose: () => void;
  onHookClick?: (hook: WorkflowHook) => void;
}

const DIRECTION_COLORS: Record<string, string> = {
  forward: '#22c55e',
  backward: '#f59e0b',
  shortcut: '#6366f1',
};

const CATEGORY_ORDER: HookCategory[] = ['guard', 'gate', 'lifecycle', 'observer'];

export function EdgeDetailPanel({ edge, hooks, onClose, onHookClick }: EdgeDetailPanelProps) {
  if (!edge) return null;

  const color = DIRECTION_COLORS[edge.direction] ?? '#22c55e';

  // Group hooks by category
  const grouped = useMemo(() => {
    const groups = new Map<HookCategory, WorkflowHook[]>();
    for (const hook of hooks) {
      const existing = groups.get(hook.category);
      if (existing) existing.push(hook);
      else groups.set(hook.category, [hook]);
    }
    return groups;
  }, [hooks]);

  return (
    <div className="card-glass flex h-full w-80 shrink-0 flex-col rounded-lg border border-border bg-card">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <span className="text-zinc-300">{edge.from}</span>
          <ArrowRight className="h-3.5 w-3.5 text-zinc-600" />
          <span className="text-zinc-300">{edge.to}</span>
        </div>
        <button onClick={onClose} className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 space-y-4 overflow-y-auto p-4 text-xs">
        {/* Label & Direction */}
        <Section title="Transition">
          <div className="flex items-center gap-2">
            <span
              className="rounded px-2 py-0.5 text-[10px] font-semibold uppercase"
              style={{ backgroundColor: `${color}20`, color }}
            >
              {edge.direction}
            </span>
            <span className="text-zinc-300">{edge.label}</span>
          </div>
          <p className="mt-1.5 text-zinc-500">{edge.description}</p>
        </Section>

        {/* Command */}
        {edge.command && (
          <Section title="Command">
            <div className="flex items-center gap-2 rounded border border-border bg-zinc-950 px-3 py-2 font-mono text-emerald-400">
              <Terminal className="h-3.5 w-3.5 shrink-0 text-zinc-600" />
              {edge.command}
            </div>
          </Section>
        )}

        {/* Flags */}
        <Section title="Behavior">
          <div className="flex flex-wrap gap-2">
            <Flag label="Confirm" value={edge.confirmLevel} />
            {edge.dispatchOnly && <Flag label="Dispatch Only" active />}
            {edge.humanOnly && <Flag label="Human Only" active />}
            {edge.skipServerTransition && <Flag label="Skip Server" active />}
          </div>
        </Section>

        {/* Checklist */}
        {edge.checklist && edge.checklist.length > 0 && (
          <Section title={`Checklist (${edge.checklist.length})`}>
            <div className="space-y-1.5">
              {edge.checklist.map((item, i) => (
                <div key={i} className="flex items-start gap-2 text-zinc-400">
                  <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-zinc-600" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Hooks grouped by category */}
        {hooks.length > 0 && (
          <Section title={`Hooks (${hooks.length})`}>
            <div className="space-y-3">
              {CATEGORY_ORDER.map((cat) => {
                const catHooks = grouped.get(cat);
                if (!catHooks?.length) return null;
                const config = CATEGORY_CONFIG[cat];
                const CatIcon = config.icon;
                return (
                  <div key={cat}>
                    <div className="mb-1.5 flex items-center gap-1.5">
                      <CatIcon className="h-2.5 w-2.5" style={{ color: config.color }} />
                      <span className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: config.color }}>
                        {config.label}
                      </span>
                    </div>
                    {catHooks.map((h) => (
                      <HookDetail key={h.id} hook={h} onClick={onHookClick} />
                    ))}
                  </div>
                );
              })}
            </div>
          </Section>
        )}
      </div>
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{title}</h4>
      {children}
    </div>
  );
}

const TIMING_COLORS: Record<string, string> = {
  before: '#eab308',
  after: '#3b82f6',
};

const TYPE_COLORS: Record<string, string> = {
  shell: '#22c55e',
  event: '#a855f7',
  webhook: '#f97316',
};

const TYPE_ICONS: Record<string, typeof Terminal> = {
  shell: Terminal,
  event: Radio,
  webhook: Globe,
};

function HookDetail({ hook, onClick }: { hook: WorkflowHook; onClick?: (hook: WorkflowHook) => void }) {
  const timingColor = TIMING_COLORS[hook.timing] ?? '#3b82f6';
  const typeColor = TYPE_COLORS[hook.type] ?? '#22c55e';
  const TypeIcon = TYPE_ICONS[hook.type] ?? Terminal;
  const enforcement = getHookEnforcement(hook);
  const enforcementColor = ENFORCEMENT_HEX[enforcement];
  const catConfig = CATEGORY_CONFIG[hook.category];
  const CatIcon = catConfig.icon;

  return (
    <button
      onClick={() => onClick?.(hook)}
      className="w-full rounded border bg-zinc-950/50 p-2 text-left transition-colors hover:border-zinc-600 hover:bg-zinc-900/70"
      style={{ borderColor: hook.blocking ? '#ef444466' : '#27272a' }}
    >
      <div className="flex items-center gap-2">
        <CatIcon className="h-2.5 w-2.5" style={{ color: catConfig.color }} />
        <span className="text-zinc-300">{hook.label}</span>
        <span
          className="ml-auto rounded px-1 py-0.5 text-[8px] font-bold uppercase"
          style={{ backgroundColor: `${enforcementColor}20`, color: enforcementColor }}
        >
          {enforcement}
        </span>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1">
        <span
          className="rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase"
          style={{ backgroundColor: `${timingColor}20`, color: timingColor }}
        >
          {hook.timing}
        </span>
        <span
          className="flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase"
          style={{ backgroundColor: `${typeColor}20`, color: typeColor }}
        >
          <TypeIcon className="h-2.5 w-2.5" />
          {hook.type}
        </span>
      </div>
      <div className="mt-1.5 flex items-center gap-1.5 rounded border border-border bg-zinc-900 px-2 py-1 font-mono text-[10px] text-zinc-400">
        <TypeIcon className="h-3 w-3 shrink-0 text-zinc-600" />
        <span className="truncate">{hook.target}</span>
      </div>
      {hook.description && <p className="mt-1 text-zinc-500">{hook.description}</p>}
    </button>
  );
}

function Flag({ label, value, active }: { label: string; value?: string; active?: boolean }) {
  return (
    <span
      className="rounded border px-1.5 py-0.5 text-[10px]"
      style={{
        borderColor: active ? '#22c55e33' : '#27272a',
        color: active ? '#22c55e' : '#a1a1aa',
        backgroundColor: active ? '#22c55e10' : 'transparent',
      }}
    >
      {label}{value ? `: ${value}` : ''}
    </span>
  );
}
