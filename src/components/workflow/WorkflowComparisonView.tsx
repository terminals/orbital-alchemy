import { useMemo } from 'react';
import {
  ReactFlow,
  Background,
  BackgroundVariant,
} from '@xyflow/react';
import type { WorkflowEngine } from '../../../shared/workflow-engine';
import { useProjects } from '@/hooks/useProjectContext';
import { WorkflowNode } from './WorkflowNode';
import { WorkflowEdgeComponent } from './WorkflowEdgeComponent';
import { computeLayout, computeEdges, computeActiveHandles } from './graphLayout';

const NODE_TYPES = { workflow: WorkflowNode } as const;
const EDGE_TYPES = { workflow: WorkflowEdgeComponent } as const;

interface WorkflowComparisonViewProps {
  engines: Map<string, WorkflowEngine>;
}

export function WorkflowComparisonView({ engines }: WorkflowComparisonViewProps) {
  const { getProjectName, getProjectColor, setActiveProjectId } = useProjects();

  const entries = useMemo(
    () => [...engines.entries()],
    [engines],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pb-4">
      {entries.map(([projectId, engine]) => (
        <ProjectWorkflowCard
          key={projectId}
          projectId={projectId}
          engine={engine}
          name={getProjectName(projectId)}
          color={getProjectColor(projectId)}
          onNavigate={() => setActiveProjectId(projectId)}
        />
      ))}
    </div>
  );
}

// ─── Per-project card ────────────────────────────────────

interface ProjectWorkflowCardProps {
  projectId: string;
  engine: WorkflowEngine;
  name: string;
  color: string;
  onNavigate: () => void;
}

function ProjectWorkflowCard({ engine, name, color, onNavigate }: ProjectWorkflowCardProps) {
  const config = engine.getConfig();
  const lists = useMemo(() => [...config.lists].sort((a, b) => a.order - b.order), [config.lists]);

  const activeHandles = useMemo(
    () => computeActiveHandles(config.edges, lists),
    [config.edges, lists],
  );

  const nodes = useMemo(
    () => computeLayout(lists, config.groups ?? [], new Map(), config.edges).map((node) => ({
      ...node,
      data: { ...node.data, activeHandles: activeHandles.get(node.id) },
    })),
    [lists, config.groups, config.edges, activeHandles],
  );

  const edges = useMemo(
    () => computeEdges(config.edges, lists, config.hooks ?? [], false),
    [config.edges, lists, config.hooks],
  );

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/30">
      {/* Project header */}
      <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-2.5">
        <div className="flex items-center gap-2.5">
          <div
            className="h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: `hsl(${color})` }}
          />
          <span className="text-sm font-medium text-foreground/90">{name}</span>
          <span className="text-xs text-muted-foreground">
            {config.name} &middot; {lists.length} lists &middot; {config.edges.length} edges
          </span>
        </div>
        <button
          onClick={onNavigate}
          className="rounded px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-zinc-800 hover:text-foreground"
        >
          View &amp; Edit
        </button>
      </div>

      {/* Mini graph */}
      <div className="h-[280px]">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={NODE_TYPES}
          edgeTypes={EDGE_TYPES}
          fitView
          fitViewOptions={{ padding: 0.12 }}
          minZoom={0.15}
          maxZoom={1}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          panOnDrag={false}
          zoomOnScroll={false}
          zoomOnPinch={false}
          zoomOnDoubleClick={false}
          preventScrolling={false}
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#27272a" />
        </ReactFlow>
      </div>
    </div>
  );
}
