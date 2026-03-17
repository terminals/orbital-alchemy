import { useState, useEffect } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { ChevronDown, ChevronRight, CornerDownLeft } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { usePipelineData } from '@/hooks/usePipelineData';
import { HookChip } from './HookChip';
import { StageCard } from './StageCard';
import { TransitionZone } from './TransitionZone';
import type { ConfigPrimitiveType, ResolvedHook } from '@/types';
import type { WorkflowConfig, WorkflowEdge } from '../../../shared/workflow-config';

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

interface UnifiedWorkflowPipelineProps {
  selectedPath: string | null;
  onSelectItem: (type: ConfigPrimitiveType, path: string) => void;
  editConfig?: WorkflowConfig;
  editable?: boolean;
  onRemoveEdgeHook?: (from: string, to: string, hookId: string) => void;
  onRemoveStageHook?: (listId: string, hookId: string) => void;
  onRemoveGlobalHook?: (hookId: string) => void;
}

export function UnifiedWorkflowPipeline({ selectedPath, onSelectItem, editConfig, editable, onRemoveEdgeHook, onRemoveStageHook, onRemoveGlobalHook }: UnifiedWorkflowPipelineProps) {
  const data = usePipelineData(editConfig);
  const [reworkOpen, setReworkOpen] = useState(false);

  // Scroll selected pipeline item into view
  useEffect(() => {
    if (!selectedPath) return;
    requestAnimationFrame(() => {
      const el = document.querySelector(`[data-pipeline-path="${CSS.escape(selectedPath)}"]`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  }, [selectedPath]);

  // Collect all backward edges across stages
  const allBackwardEdges: WorkflowEdge[] = data.stages.flatMap(s => s.backwardEdges);

  // Compute stats
  const totalHooks = new Set([
    ...data.globalHooks.map(h => h.id),
    ...data.stages.flatMap(s => s.stageHooks.map(h => h.id)),
  ]).size;
  const totalSkills = new Set(
    data.stages.flatMap(s => s.forwardEdges.filter(e => e.edge.command).map(e => e.edge.command)),
  ).size;
  const totalAgents = new Set([
    ...data.stages.flatMap(s => s.alwaysOnAgents.map(a => a.id)),
    ...data.stages.flatMap(s => s.reviewTeams.flatMap(t => t.agents.map(a => a.id))),
  ]).size;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="text-xxs font-medium uppercase tracking-wider text-muted-foreground">
          Workflow Pipeline
        </span>
        <div className="flex items-center gap-1.5">
          <Badge variant="secondary" className="text-[10px]">
            {data.stages.length} stages
          </Badge>
          {totalSkills > 0 && (
            <Badge variant="secondary" className="text-[10px]">
              {totalSkills} skills
            </Badge>
          )}
          {totalHooks > 0 && (
            <Badge variant="secondary" className="text-[10px]">
              {totalHooks} hooks
            </Badge>
          )}
          {totalAgents > 0 && (
            <Badge variant="secondary" className="text-[10px]">
              {totalAgents} agents
            </Badge>
          )}
        </div>
      </div>

      {/* Pipeline */}
      <ScrollArea className="flex-1">
        <div className="p-3 space-y-0">
          {/* Global Hooks */}
          {data.globalHooks.length > 0 && (
            <>
              <Card className="overflow-hidden border-border/60">
                <div className="flex items-center gap-2 px-3 py-2">
                  <span className="text-sm">🌐</span>
                  <span className="text-xs font-semibold text-foreground uppercase tracking-wide">
                    Global Hooks
                  </span>
                  <span className="text-[10px] text-muted-foreground/40">active in all stages</span>
                </div>
                <div className="border-t border-border/40">
                  <div className="flex flex-wrap gap-1 px-3 py-2">
                    {data.globalHooks.map(hook => (
                      <DraggableHookChip
                        key={hook.id}
                        hook={hook}
                        dragId={`pipeline::global-hook::${hook.id}`}
                        selected={hook.filePath != null && hook.filePath === selectedPath}
                        onClick={() => hook.filePath && onSelectItem('hooks', hook.filePath)}
                        onRemove={editable && onRemoveGlobalHook ? () => onRemoveGlobalHook(hook.id) : undefined}
                        editable={editable}
                      />
                    ))}
                  </div>
                </div>
              </Card>

              {/* Separator between global hooks and stage cards */}
              <div className="flex items-center gap-2 py-2 px-4">
                <div className="flex-1 border-t border-border/40" />
                <span className="text-[9px] text-muted-foreground/30 uppercase tracking-wider">stages</span>
                <div className="flex-1 border-t border-border/40" />
              </div>
            </>
          )}

          {/* Stage cards + transition zones */}
          {data.stages.map((stage, i) => (
            <div key={stage.list.id}>
              <StageCard
                stage={stage}
                selectedPath={selectedPath}
                onSelectItem={onSelectItem}
                editable={editable}
                onRemoveHook={onRemoveStageHook}
              />

              {/* Transition zone: all forward/shortcut edges in a single row */}
              {stage.forwardEdges.length > 0 && (
                <TransitionZone
                  edges={stage.forwardEdges}
                  selectedPath={selectedPath}
                  onSelectItem={onSelectItem}
                  editable={editable}
                  onRemoveHook={onRemoveEdgeHook}
                />
              )}

              {/* Spacer between stages if no edges (last stage) */}
              {stage.forwardEdges.length === 0 && i < data.stages.length - 1 && (
                <div className="h-2" />
              )}
            </div>
          ))}

          {/* Backward edges summary */}
          {allBackwardEdges.length > 0 && (
            <div className="mt-3 border-t border-border/30 pt-2">
              <button
                type="button"
                onClick={() => setReworkOpen(!reworkOpen)}
                className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-[10px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
              >
                {reworkOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                <CornerDownLeft className="h-3 w-3" />
                {allBackwardEdges.length} rework paths
              </button>
              {reworkOpen && (
                <div className="space-y-1 px-2 pt-1">
                  {allBackwardEdges.map(edge => (
                    <div
                      key={`${edge.from}:${edge.to}`}
                      className="flex items-center gap-2 text-[10px] text-muted-foreground/70 py-0.5"
                    >
                      <CornerDownLeft className="h-2.5 w-2.5 text-amber-500/50" />
                      <span className="font-mono">{edge.from}</span>
                      <span className="text-muted-foreground/30">&rarr;</span>
                      <span className="font-mono">{edge.to}</span>
                      <span className="text-muted-foreground/40 truncate">{edge.label}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Footer hint */}
          <div className="mt-4 px-2 text-center">
            <span className="text-[9px] text-muted-foreground/30">
              {editable
                ? 'Drag items from the tree onto stages or edges'
                : 'Click any hook, agent, or skill to open in editor'}
            </span>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
