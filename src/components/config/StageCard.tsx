import { useState } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { ChevronDown, ChevronRight, Star, Zap, Bot, GitBranch, Layers, Timer } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { HookChip } from './HookChip';
import { AgentChip } from './AgentChip';
import { cn } from '@/lib/utils';
import type { StageData, ConfigPrimitiveType, ResolvedHook } from '@/types';

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

interface StageCardProps {
  stage: StageData;
  selectedPath: string | null;
  onSelectItem: (type: ConfigPrimitiveType, path: string) => void;
  editable?: boolean;
  onRemoveHook?: (listId: string, hookId: string) => void;
}

export function StageCard({ stage, selectedPath, onSelectItem, editable, onRemoveHook }: StageCardProps) {
  const { list, stageHooks, alwaysOnAgents, reviewTeams } = stage;
  const [hooksOpen, setHooksOpen] = useState(true);
  const [agentsOpen, setAgentsOpen] = useState(true);

  const hasHooks = stageHooks.length > 0;
  const hasAgents = alwaysOnAgents.length > 0 || reviewTeams.length > 0;
  const showHooksSection = hasHooks || editable;

  const dropId = `drop::stage-hooks::${list.id}`;
  const { setNodeRef, isOver } = useDroppable({ id: dropId, disabled: !editable });

  return (
    <Card className="overflow-hidden border-border/60">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2">
        <div
          className="h-3 w-3 shrink-0 rounded-full"
          style={{ backgroundColor: list.hex }}
        />
        <span className="text-xs font-semibold text-foreground uppercase tracking-wide">
          {list.label}
        </span>
        <span className="text-[10px] text-muted-foreground/40 font-mono">{list.id}</span>

        <div className="ml-auto flex items-center gap-1">
          {list.isEntryPoint && (
            <Badge variant="outline" className="text-[9px] gap-0.5 px-1 py-0 border-amber-500/30 text-amber-400">
              <Star className="h-2.5 w-2.5" /> entry
            </Badge>
          )}
          {list.gitBranch && (
            <Badge variant="outline" className="text-[9px] gap-0.5 px-1 py-0 border-green-500/30 text-green-400">
              <GitBranch className="h-2.5 w-2.5" /> {list.gitBranch}
            </Badge>
          )}
          {list.supportsBatch && (
            <Badge variant="outline" className="text-[9px] gap-0.5 px-1 py-0 border-cyan-500/30 text-cyan-400">
              <Layers className="h-2.5 w-2.5" /> batch
            </Badge>
          )}
          {list.supportsSprint && (
            <Badge variant="outline" className="text-[9px] gap-0.5 px-1 py-0 border-indigo-500/30 text-indigo-400">
              <Timer className="h-2.5 w-2.5" /> sprint
            </Badge>
          )}
        </div>
      </div>

      {/* Stage Hooks */}
      {showHooksSection && (
        <div className="border-t border-border/40">
          <button
            type="button"
            onClick={() => setHooksOpen(!hooksOpen)}
            className="flex w-full items-center gap-1.5 px-3 py-1.5 text-[10px] font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            {hooksOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            <Zap className="h-3 w-3" />
            Stage Hooks
            <span className="text-muted-foreground/50">({stageHooks.length})</span>
          </button>
          {hooksOpen && (
            <div
              ref={setNodeRef}
              className={cn(
                'flex flex-wrap gap-1 px-3 pb-2 min-h-[28px]',
                editable && 'border border-dashed border-transparent rounded-md mx-2 mb-1 p-1',
                isOver && 'border-accent-blue bg-accent-blue/10',
              )}
            >
              {stageHooks.map(hook => (
                <DraggableHookChip
                  key={hook.id}
                  hook={hook}
                  dragId={`pipeline::stage-hook::${list.id}::${hook.id}`}
                  selected={hook.filePath != null && hook.filePath === selectedPath}
                  onClick={() => hook.filePath && onSelectItem('hooks', hook.filePath)}
                  onRemove={editable && onRemoveHook ? () => onRemoveHook(list.id, hook.id) : undefined}
                  editable={editable}
                />
              ))}
              {editable && stageHooks.length === 0 && (
                <span className="text-[9px] text-muted-foreground/40 italic py-0.5">drop hooks here</span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Agents */}
      {hasAgents && (
        <div className="border-t border-border/40">
          <button
            type="button"
            onClick={() => setAgentsOpen(!agentsOpen)}
            className="flex w-full items-center gap-1.5 px-3 py-1.5 text-[10px] font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            {agentsOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            <Bot className="h-3 w-3" />
            Agents
            <span className="text-muted-foreground/50">
              ({alwaysOnAgents.length + reviewTeams.reduce((s, t) => s + t.agents.length, 0)})
            </span>
          </button>
          {agentsOpen && (
            <div className="px-3 pb-2 space-y-2">
              {/* Always-On */}
              {alwaysOnAgents.length > 0 && (
                <div>
                  <div className="text-[9px] uppercase tracking-wider text-muted-foreground/50 mb-1">Always-On</div>
                  <div className="flex flex-wrap gap-1">
                    {alwaysOnAgents.map(agent => (
                      <AgentChip
                        key={agent.id}
                        agent={agent}
                        mode="always-on"
                        selected={agent.filePath != null && agent.filePath === selectedPath}
                        onClick={() => agent.filePath && onSelectItem('agents', agent.filePath)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Review Teams */}
              {reviewTeams.map(team => (
                <div key={team.skillCommand}>
                  <div className="flex items-center gap-1 text-[9px] uppercase tracking-wider text-muted-foreground/50 mb-1">
                    <span>{team.skillCommand} team:</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {team.agents.map(agent => (
                      <AgentChip
                        key={agent.id}
                        agent={agent}
                        mode="review"
                        selected={agent.filePath != null && agent.filePath === selectedPath}
                        onClick={() => agent.filePath && onSelectItem('agents', agent.filePath)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {!showHooksSection && !hasAgents && (
        <div className="border-t border-border/40 px-3 py-2">
          <span className="text-[10px] text-muted-foreground/40 italic">No stage-specific hooks or agents</span>
        </div>
      )}
    </Card>
  );
}
