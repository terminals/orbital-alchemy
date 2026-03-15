import { useMemo } from 'react';
import { ArrowRight, ArrowLeft, CornerRightDown, Info } from 'lucide-react';
import type { WorkflowEdge, WorkflowList } from '../../../shared/workflow-config';

// ─── Types ──────────────────────────────────────────────

interface MovementRulesPanelProps {
  edge: WorkflowEdge;
  lists: WorkflowList[];
}

// ─── Component ──────────────────────────────────────────

export function MovementRulesPanel({ edge, lists }: MovementRulesPanelProps) {
  const sortedLists = useMemo(
    () => [...lists].sort((a, b) => a.order - b.order),
    [lists],
  );

  const fromList = lists.find((l) => l.id === edge.from);
  const toList = lists.find((l) => l.id === edge.to);
  const fromOrder = fromList?.order ?? -1;
  const toOrder = toList?.order ?? -1;

  if (edge.direction === 'shortcut') {
    return <ShortcutRules sortedLists={sortedLists} fromOrder={fromOrder} toOrder={toOrder} edge={edge} />;
  }

  if (edge.direction === 'backward') {
    return <BackwardRules edge={edge} fromLabel={fromList?.label ?? edge.from} toLabel={toList?.label ?? edge.to} />;
  }

  return <ForwardRules edge={edge} fromLabel={fromList?.label ?? edge.from} toLabel={toList?.label ?? edge.to} />;
}

// ─── Sub-panels ─────────────────────────────────────────

function ShortcutRules({ sortedLists, fromOrder, toOrder, edge }: {
  sortedLists: WorkflowList[];
  fromOrder: number;
  toOrder: number;
  edge: WorkflowEdge;
}) {
  const skippedLists = sortedLists.filter(
    (l) => l.order > Math.min(fromOrder, toOrder) && l.order < Math.max(fromOrder, toOrder),
  );

  return (
    <div className="space-y-2">
      <RuleHeader icon={CornerRightDown} color="#6366f1" label="Shortcut — Skip Rules" />
      {/* Mini diagram */}
      <div className="flex items-center gap-1 rounded border border-zinc-800 bg-zinc-950/50 px-2.5 py-2 overflow-x-auto">
        {sortedLists.map((list, i) => {
          const isFrom = list.id === edge.from;
          const isTo = list.id === edge.to;
          const isSkipped = skippedLists.some((s) => s.id === list.id);
          return (
            <div key={list.id} className="flex items-center gap-1">
              <span
                className="rounded px-1.5 py-0.5 text-[8px] font-medium whitespace-nowrap"
                style={{
                  backgroundColor: isFrom || isTo ? '#6366f120' : isSkipped ? '#27272a' : '#18181b',
                  color: isFrom || isTo ? '#818cf8' : isSkipped ? '#52525b' : '#71717a',
                  border: isFrom || isTo ? '1px solid #6366f140' : '1px solid transparent',
                  textDecoration: isSkipped ? 'line-through' : 'none',
                }}
              >
                {list.label}
              </span>
              {i < sortedLists.length - 1 && (
                <span className="text-[8px] text-zinc-700">›</span>
              )}
            </div>
          );
        })}
      </div>
      {skippedLists.length > 0 ? (
        <p className="text-[9px] text-zinc-500">
          <span className="text-indigo-400">{edge.from}</span>
          {' → '}
          <span className="text-indigo-400">{edge.to}</span>
          {' skips '}
          <span className="text-zinc-400">{skippedLists.map((l) => l.label).join(', ')}</span>
        </p>
      ) : (
        <p className="text-[9px] text-zinc-500">No intermediate lists are skipped.</p>
      )}
    </div>
  );
}

function BackwardRules({ edge, fromLabel, toLabel }: {
  edge: WorkflowEdge;
  fromLabel: string;
  toLabel: string;
}) {
  const suggestedItems = [
    'Issue documented',
    'Fix scope created',
    'Root cause identified',
  ];

  return (
    <div className="space-y-2">
      <RuleHeader icon={ArrowLeft} color="#f59e0b" label="Backward — Revert Rules" />
      <div className="flex items-center gap-2 rounded border border-amber-500/20 bg-amber-500/5 px-2.5 py-2">
        <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[9px] font-medium text-amber-400">
          {fromLabel}
        </span>
        <svg width="24" height="12" viewBox="0 0 24 12" className="shrink-0">
          <line x1="20" y1="6" x2="4" y2="6" stroke="#f59e0b" strokeWidth="1.5" strokeDasharray="2 2" />
          <polygon points="4,6 8,3 8,9" fill="#f59e0b" />
        </svg>
        <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[9px] font-medium text-amber-400">
          {toLabel}
        </span>
        <span className="ml-auto rounded bg-amber-500/15 px-1.5 py-0.5 text-[8px] font-semibold text-amber-400">
          REPAIR
        </span>
      </div>
      <p className="text-[9px] text-zinc-500">
        {fromLabel} → {toLabel} is a <span className="text-amber-400">repair</span> operation.
        Scopes move backward for rework.
      </p>
      {/* Suggested checklist items */}
      {(!edge.checklist || edge.checklist.length === 0) && (
        <div className="rounded border border-zinc-800 bg-zinc-950/50 p-2">
          <div className="flex items-center gap-1 mb-1.5">
            <Info className="h-3 w-3 text-zinc-600" />
            <span className="text-[9px] font-medium text-zinc-500">Suggested checklist items</span>
          </div>
          <ul className="space-y-0.5">
            {suggestedItems.map((item) => (
              <li key={item} className="text-[9px] text-zinc-600 flex items-center gap-1.5">
                <span className="h-1 w-1 rounded-full bg-zinc-700 shrink-0" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function ForwardRules({ edge, fromLabel, toLabel }: {
  edge: WorkflowEdge;
  fromLabel: string;
  toLabel: string;
}) {
  return (
    <div className="space-y-2">
      <RuleHeader icon={ArrowRight} color="#22c55e" label="Forward — Progression" />
      <div className="flex items-center gap-2 rounded border border-emerald-500/20 bg-emerald-500/5 px-2.5 py-2">
        <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[9px] font-medium text-emerald-400">
          {fromLabel}
        </span>
        <svg width="24" height="12" viewBox="0 0 24 12" className="shrink-0">
          <line x1="4" y1="6" x2="20" y2="6" stroke="#22c55e" strokeWidth="1.5" />
          <polygon points="20,6 16,3 16,9" fill="#22c55e" />
        </svg>
        <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[9px] font-medium text-emerald-400">
          {toLabel}
        </span>
      </div>
      {edge.dispatchOnly && (
        <p className="text-[9px] text-zinc-500">
          This transition requires a <span className="text-blue-400">skill command</span> to trigger.
        </p>
      )}
    </div>
  );
}

// ─── Shared ─────────────────────────────────────────────

function RuleHeader({ icon: Icon, color, label }: {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  color: string;
  label: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <Icon className="h-3 w-3" style={{ color }} />
      <span className="text-[10px] font-semibold" style={{ color }}>{label}</span>
    </div>
  );
}
