import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { Node, NodeProps } from '@xyflow/react';
import type { WorkflowList } from '../../../shared/workflow-config';
import { Star, Package, Zap } from 'lucide-react';

// ─── Types ──────────────────────────────────────────────

export interface WorkflowNodeData {
  list: WorkflowList;
  scopeCount: number;
  activeHandles?: Map<string, string>;
  [key: string]: unknown;
}

export type WorkflowNodeType = Node<WorkflowNodeData, 'workflow'>;

// ─── Component ──────────────────────────────────────────

function WorkflowNodeComponent({ data, selected }: NodeProps<WorkflowNodeType>) {
  const { list, scopeCount, activeHandles } = data;
  const has = (id: string) => !activeHandles || activeHandles.has(id);
  const handleColor = (id: string) => activeHandles?.get(id) ?? list.hex;

  return (
    <div
      className="group relative rounded-lg border px-4 py-3 transition-all duration-200"
      style={{
        borderColor: selected ? list.hex : `${list.hex}66`,
        backgroundColor: `${list.hex}12`,
        boxShadow: selected ? `0 0 16px ${list.hex}40` : 'none',
        minWidth: 180,
      }}
    >
      {/* ── Target Handles (incoming) ── */}

      {has('left') && (
        <Handle
          type="target"
          id="left"
          position={Position.Left}
          className="!h-2.5 !w-2.5 !border-2 !border-zinc-800"
          style={{ backgroundColor: handleColor('left') }}
        />
      )}

      {has('top') && (
        <Handle
          type="target"
          id="top"
          position={Position.Top}
          className="!h-2.5 !w-2.5 !border-2 !border-zinc-800"
          style={{ backgroundColor: handleColor('top'), left: '35%' }}
        />
      )}

      {has('bottom-in') && (
        <Handle
          type="target"
          id="bottom-in"
          position={Position.Bottom}
          className="!h-2.5 !w-2.5 !border-2 !border-zinc-800"
          style={{ backgroundColor: handleColor('bottom-in'), left: '65%' }}
        />
      )}

      {/* Header row */}
      <div className="flex items-center gap-2">
        {list.isEntryPoint && (
          <Star className="h-3.5 w-3.5 shrink-0 fill-current" style={{ color: list.hex }} />
        )}
        <span className="text-sm font-medium text-foreground">{list.label}</span>
        {scopeCount > 0 && (
          <span
            className="ml-auto rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none"
            style={{
              backgroundColor: `${list.hex}25`,
              color: list.hex,
            }}
          >
            {scopeCount}
          </span>
        )}
      </div>

      {/* Badge row — always rendered to keep all nodes the same height */}
      <div className="mt-1.5 flex items-center gap-1.5" style={{ minHeight: 18 }}>
        {list.supportsBatch && (
          <span className="flex items-center gap-0.5 rounded bg-zinc-800/60 px-1.5 py-0.5 text-[9px] text-zinc-400">
            <Package className="h-2.5 w-2.5" />
            batch
          </span>
        )}
        {list.supportsSprint && (
          <span className="flex items-center gap-0.5 rounded bg-zinc-800/60 px-1.5 py-0.5 text-[9px] text-zinc-400">
            <Zap className="h-2.5 w-2.5" />
            sprint
          </span>
        )}
      </div>

      {/* ── Source Handles (outgoing) ── */}

      {has('top-out') && (
        <Handle
          type="source"
          id="top-out"
          position={Position.Top}
          className="!h-2.5 !w-2.5 !border-2 !border-zinc-800"
          style={{ backgroundColor: handleColor('top-out'), left: '65%' }}
        />
      )}

      {has('right') && (
        <Handle
          type="source"
          id="right"
          position={Position.Right}
          className="!h-2.5 !w-2.5 !border-2 !border-zinc-800"
          style={{ backgroundColor: handleColor('right') }}
        />
      )}

      {has('bottom-fwd') && (
        <Handle
          type="source"
          id="bottom-fwd"
          position={Position.Bottom}
          className="!h-2.5 !w-2.5 !border-2 !border-zinc-800"
          style={{ backgroundColor: handleColor('bottom-fwd'), left: '65%' }}
        />
      )}

      {has('bottom') && (
        <Handle
          type="source"
          id="bottom"
          position={Position.Bottom}
          className="!h-2.5 !w-2.5 !border-2 !border-zinc-800"
          style={{ backgroundColor: handleColor('bottom'), left: '35%' }}
        />
      )}
    </div>
  );
}

export const WorkflowNode = memo(WorkflowNodeComponent);
