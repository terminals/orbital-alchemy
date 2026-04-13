import { useMemo } from 'react';
import { X, Star, Package, Zap, GitBranch, Key, Terminal, Radio, Globe } from 'lucide-react';
import type { WorkflowList, WorkflowHook, WorkflowEdge, HookCategory } from '../../../shared/workflow-config';
import { getHookEnforcement } from '../../../shared/workflow-config';
import { CATEGORY_CONFIG, ENFORCEMENT_HEX } from '@/lib/workflow-constants';

interface NodeDetailPanelProps {
  list: WorkflowList | null;
  hooks: WorkflowHook[];
  connectedEdges: WorkflowEdge[];
  onClose: () => void;
  onHookClick?: (hook: WorkflowHook) => void;
}

const CATEGORY_ORDER: HookCategory[] = ['guard', 'gate', 'lifecycle', 'observer'];

export function NodeDetailPanel({ list, hooks, connectedEdges, onClose, onHookClick }: NodeDetailPanelProps) {
  if (!list) return null;

  const inbound = connectedEdges.filter((e) => e.to === list.id);
  const outbound = connectedEdges.filter((e) => e.from === list.id);

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
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded-full" style={{ backgroundColor: list.hex }} />
          <span className="text-sm font-medium">{list.label}</span>
        </div>
        <button onClick={onClose} className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 space-y-4 overflow-y-auto p-4 text-xs">
        {/* Properties */}
        <Section title="Properties">
          <PropRow label="ID" value={list.id} />
          <PropRow label="Order" value={String(list.order)} />
          {list.group && <PropRow label="Group" value={list.group} />}
          <PropRow label="Color" value={list.hex} />
        </Section>

        {/* Flags */}
        <Section title="Flags">
          <div className="flex flex-wrap gap-2">
            {list.isEntryPoint && <FlagBadge icon={Star} label="Entry Point" color={list.hex} />}
            {list.supportsBatch && <FlagBadge icon={Package} label="Batch" color="#22c55e" />}
            {list.supportsSprint && <FlagBadge icon={Zap} label="Sprint" color="#6366f1" />}
            {list.gitBranch && <FlagBadge icon={GitBranch} label={list.gitBranch} color="#f59e0b" />}
            {list.sessionKey && <FlagBadge icon={Key} label={list.sessionKey} color="#8b5cf6" />}
          </div>
          {!list.isEntryPoint && !list.supportsBatch && !list.supportsSprint && !list.gitBranch && !list.sessionKey && (
            <span className="text-zinc-600">None</span>
          )}
        </Section>

        {/* Inbound edges */}
        <Section title={`Inbound (${inbound.length})`}>
          {inbound.length === 0 ? (
            <span className="text-zinc-600">None</span>
          ) : (
            inbound.map((e) => <EdgeRow key={`${e.from}:${e.to}`} edge={e} showField="from" />)
          )}
        </Section>

        {/* Outbound edges */}
        <Section title={`Outbound (${outbound.length})`}>
          {outbound.length === 0 ? (
            <span className="text-zinc-600">None</span>
          ) : (
            outbound.map((e) => <EdgeRow key={`${e.from}:${e.to}`} edge={e} showField="to" />)
          )}
        </Section>

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
                      <NodeHookDetail key={h.id} hook={h} onClick={onHookClick} />
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
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function PropRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-zinc-500">{label}</span>
      <span className="font-mono text-zinc-300">{value}</span>
    </div>
  );
}

function FlagBadge({ icon: Icon, label, color }: { icon: React.ComponentType<{ className?: string }>; label: string; color: string }) {
  return (
    <span className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px]" style={{ backgroundColor: `${color}15`, color }}>
      <Icon className="h-3 w-3" />
      {label}
    </span>
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

function NodeHookDetail({ hook, onClick }: { hook: WorkflowHook; onClick?: (hook: WorkflowHook) => void }) {
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

const DIRECTION_COLORS: Record<string, string> = {
  forward: '#22c55e',
  backward: '#f59e0b',
  shortcut: '#6366f1',
};

function EdgeRow({ edge, showField }: { edge: WorkflowEdge; showField: 'from' | 'to' }) {
  const color = DIRECTION_COLORS[edge.direction] ?? '#22c55e';
  return (
    <div className="flex items-center gap-2 rounded border border-border/50 bg-zinc-950/30 px-2 py-1.5">
      <span className="rounded px-1 py-0.5 text-[9px] uppercase" style={{ backgroundColor: `${color}20`, color }}>
        {edge.direction}
      </span>
      <span className="text-zinc-400">{showField === 'from' ? edge.from : edge.to}</span>
      <span className="ml-auto text-zinc-600">{edge.label}</span>
    </div>
  );
}
