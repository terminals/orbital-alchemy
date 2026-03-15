import type { WorkflowList, WorkflowEdge, WorkflowHook, ListGroup, HookCategory } from '../../../shared/workflow-config';
import type { WorkflowNodeType, WorkflowNodeData } from './WorkflowNode';
import type { WorkflowEdgeType, WorkflowEdgeData } from './WorkflowEdgeComponent';

// ─── Constants ──────────────────────────────────────────

const NODE_X_GAP = 260;        // horizontal gap between nodes in a row
const STAIRCASE_INDENT = 230;  // horizontal offset per previous-group node (multi-node groups)
const SOLO_GROUP_INDENT = 160;  // horizontal offset for single-node groups
const ROW_Y_GAP = 140;        // vertical gap between rows
const MARGIN = 16;             // canvas margin

// ─── Cascading Staircase Layout ─────────────────────────

export function computeLayout(
  lists: WorkflowList[],
  groups: ListGroup[],
  scopeCounts: Map<string, number>,
  _edges: WorkflowEdge[],
): WorkflowNodeType[] {
  // Build group lookup: groupId -> sorted ListGroup
  const sortedGroups = [...groups].sort((a, b) => a.order - b.order);
  const groupOrder = new Map(sortedGroups.map((g, i) => [g.id, i]));

  // Bucket lists into groups (preserve list order within each group)
  const buckets = new Map<string, WorkflowList[]>();
  for (const g of sortedGroups) buckets.set(g.id, []);
  const ungrouped: WorkflowList[] = [];

  for (const list of lists) {
    if (list.group && buckets.has(list.group)) {
      buckets.get(list.group)!.push(list);
    } else {
      ungrouped.push(list);
    }
  }

  // Compute starting x offset for each group (cascading staircase)
  // Multi-node groups use STAIRCASE_INDENT per node, single-node groups use SOLO_GROUP_INDENT
  const groupStartX = new Map<string, number>();
  let xOffset = 0;
  for (const g of sortedGroups) {
    groupStartX.set(g.id, xOffset);
    const size = buckets.get(g.id)!.length;
    xOffset += size === 1
      ? SOLO_GROUP_INDENT
      : size * STAIRCASE_INDENT;
  }

  // Position nodes
  const positioned: WorkflowNodeType[] = [];

  for (const g of sortedGroups) {
    const row = groupOrder.get(g.id)!;
    const startX = groupStartX.get(g.id)!;
    const groupLists = buckets.get(g.id)!;

    for (let i = 0; i < groupLists.length; i++) {
      const list = groupLists[i];
      positioned.push({
        id: list.id,
        type: 'workflow' as const,
        position: {
          x: MARGIN + startX + i * NODE_X_GAP,
          y: MARGIN + row * ROW_Y_GAP,
        },
        data: { list, scopeCount: scopeCounts.get(list.id) ?? 0 } satisfies WorkflowNodeData,
      });
    }
  }

  // Ungrouped nodes go in an extra row at the bottom
  if (ungrouped.length > 0) {
    const extraRow = sortedGroups.length;
    for (let i = 0; i < ungrouped.length; i++) {
      const list = ungrouped[i];
      positioned.push({
        id: list.id,
        type: 'workflow' as const,
        position: {
          x: MARGIN + i * NODE_X_GAP,
          y: MARGIN + extraRow * ROW_Y_GAP,
        },
        data: { list, scopeCount: scopeCounts.get(list.id) ?? 0 } satisfies WorkflowNodeData,
      });
    }
  }

  return positioned;
}

// ─── Edges ──────────────────────────────────────────────

export function computeEdges(
  edges: WorkflowEdge[],
  lists: WorkflowList[],
  allHooks: WorkflowHook[],
  showHookOverlay: boolean,
): WorkflowEdgeType[] {
  const hookMap = new Map(allHooks.map((h) => [h.id, h]));
  const listMap = new Map(lists.map((l) => [l.id, l]));
  const categoryPriority: HookCategory[] = ['guard', 'gate', 'lifecycle', 'observer'];

  return edges.map((edge) => {
    const edgeHookIds = edge.hooks ?? [];
    const edgeHooks = edgeHookIds.map((id) => hookMap.get(id)).filter((h): h is WorkflowHook => h !== undefined);
    const highestCategory = categoryPriority.find((cat) => edgeHooks.some((h) => h.category === cat));

    const sourceList = listMap.get(edge.from);
    const targetList = listMap.get(edge.to);
    const sameGroup = sourceList?.group != null && sourceList.group === targetList?.group;

    const { sourceHandle, targetHandle } = pickHandles(edge.direction, sameGroup);

    return {
      id: `${edge.from}:${edge.to}`,
      source: edge.from,
      target: edge.to,
      sourceHandle,
      targetHandle,
      type: 'workflow',
      data: {
        edge,
        hookCount: edgeHookIds.length,
        hasBlockingHook: edgeHooks.some((h) => h.blocking === true),
        highestCategory,
        showHookOverlay,
      } satisfies WorkflowEdgeData,
    };
  });
}

// ─── Handle Selection ───────────────────────────────────

// ─── Active Handles ─────────────────────────────────────

const DIRECTION_COLORS: Record<string, string> = {
  forward: '#22c55e',
  backward: '#f59e0b',
  shortcut: '#6366f1',
};

/** Returns nodeId → Map<handleId, edgeColor> */
export function computeActiveHandles(
  edges: WorkflowEdge[],
  lists: WorkflowList[],
): Map<string, Map<string, string>> {
  const listMap = new Map(lists.map((l) => [l.id, l]));
  const result = new Map<string, Map<string, string>>();

  for (const edge of edges) {
    const sourceList = listMap.get(edge.from);
    const targetList = listMap.get(edge.to);
    const sameGroup = sourceList?.group != null && sourceList.group === targetList?.group;
    const { sourceHandle, targetHandle } = pickHandles(edge.direction, sameGroup);
    const color = DIRECTION_COLORS[edge.direction] ?? '#22c55e';

    if (!result.has(edge.from)) result.set(edge.from, new Map());
    if (!result.has(edge.to)) result.set(edge.to, new Map());
    result.get(edge.from)!.set(sourceHandle, color);
    result.get(edge.to)!.set(targetHandle, color);
  }

  return result;
}

// ─── Handle Selection ───────────────────────────────────

function pickHandles(
  direction: WorkflowEdge['direction'],
  sameGroup: boolean,
): { sourceHandle: string; targetHandle: string } {
  if (direction === 'backward') {
    return { sourceHandle: 'bottom', targetHandle: 'bottom-in' };
  }

  if (direction === 'shortcut') {
    // Rise above the row to skip intermediate nodes
    return { sourceHandle: 'top-out', targetHandle: 'top' };
  }

  // forward
  return sameGroup
    ? { sourceHandle: 'right', targetHandle: 'left' }      // horizontal within row
    : { sourceHandle: 'bottom-fwd', targetHandle: 'left' };  // cross-group: exits bottom-right, enters left
}
