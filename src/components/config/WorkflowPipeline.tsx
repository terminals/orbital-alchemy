import { useMemo } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { ArrowDown, Terminal, Zap, Users } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { useWorkflow } from '@/hooks/useWorkflow';
import type { ConfigPrimitiveType } from '@/types';
import type { WorkflowList, WorkflowEdge } from '../../../shared/workflow-config';

interface WorkflowPipelineProps {
  type: ConfigPrimitiveType;
}

/** A droppable zone on the pipeline where tree items can be dropped */
function PipelineDropZone({ id, children, className }: { id: string; children: React.ReactNode; className?: string }) {
  const { isOver, setNodeRef } = useDroppable({ id });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'rounded border border-dashed border-transparent transition-colors',
        isOver && 'border-accent-blue/40 bg-accent-blue/5',
        className,
      )}
    >
      {children}
    </div>
  );
}

/** A single workflow list card in the pipeline */
function ListCard({
  list,
  type,
  outEdges,
}: {
  list: WorkflowList;
  type: ConfigPrimitiveType;
  outEdges: WorkflowEdge[];
}) {
  const hookBadges = type === 'hooks' && list.activeHooks?.length
    ? list.activeHooks
    : [];

  return (
    <PipelineDropZone id={`pipeline-list-${list.id}`}>
      <Card className="overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2">
          <div
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: list.hex }}
          />
          <span className="text-xs font-medium text-foreground">{list.label}</span>
          <span className="text-[10px] text-muted-foreground/50 font-mono">{list.id}</span>
        </div>

        {/* Hook badges on list (hooks mode) */}
        {hookBadges.length > 0 && (
          <div className="flex flex-wrap gap-1 border-t border-border px-3 py-1.5">
            {hookBadges.map((hook) => (
              <Badge key={hook} variant="secondary" className="text-[10px] gap-1 px-1.5 py-0">
                <Zap className="h-2.5 w-2.5" />
                {hook}
              </Badge>
            ))}
          </div>
        )}
      </Card>

      {/* Outgoing edges */}
      {outEdges.map((edge) => (
        <EdgeSlot key={`${edge.from}:${edge.to}`} edge={edge} type={type} />
      ))}
    </PipelineDropZone>
  );
}

/** The connector between two lists, showing edge metadata */
function EdgeSlot({ edge, type }: { edge: WorkflowEdge; type: ConfigPrimitiveType }) {
  const showCommand = type === 'skills' && edge.command;
  const showAgents = type === 'agents' && edge.agents?.length;
  const hasContent = showCommand || showAgents;

  return (
    <PipelineDropZone id={`pipeline-edge-${edge.from}:${edge.to}`} className="my-1">
      <div className="flex items-center gap-2 px-4 py-1">
        <ArrowDown className="h-3 w-3 shrink-0 text-muted-foreground/40" />
        <span className="text-[10px] text-muted-foreground/60 truncate">
          {edge.label}
        </span>

        {hasContent && (
          <div className="ml-auto flex items-center gap-1">
            {showCommand && (
              <Badge variant="outline" className="text-[10px] gap-1 px-1.5 py-0 text-accent-blue border-accent-blue/30">
                <Terminal className="h-2.5 w-2.5" />
                {edge.command}
              </Badge>
            )}
            {showAgents && edge.agents?.map((agent) => (
              <Badge key={agent} variant="outline" className="text-[10px] gap-1 px-1.5 py-0 text-purple-400 border-purple-400/30">
                <Users className="h-2.5 w-2.5" />
                {agent}
              </Badge>
            ))}
          </div>
        )}
      </div>
    </PipelineDropZone>
  );
}

export function WorkflowPipeline({ type }: WorkflowPipelineProps) {
  const { engine } = useWorkflow();

  const lists = useMemo(() => engine.getLists(), [engine]);
  const edges = useMemo(() => engine.getAllEdges(), [engine]);

  // Group edges by source list for rendering
  const edgesByFrom = useMemo(() => {
    const map = new Map<string, WorkflowEdge[]>();
    for (const edge of edges) {
      if (edge.direction !== 'forward') continue; // Only show forward edges in pipeline
      const existing = map.get(edge.from);
      if (existing) existing.push(edge);
      else map.set(edge.from, [edge]);
    }
    return map;
  }, [edges]);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="text-xxs font-medium uppercase tracking-wider text-muted-foreground">
          Workflow Pipeline
        </span>
        <Badge variant="secondary" className="text-[10px]">
          {lists.length} stages
        </Badge>
      </div>

      {/* Pipeline */}
      <ScrollArea className="flex-1">
        <div className="space-y-0 p-3">
          {lists.map((list) => (
            <ListCard
              key={list.id}
              list={list}
              type={type}
              outEdges={edgesByFrom.get(list.id) ?? []}
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
