import { useMemo } from 'react';
import {
  X, ArrowRight, Shield, Terminal, Radio, Globe, Bot,
  FileCode2, ExternalLink,
} from 'lucide-react';
import type {
  WorkflowEdge, UnifiedHook, CcTrigger,
} from '../../../shared/workflow-config';
import { getHookEnforcement } from '../../../shared/workflow-config';
import { CATEGORY_CONFIG, ENFORCEMENT_HEX, ENFORCEMENT_DESCRIPTIONS } from '@/lib/workflow-constants';

// ─── Types ──────────────────────────────────────────

interface HookDetailPanelProps {
  hook: UnifiedHook | null;
  edges: WorkflowEdge[];
  onClose: () => void;
  onViewSource: (hook: UnifiedHook) => void;
  onNavigateToEdge?: (from: string, to: string) => void;
}

const TIMING_COLORS: Record<string, string> = { before: '#eab308', after: '#3b82f6' };
const TYPE_ICONS: Record<string, typeof Terminal> = { shell: Terminal, event: Radio, webhook: Globe };
const TYPE_COLORS: Record<string, string> = { shell: '#22c55e', event: '#a855f7', webhook: '#f97316' };
const DIRECTION_COLORS: Record<string, string> = { forward: '#22c55e', backward: '#f59e0b', shortcut: '#6366f1' };

const SOURCE_CONFIG: Record<string, { label: string; color: string }> = {
  workflow: { label: 'Workflow', color: '#f97316' },
  'claude-code': { label: 'Claude Code', color: '#10b981' },
  both: { label: 'Both', color: '#8b5cf6' },
};

const CC_EVENT_COLORS: Record<string, string> = {
  SessionStart: '#22c55e',
  SessionEnd: '#ef4444',
  PreToolUse: '#eab308',
  PostToolUse: '#3b82f6',
};

// ─── Component ──────────────────────────────────────────

export function HookDetailPanel({ hook, edges, onClose, onViewSource, onNavigateToEdge }: HookDetailPanelProps) {
  const attachedEdges = useMemo(() => {
    if (!hook?.workflow) return [];
    return edges.filter((e) => (e.hooks ?? []).includes(hook.id));
  }, [hook, edges]);

  if (!hook) return null;

  const hasWorkflow = !!hook.workflow;
  const hasCc = !!hook.ccTriggers?.length;
  const srcConfig = SOURCE_CONFIG[hook.source];
  const catConfig = hasWorkflow ? CATEGORY_CONFIG[hook.workflow!.category] : null;
  const CatIcon = catConfig?.icon ?? Bot;
  const catColor = catConfig?.color ?? '#10b981';
  const enforcement = hasWorkflow
    ? getHookEnforcement({ category: hook.workflow!.category } as Parameters<typeof getHookEnforcement>[0])
    : null;
  const enforcementColor = enforcement ? ENFORCEMENT_HEX[enforcement] : null;
  const enforcementDesc = enforcement ? ENFORCEMENT_DESCRIPTIONS[enforcement] : null;
  const TypeIcon = hasWorkflow ? (TYPE_ICONS[hook.workflow!.type] ?? Terminal) : Bot;

  return (
    <div className="flex h-full w-96 shrink-0 flex-col rounded-lg border border-zinc-800 bg-zinc-900/95 backdrop-blur">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
        <div className="flex items-center gap-2 min-w-0">
          <CatIcon className="h-4 w-4 shrink-0" style={{ color: catColor }} />
          <span className="text-sm font-medium text-zinc-200 truncate">{hook.label}</span>
        </div>
        <button onClick={onClose} className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 space-y-4 overflow-y-auto p-4 text-xs">
        {/* Source badge */}
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="rounded px-2 py-0.5 text-[10px] font-bold uppercase"
            style={{ backgroundColor: `${srcConfig.color}20`, color: srcConfig.color }}
          >
            {srcConfig.label}
          </span>
          {hasWorkflow && enforcement && enforcementColor && (
            <span
              className="rounded px-2 py-0.5 text-[10px] font-bold uppercase"
              style={{ backgroundColor: `${enforcementColor}20`, color: enforcementColor }}
            >
              {enforcement}
            </span>
          )}
          {hasWorkflow && hook.workflow!.blocking && (
            <span className="flex items-center gap-1 rounded bg-red-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase text-red-400">
              <Shield className="h-2.5 w-2.5" />
              Blocking
            </span>
          )}
        </div>

        {/* Workflow Properties */}
        {hasWorkflow && (
          <Section title="Workflow Properties">
            <PropRow label="Timing" value={hook.workflow!.timing} color={TIMING_COLORS[hook.workflow!.timing]} />
            <PropRow label="Type" value={hook.workflow!.type} color={TYPE_COLORS[hook.workflow!.type]} />
            <PropRow label="Category" value={hook.workflow!.category} color={catColor} />
            <PropRow label="Blocking" value={hook.workflow!.blocking ? 'Yes' : 'No'} color={hook.workflow!.blocking ? '#ef4444' : '#6b7280'} />
          </Section>
        )}

        {/* Enforcement derivation */}
        {hasWorkflow && enforcement && enforcementColor && (
          <Section title="Enforcement">
            <p className="text-zinc-500">{enforcementDesc}</p>
            <p className="mt-1 text-[10px] text-zinc-600">
              {hook.workflow!.category} <span className="text-zinc-700">&rarr;</span>{' '}
              <span style={{ color: enforcementColor }}>{enforcement}</span>
            </p>
          </Section>
        )}

        {/* Description */}
        {hasWorkflow && hook.workflow!.description && (
          <Section title="Description">
            <p className="text-zinc-400 leading-relaxed">{hook.workflow!.description}</p>
          </Section>
        )}

        {/* Script Path */}
        <Section title="Script Path">
          <div className="flex items-center gap-2 rounded border border-zinc-800 bg-zinc-950 px-3 py-2 font-mono text-[11px] text-emerald-400">
            <TypeIcon className="h-3.5 w-3.5 shrink-0 text-zinc-600" />
            <span className="truncate">{hook.scriptPath}</span>
          </div>
        </Section>

        {/* CC Triggers */}
        {hasCc && (
          <Section title={`Claude Code Triggers (${hook.ccTriggers!.length})`}>
            <CCTriggerList triggers={hook.ccTriggers!} />
          </Section>
        )}

        {/* Attached Edges */}
        {hasWorkflow && (
          <Section title={`Attached Edges (${attachedEdges.length})`}>
            {attachedEdges.length === 0 ? (
              <span className="text-zinc-600">No edges reference this hook</span>
            ) : (
              <div className="space-y-1.5">
                {attachedEdges.map((e) => {
                  const color = DIRECTION_COLORS[e.direction] ?? '#22c55e';
                  return (
                    <button
                      key={`${e.from}:${e.to}`}
                      onClick={() => onNavigateToEdge?.(e.from, e.to)}
                      className="flex w-full items-center gap-2 rounded border border-zinc-800/50 bg-zinc-950/30 px-2 py-1.5 text-left transition-colors hover:border-zinc-700 hover:bg-zinc-900/50"
                    >
                      <span className="rounded px-1 py-0.5 text-[9px] uppercase" style={{ backgroundColor: `${color}20`, color }}>
                        {e.direction}
                      </span>
                      <span className="text-zinc-300">{e.from}</span>
                      <ArrowRight className="h-2.5 w-2.5 text-zinc-600" />
                      <span className="text-zinc-300">{e.to}</span>
                      <ExternalLink className="ml-auto h-3 w-3 text-zinc-600" />
                    </button>
                  );
                })}
              </div>
            )}
          </Section>
        )}
      </div>

      {/* Footer — View Source */}
      <div className="border-t border-zinc-800 p-3">
        <button
          onClick={() => onViewSource(hook)}
          className="flex w-full items-center justify-center gap-2 rounded border border-zinc-700 bg-zinc-800/50 px-3 py-2 text-xs text-zinc-300 transition-colors hover:border-zinc-600 hover:bg-zinc-800"
        >
          <FileCode2 className="h-3.5 w-3.5" />
          View Source Code
        </button>
      </div>
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────

function CCTriggerList({ triggers }: { triggers: CcTrigger[] }) {
  return (
    <div className="space-y-1.5">
      {triggers.map((t, i) => {
        const evColor = CC_EVENT_COLORS[t.event] ?? '#10b981';
        return (
          <div key={i} className="flex items-center gap-2 rounded border border-zinc-800/50 bg-zinc-950/30 px-2 py-1.5">
            <span
              className="rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase"
              style={{ backgroundColor: `${evColor}20`, color: evColor }}
            >
              {t.event}
            </span>
            {t.matcher && (
              <span className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[9px] text-zinc-400">
                {t.matcher}
              </span>
            )}
            {t.statusMessage && (
              <span className="ml-auto truncate text-[10px] text-zinc-600">{t.statusMessage}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{title}</h4>
      {children}
    </div>
  );
}

function PropRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className="text-zinc-500">{label}</span>
      <span className="text-zinc-300" style={color ? { color } : undefined}>{value}</span>
    </div>
  );
}
