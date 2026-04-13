import {
  Shield, ShieldAlert, Cog, Eye,
  AlertTriangle, CheckCircle2, XCircle, CheckCheck,
  Zap, ArrowRight, GitCommit, Play, Square,
  FileText, TerminalSquare, Wrench,
} from 'lucide-react';

export const CATEGORY_ICON: Record<string, typeof Shield> = {
  guard: Shield, gate: ShieldAlert, lifecycle: Cog, observer: Eye,
};

export const TOOLTIP_STYLE = {
  background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))',
  borderRadius: '6px', fontSize: '11px',
};

export const EVENT_CONFIG: Record<string, { icon: typeof Shield; color: string; label: string }> = {
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

export function formatGateName(name: string): string {
  return name.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
