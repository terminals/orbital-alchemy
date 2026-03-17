import { ShieldCheck, AlertTriangle, Cog, Eye, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ResolvedHook } from '@/types';
import type { HookCategory } from '../../../shared/workflow-config';

export const CATEGORY_STYLE: Record<HookCategory, { icon: typeof ShieldCheck; bg: string; border: string; text: string; hex: string }> = {
  guard:     { icon: ShieldCheck,    bg: 'bg-red-500/10',    border: 'border-red-500/30',    text: 'text-red-400',   hex: '#ef4444' },
  gate:      { icon: AlertTriangle,  bg: 'bg-amber-500/10',  border: 'border-amber-500/30',  text: 'text-amber-400', hex: '#f59e0b' },
  lifecycle: { icon: Cog,            bg: 'bg-cyan-500/10',   border: 'border-cyan-500/30',   text: 'text-cyan-400',  hex: '#06b6d4' },
  observer:  { icon: Eye,            bg: 'bg-zinc-500/10',   border: 'border-zinc-500/30',   text: 'text-zinc-400',  hex: '#71717a' },
};

interface HookChipProps {
  hook: ResolvedHook;
  selected?: boolean;
  onClick?: () => void;
  onRemove?: () => void;
}

export function HookChip({ hook, selected, onClick, onRemove }: HookChipProps) {
  const style = CATEGORY_STYLE[hook.category];
  const Icon = style.icon;

  return (
    <button
      type="button"
      onClick={onClick}
      data-pipeline-path={hook.filePath ?? undefined}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-medium transition-colors',
        style.bg, style.border, style.text,
        'hover:brightness-125 cursor-pointer',
        selected && 'glow-selected-pulse',
      )}
      style={selected ? { '--glow-color': `${style.hex}A0`, '--glow-color-wide': `${style.hex}40` } as React.CSSProperties : undefined}
    >
      <Icon className="h-3 w-3 shrink-0" />
      <span className="truncate max-w-[120px]">{hook.id}</span>
      {onRemove && (
        <span
          role="button"
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="ml-0.5 rounded-full p-0.5 hover:bg-red-500/20"
        >
          <X className="h-2.5 w-2.5" />
        </span>
      )}
    </button>
  );
}
