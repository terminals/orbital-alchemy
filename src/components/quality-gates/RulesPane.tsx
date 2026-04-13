import { ArrowRight, Shield } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useEnforcementRules } from '@/hooks/useEnforcementRules';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { ENFORCEMENT_CLASSES } from '@/lib/workflow-constants';
import { CATEGORY_ICON } from './constants';
import type { EnforcementRule } from '@/types';

export function RulesPane() {
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
        <Badge variant="outline" className={cn('text-[9px] border', ENFORCEMENT_CLASSES[rule.enforcement])}>
          {rule.hook.category}
        </Badge>
      </td>
      <td className="px-3 py-1.5">
        <span className={cn('text-[10px]', ENFORCEMENT_CLASSES[rule.enforcement]?.split(' ')[0])}>
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

function SummaryChip({ count, label, color }: { count: number; label: string; color: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className={cn('text-xs font-medium', color)}>{count}</span>
      <span className="text-[10px] text-muted-foreground">{label}</span>
    </span>
  );
}
