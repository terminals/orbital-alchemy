import { Bot, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ResolvedAgent } from '@/types';

interface AgentChipProps {
  agent: ResolvedAgent;
  mode?: 'always-on' | 'review';
  selected?: boolean;
  onClick?: () => void;
  onRemove?: () => void;
}

export function AgentChip({ agent, mode, selected, onClick, onRemove }: AgentChipProps) {
  const color = agent.color || '#8B5CF6';

  return (
    <button
      type="button"
      onClick={onClick}
      data-pipeline-path={agent.filePath ?? undefined}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-medium transition-colors',
        'hover:brightness-125 cursor-pointer',
        selected && 'glow-selected-pulse',
      )}
      style={{
        color,
        borderColor: `${color}4D`,
        backgroundColor: `${color}1A`,
        ...(selected ? { '--glow-color': `${color}A0`, '--glow-color-wide': `${color}40` } as React.CSSProperties : {}),
      }}
    >
      {agent.emoji ? (
        <span className="text-xs">{agent.emoji}</span>
      ) : (
        <Bot className="h-3 w-3 shrink-0" />
      )}
      <span className="truncate max-w-[100px]">{agent.label}</span>
      {mode === 'always-on' && (
        <span className="ml-0.5 h-1.5 w-1.5 rounded-full bg-green-500 shrink-0" title="Auto-invoke" />
      )}
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
