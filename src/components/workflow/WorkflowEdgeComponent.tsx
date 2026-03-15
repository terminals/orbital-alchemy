import { memo } from 'react';
import { BaseEdge, getSmoothStepPath, EdgeLabelRenderer } from '@xyflow/react';
import type { Edge, EdgeProps } from '@xyflow/react';
import type { WorkflowEdge as WfEdge, HookCategory } from '../../../shared/workflow-config';

// ─── Types ──────────────────────────────────────────────

export interface WorkflowEdgeData {
  edge: WfEdge;
  hookCount?: number;
  hasBlockingHook?: boolean;
  highestCategory?: HookCategory;
  showHookOverlay?: boolean;
  [key: string]: unknown;
}

export type WorkflowEdgeType = Edge<WorkflowEdgeData, 'workflow'>;

// ─── Color maps ─────────────────────────────────────────

const DIRECTION_COLORS: Record<string, string> = {
  forward: '#22c55e',
  backward: '#f59e0b',
  shortcut: '#6366f1',
};

const CATEGORY_BADGE_COLORS: Record<HookCategory, { bg: string; border: string }> = {
  guard: { bg: '#ef4444', border: '#dc2626' },
  gate: { bg: '#f59e0b', border: '#d97706' },
  lifecycle: { bg: '#3b82f6', border: '#2563eb' },
  observer: { bg: '#6b7280', border: '#4b5563' },
};

// ─── Component ──────────────────────────────────────────

function WorkflowEdgeRaw({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
}: EdgeProps<WorkflowEdgeType>) {
  const edge = data?.edge;
  const hookCount = data?.hookCount ?? 0;
  const highestCategory = data?.highestCategory;
  const showHookOverlay = data?.showHookOverlay ?? false;
  const color = DIRECTION_COLORS[edge?.direction ?? 'forward'] ?? '#22c55e';

  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    borderRadius: 12,
    offset: 25,
  });


  // Badge colors based on highest enforcement category
  const badgeColors = highestCategory
    ? CATEGORY_BADGE_COLORS[highestCategory]
    : { bg: '#3b82f6', border: '#2563eb' };

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: color,
          strokeWidth: selected ? 2.5 : 1.5,
          strokeDasharray: edge?.direction === 'shortcut' ? '6 4' : undefined,
          opacity: selected ? 1 : 0.6,
          filter: selected ? `drop-shadow(0 0 4px ${color}80)` : undefined,
        }}
      />

      {/* Glow filter for animated dot */}
      <defs>
        <filter id={`glow-${id}`} x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="blur" />
          </feMerge>
        </filter>
      </defs>

      {/* Pulsing glow layer (behind) */}
      <circle fill={color} filter={`url(#glow-${id})`} opacity={0.35}>
        <animate attributeName="r" values="3;7;3" dur="1.5s" repeatCount="indefinite" />
        <animateMotion dur="3s" repeatCount="indefinite" path={edgePath} />
      </circle>

      {/* Solid dot (on top) */}
      <circle r="2.5" fill={color} opacity={1}>
        <animateMotion dur="3s" repeatCount="indefinite" path={edgePath} />
      </circle>

      {/* Label */}
      <EdgeLabelRenderer>
        <div
          className="nodrag nopan pointer-events-auto cursor-pointer rounded px-1.5 py-0.5 text-[9px] font-medium transition-opacity"
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            color,
            backgroundColor: 'rgb(9 9 11 / 0.85)',
            border: `1px solid ${color}33`,
            opacity: selected ? 1 : 0,
          }}
        >
          {edge?.label ?? ''}
        </div>

        {/* Hook count badge */}
        {showHookOverlay && hookCount > 0 && (
          <div
            className="nodrag nopan pointer-events-none flex items-center justify-center rounded-full text-[8px] font-bold"
            style={{
              position: 'absolute',
              transform: `translate(-50%, -120%) translate(${labelX}px,${labelY}px)`,
              width: 18,
              height: 18,
              backgroundColor: badgeColors.bg,
              color: '#fff',
              border: `2px solid ${badgeColors.border}`,
              boxShadow: `0 0 6px ${badgeColors.bg}80`,
            }}
          >
            {hookCount}
          </div>
        )}
      </EdgeLabelRenderer>
    </>
  );
}

export const WorkflowEdgeComponent = memo(WorkflowEdgeRaw);
