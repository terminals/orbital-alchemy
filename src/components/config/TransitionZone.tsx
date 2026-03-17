import { useDraggable, useDroppable } from '@dnd-kit/core';
import { ArrowDown, Terminal, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { HookChip } from './HookChip';
import type { EdgeData, ConfigPrimitiveType, ResolvedHook } from '@/types';

/** Wraps a HookChip to make it draggable out of the pipeline */
function DraggableHookChip({ hook, dragId, selected, onClick, onRemove, editable }: {
  hook: ResolvedHook;
  dragId: string;
  selected?: boolean;
  onClick?: () => void;
  onRemove?: () => void;
  editable?: boolean;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: dragId,
    disabled: !editable,
    data: { hookId: hook.id },
  });

  return (
    <div ref={setNodeRef} className={cn('cursor-pointer', isDragging && 'opacity-40')} onClick={onClick} {...listeners} {...attributes}>
      <HookChip hook={hook} selected={selected} onRemove={onRemove} />
    </div>
  );
}

interface TransitionZoneProps {
  edges: EdgeData[];
  selectedPath: string | null;
  onSelectItem: (type: ConfigPrimitiveType, path: string) => void;
  editable?: boolean;
  onRemoveHook?: (from: string, to: string, hookId: string) => void;
}

const DIRECTION_STYLE: Record<string, { arrow: string; label: string; border: string; bg: string }> = {
  forward:  { arrow: 'text-green-500',  label: 'text-green-400', border: 'border-green-500/20', bg: 'bg-green-500/5' },
  backward: { arrow: 'text-amber-500',  label: 'text-amber-400', border: 'border-amber-500/20', bg: 'bg-amber-500/5' },
  shortcut: { arrow: 'text-indigo-500', label: 'text-indigo-400', border: 'border-indigo-500/20', bg: 'bg-indigo-500/5' },
};

function EdgeRow({ edgeData, selectedPath, onSelectItem, editable, onRemoveHook }: {
  edgeData: EdgeData;
  selectedPath: string | null;
  onSelectItem: (type: ConfigPrimitiveType, path: string) => void;
  editable?: boolean;
  onRemoveHook?: (from: string, to: string, hookId: string) => void;
}) {
  const { edge, skillPath, edgeHooks } = edgeData;
  const style = DIRECTION_STYLE[edge.direction] ?? DIRECTION_STYLE.forward;

  const skillDropId = `drop::edge-skill::${edge.from}:${edge.to}`;
  const { setNodeRef: setSkillRef, isOver: isSkillOver } = useDroppable({ id: skillDropId, disabled: !editable });

  const hooksDropId = `drop::edge-hooks::${edge.from}:${edge.to}`;
  const { setNodeRef: setHooksRef, isOver: isHooksOver } = useDroppable({ id: hooksDropId, disabled: !editable });

  const directionLabel = edge.direction === 'shortcut' ? 'SHORTCUT' : 'DEFAULT';

  return (
    <div className={cn(
      'flex items-center rounded-lg border overflow-hidden',
      style.border, 'bg-card',
    )}>
      {/* Direction label */}
      <div className={cn('shrink-0 self-stretch flex items-center px-2.5', style.bg)}>
        <span className={cn('text-[9px] font-semibold uppercase tracking-wider whitespace-nowrap', style.label)}>
          {directionLabel}
        </span>
      </div>

      {/* Skill + Hooks inline */}
      <div className="flex items-center flex-1 min-w-0 border-l" style={{ borderColor: 'inherit' }}>
        {/* Skill */}
        <div
          ref={setSkillRef}
          className={cn(
            'flex items-center gap-1.5 px-2 py-1 shrink-0',
            isSkillOver && 'bg-green-500/10',
          )}
        >
          {edge.command ? (
            <button
              type="button"
              onClick={() => skillPath && onSelectItem('skills', skillPath)}
              data-pipeline-path={skillPath ?? undefined}
              className={cn(
                'inline-flex items-center gap-1 text-[11px] font-semibold transition-colors whitespace-nowrap rounded-md px-1 -mx-1',
                style.label,
                skillPath && 'hover:brightness-125 cursor-pointer',
                !skillPath && 'cursor-default opacity-60',
                skillPath != null && skillPath === selectedPath && 'glow-selected-pulse',
              )}
              style={skillPath != null && skillPath === selectedPath ? { '--glow-color': '#22c55eA0', '--glow-color-wide': '#22c55e40' } as React.CSSProperties : undefined}
            >
              <Terminal className="h-3 w-3 shrink-0" />
              {edge.command.replace(/\s+\{.*\}$/, '')}
            </button>
          ) : (
            <span className={cn(
              'text-[10px] text-muted-foreground/40 italic whitespace-nowrap',
              editable && 'border border-dashed border-muted-foreground/20 rounded px-1.5 py-0.5',
            )}>
              {editable ? 'drop skill' : 'no skill'}
            </span>
          )}
        </div>

        {/* Divider */}
        <div className={cn('w-px self-stretch', style.border.replace('border-', 'bg-'))} />

        {/* Hooks */}
        <div
          ref={setHooksRef}
          className={cn(
            'flex items-center gap-1 px-2 py-1 flex-1 min-w-0',
            isHooksOver && 'bg-[#00bcd4]/10',
          )}
        >
          <Zap className="h-3 w-3 shrink-0 text-muted-foreground/30" />
          {edgeHooks.map(hook => (
            <DraggableHookChip
              key={hook.id}
              hook={hook}
              dragId={`pipeline::edge-hook::${edge.from}:${edge.to}::${hook.id}`}
              selected={hook.filePath != null && hook.filePath === selectedPath}
              onClick={() => hook.filePath && onSelectItem('hooks', hook.filePath)}
              onRemove={editable && onRemoveHook ? () => onRemoveHook(edge.from, edge.to, hook.id) : undefined}
              editable={editable}
            />
          ))}
          {edgeHooks.length === 0 && (
            <span className={cn(
              'text-[10px] text-muted-foreground/40 italic',
              editable && 'border border-dashed border-muted-foreground/20 rounded px-1.5 py-0.5',
            )}>
              {editable ? 'drop hooks' : 'none'}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export function TransitionZone({ edges, selectedPath, onSelectItem, editable, onRemoveHook }: TransitionZoneProps) {
  if (edges.length === 0) return null;

  const arrowStyle = DIRECTION_STYLE.forward.arrow;

  return (
    <div className="flex flex-col items-center py-1">
      <ArrowDown className={cn('h-7 w-4', arrowStyle)} />

      {/* Edge rows */}
      <div className="flex w-full flex-wrap justify-center gap-1 px-1 my-0.5">
        {edges.map(edgeData => (
          <EdgeRow
            key={`${edgeData.edge.from}:${edgeData.edge.to}`}
            edgeData={edgeData}
            selectedPath={selectedPath}
            onSelectItem={onSelectItem}
            editable={editable}
            onRemoveHook={onRemoveHook}
          />
        ))}
      </div>

      <ArrowDown className={cn('h-7 w-4', arrowStyle)} />
    </div>
  );
}
