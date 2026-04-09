import { useState, useMemo, useCallback, useEffect } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  BackgroundVariant,
} from '@xyflow/react';
import type { NodeMouseHandler, EdgeMouseHandler } from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { Workflow, Zap, Pencil, LayoutGrid } from 'lucide-react';
import type { WorkflowHook, UnifiedHook } from '../../shared/workflow-config';
import { allEnginesMatch } from '../../shared/workflow-normalizer';
import { useWorkflow } from '@/hooks/useWorkflow';
import { useScopes } from '@/hooks/useScopes';
import { useCcHooks } from '@/hooks/useCcHooks';
import { useProjects } from '@/hooks/useProjectContext';
import { ProjectTabBar } from '@/components/ProjectTabBar';
import { WorkflowComparisonView } from '@/components/workflow/WorkflowComparisonView';
import { WorkflowNode } from '@/components/workflow/WorkflowNode';
import type { WorkflowNodeType } from '@/components/workflow/WorkflowNode';
import { WorkflowEdgeComponent } from '@/components/workflow/WorkflowEdgeComponent';
import type { WorkflowEdgeType } from '@/components/workflow/WorkflowEdgeComponent';
import { NodeDetailPanel } from '@/components/workflow/NodeDetailPanel';
import { EdgeDetailPanel } from '@/components/workflow/EdgeDetailPanel';
import { PresetSelector } from '@/components/workflow/PresetSelector';
import { HookSourceModal } from '@/components/workflow/HookSourceModal';
import { HooksDashboard } from '@/components/workflow/HooksDashboard';
import { HookDetailPanel } from '@/components/workflow/HookDetailPanel';
import { ListPropertyEditor } from '@/components/workflow/ListPropertyEditor';
import { EdgePropertyEditor } from '@/components/workflow/EdgePropertyEditor';
import { EditToolbar } from '@/components/workflow/EditToolbar';
import { AddListDialog } from '@/components/workflow/AddListDialog';
import { AddEdgeDialog } from '@/components/workflow/AddEdgeDialog';
import { MigrationPreviewDialog } from '@/components/workflow/MigrationPreviewDialog';
import { ConfigSettingsPanel } from '@/components/workflow/ConfigSettingsPanel';
import { useWorkflowEditor } from '@/components/workflow/useWorkflowEditor';
import { computeLayout, computeEdges, computeActiveHandles } from '@/components/workflow/graphLayout';
import { mergeHooks } from '@/components/workflow/mergeHooks';

// ─── Constants ──────────────────────────────────────────

const NODE_TYPES = { workflow: WorkflowNode } as const;
const EDGE_TYPES = { workflow: WorkflowEdgeComponent } as const;

// ─── Detail Panel State ─────────────────────────────────

type DetailState =
  | { type: 'none' }
  | { type: 'node'; listId: string }
  | { type: 'edge'; from: string; to: string };

type ActiveTab = 'graph' | 'hooks';

// ─── Component ──────────────────────────────────────────

export default function WorkflowVisualizer() {
  const { engine } = useWorkflow();
  const { scopes } = useScopes();
  const { ccHooks } = useCcHooks();
  const { activeProjectId, hasMultipleProjects, projectEngines } = useProjects();
  const isAllProjects = hasMultipleProjects && activeProjectId === null;
  const config = engine.getConfig();
  const editor = useWorkflowEditor(config);

  // Determine if all projects share the same workflow
  const isDivergent = useMemo(() => {
    if (!isAllProjects || projectEngines.size === 0) return false;
    return !allEnginesMatch([...projectEngines.values()]);
  }, [isAllProjects, projectEngines]);

  // The config to display: either the edit draft or the live config
  const displayConfig = editor.editMode ? editor.editConfig : config;
  const displayLists = useMemo(() => [...displayConfig.lists].sort((a, b) => a.order - b.order), [displayConfig.lists]);
  const displayEdges = displayConfig.edges;
  const displayHooks = displayConfig.hooks ?? [];

  // Unified hooks: workflow + CC merged
  const unifiedHooks = useMemo(() => mergeHooks(displayHooks, ccHooks), [displayHooks, ccHooks]);

  // Tab state
  const [activeTab, setActiveTab] = useState<ActiveTab>('graph');

  // Source modal (shared across tabs)
  const [sourceModalHook, setSourceModalHook] = useState<UnifiedHook | null>(null);

  // Hooks tab: selected hook for detail panel
  const [selectedHookForDetail, setSelectedHookForDetail] = useState<UnifiedHook | null>(null);

  // Adapter: convert WorkflowHook click from Edge/NodeDetailPanel to source modal
  const handleWorkflowHookClick = useCallback((wfHook: WorkflowHook) => {
    const unified = unifiedHooks.find((u) => u.id === wfHook.id);
    if (unified) setSourceModalHook(unified);
  }, [unifiedHooks]);

  // Cross-tab: navigate from HookDetailPanel edge click to Graph tab
  const handleNavigateToEdge = useCallback((from: string, to: string) => {
    setSelectedHookForDetail(null);
    setActiveTab('graph');
    setDetail({ type: 'edge', from, to });
  }, []);

  // Scope counts
  const scopeCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const scope of scopes) {
      counts.set(scope.status, (counts.get(scope.status) ?? 0) + 1);
    }
    return counts;
  }, [scopes]);

  // Build graph data from display config
  const activeHandles = useMemo(
    () => computeActiveHandles(displayEdges, displayLists),
    [displayEdges, displayLists],
  );
  const graphNodes = useMemo(
    () => computeLayout(displayLists, displayConfig.groups ?? [], scopeCounts, displayEdges).map((node) => ({
      ...node,
      data: { ...node.data, activeHandles: activeHandles.get(node.id) },
    })),
    [displayLists, displayConfig.groups, scopeCounts, displayEdges, activeHandles],
  );
  const graphEdges = useMemo(
    () => computeEdges(displayEdges, displayLists, displayHooks, false),
    [displayEdges, displayLists, displayHooks],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(graphNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(graphEdges);

  // Sync React Flow state when the computed graph data changes (e.g. preset switch)
  useEffect(() => { setNodes(graphNodes); }, [graphNodes, setNodes]);
  useEffect(() => { setEdges(graphEdges); }, [graphEdges, setEdges]);

  // Detail panel (graph tab)
  const [detail, setDetail] = useState<DetailState>({ type: 'none' });

  const onNodeClick: NodeMouseHandler<WorkflowNodeType> = useCallback((_event, node) => {
    setDetail({ type: 'node', listId: node.id });
  }, []);

  const onEdgeClick: EdgeMouseHandler<WorkflowEdgeType> = useCallback((_event, edge) => {
    const [from, to] = edge.id.split(':');
    setDetail({ type: 'edge', from, to });
  }, []);

  const onPaneClick = useCallback(() => setDetail({ type: 'none' }), []);

  // Resolve selected items from display config
  const selectedList = detail.type === 'node'
    ? displayConfig.lists.find((l) => l.id === detail.listId) ?? null
    : null;
  const selectedEdge = detail.type === 'edge'
    ? displayEdges.find((e) => e.from === detail.from && e.to === detail.to) ?? null
    : null;

  const nodeHooks = useMemo(() => {
    if (!selectedList) return [];
    const relevant = displayEdges.filter((e) => e.from === selectedList.id || e.to === selectedList.id);
    const hookIds = new Set(relevant.flatMap((e) => e.hooks ?? []));
    return displayHooks.filter((h) => hookIds.has(h.id));
  }, [selectedList, displayEdges, displayHooks]);

  const nodeConnectedEdges = useMemo(() => {
    if (!selectedList) return [];
    return displayEdges.filter((e) => e.from === selectedList.id || e.to === selectedList.id);
  }, [selectedList, displayEdges]);

  const edgeHooks = useMemo(() => {
    if (!selectedEdge) return [];
    return (selectedEdge.hooks ?? [])
      .map((id) => displayHooks.find((h) => h.id === id))
      .filter((h): h is NonNullable<typeof h> => h !== undefined);
  }, [selectedEdge, displayHooks]);

  return (
    <div className="flex flex-1 min-h-0 flex-col">
      {/* Project Tab Bar (multi-project only) */}
      <ProjectTabBar />

      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Workflow className="h-4 w-4 text-primary" />
          <h1 className="text-xl font-light">Workflow</h1>
          {isAllProjects && (
            <span className="rounded bg-zinc-500/20 px-2 py-0.5 text-[10px] font-semibold text-zinc-400">
              READ-ONLY
            </span>
          )}
          {editor.editMode && (
            <span className="rounded bg-cyan-500/20 px-2 py-0.5 text-[10px] font-semibold text-cyan-400">
              EDIT MODE
            </span>
          )}

          {/* Tab navigation */}
          {!editor.editMode && (
            <div className="ml-4 flex rounded-lg border border-zinc-800 bg-zinc-900/50 p-0.5">
              <TabButton
                active={activeTab === 'graph'}
                onClick={() => setActiveTab('graph')}
                icon={<LayoutGrid className="h-3 w-3" />}
                label="Graph"
              />
              <TabButton
                active={activeTab === 'hooks'}
                onClick={() => setActiveTab('hooks')}
                icon={<Zap className="h-3 w-3" />}
                label="Hooks"
                count={unifiedHooks.length}
              />
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {!editor.editMode && !isAllProjects && (
            <button
              onClick={editor.enterEditMode}
              className="flex items-center gap-1.5 rounded border border-zinc-800 px-3 py-1.5 text-xs text-zinc-400 transition-colors hover:border-cyan-500/40 hover:text-cyan-400"
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </button>
          )}
          {!editor.editMode && !isAllProjects && <PresetSelector activeConfigName={config.name} />}
        </div>
      </div>

      {/* Edit Toolbar */}
      {editor.editMode && (
        <div className="mb-3">
          <EditToolbar
            canUndo={editor.canUndo}
            canRedo={editor.canRedo}
            changeCount={editor.changeCount}
            validation={editor.validation}
            saving={editor.saving}
            onAddList={() => editor.setShowAddList(true)}
            onAddEdge={() => editor.setShowAddEdge(true)}
            onConfigSettings={() => { editor.setShowConfigSettings(true); setDetail({ type: 'none' }); }}
            onUndo={editor.undo}
            onRedo={editor.redo}
            onSave={editor.save}
            onDiscard={editor.discard}
            onPreview={editor.preview}
          />
        </div>
      )}

      {/* ─── Graph Tab ────────────────────────────────── */}
      {(activeTab === 'graph' || editor.editMode) && isAllProjects && isDivergent && (
        <WorkflowComparisonView engines={projectEngines} />
      )}
      {(activeTab === 'graph' || editor.editMode) && !(isAllProjects && isDivergent) && (
        <div className="flex min-h-0 flex-1 gap-3">
          {/* React Flow Canvas */}
          <div
            className="min-h-0 flex-1 rounded-lg border bg-transparent"
            style={{ borderColor: editor.editMode ? '#3b82f640' : '#27272a' }}
          >
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              nodeTypes={NODE_TYPES}
              edgeTypes={EDGE_TYPES}
              onNodeClick={onNodeClick}
              onEdgeClick={onEdgeClick}
              onPaneClick={onPaneClick}
              fitView
              fitViewOptions={{ padding: 0.08 }}
              minZoom={0.3}
              maxZoom={2}
              proOptions={{ hideAttribution: true }}
            >
              <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#27272a" />
              <Controls className="!border-zinc-800 !bg-zinc-900 [&>button]:!border-zinc-800 [&>button]:!bg-zinc-900 [&>button]:!fill-zinc-400 [&>button:hover]:!bg-zinc-800" />
            </ReactFlow>
          </div>

          {/* Edit mode panels */}
          {editor.editMode && detail.type === 'node' && selectedList && (
            <ListPropertyEditor
              key={selectedList.id}
              list={selectedList}
              config={editor.editConfig}
              onSave={(updated) => { editor.updateList(selectedList, updated); setDetail({ type: 'none' }); }}
              onDelete={() => { editor.deleteList(selectedList.id); setDetail({ type: 'none' }); }}
              onClose={() => setDetail({ type: 'none' })}
            />
          )}
          {editor.editMode && detail.type === 'edge' && selectedEdge && (
            <EdgePropertyEditor
              key={`${selectedEdge.from}:${selectedEdge.to}`}
              edge={selectedEdge}
              config={editor.editConfig}
              onSave={(updated) => { editor.updateEdge(selectedEdge, updated); setDetail({ type: 'none' }); }}
              onDelete={() => { editor.deleteEdge(selectedEdge.from, selectedEdge.to); setDetail({ type: 'none' }); }}
              onClose={() => setDetail({ type: 'none' })}
            />
          )}
          {editor.editMode && editor.showConfigSettings && detail.type === 'none' && (
            <ConfigSettingsPanel
              config={editor.editConfig}
              onUpdate={editor.updateConfig}
              onClose={() => editor.setShowConfigSettings(false)}
            />
          )}

          {/* Read-only panels (graph tab only, not edit mode) */}
          {!editor.editMode && detail.type === 'node' && (
            <NodeDetailPanel list={selectedList} hooks={nodeHooks} connectedEdges={nodeConnectedEdges} onClose={() => setDetail({ type: 'none' })} onHookClick={handleWorkflowHookClick} />
          )}
          {!editor.editMode && detail.type === 'edge' && (
            <EdgeDetailPanel edge={selectedEdge} hooks={edgeHooks} onClose={() => setDetail({ type: 'none' })} onHookClick={handleWorkflowHookClick} />
          )}
        </div>
      )}

      {/* ─── Hooks Tab ────────────────────────────────── */}
      {activeTab === 'hooks' && !editor.editMode && (
        <div className="flex min-h-0 flex-1 gap-3">
          <HooksDashboard
            hooks={unifiedHooks}
            edges={displayEdges}
            onHookClick={setSelectedHookForDetail}
          />
          {selectedHookForDetail && (
            <HookDetailPanel
              hook={selectedHookForDetail}
              edges={displayEdges}
              onClose={() => setSelectedHookForDetail(null)}
              onViewSource={setSourceModalHook}
              onNavigateToEdge={handleNavigateToEdge}
            />
          )}
        </div>
      )}

      {/* Dialogs */}
      <AddListDialog
        open={editor.showAddList}
        onOpenChange={editor.setShowAddList}
        config={editor.editConfig}
        onAdd={editor.addList}
      />
      <AddEdgeDialog
        open={editor.showAddEdge}
        onOpenChange={editor.setShowAddEdge}
        config={editor.editConfig}
        onAdd={editor.addEdge}
      />
      <MigrationPreviewDialog
        open={editor.showPreview}
        onOpenChange={editor.setShowPreview}
        config={editor.editConfig}
        plan={editor.previewPlan}
        loading={editor.previewLoading}
        error={editor.previewError}
        onApply={editor.applyMigration}
      />
      <HookSourceModal
        hook={sourceModalHook}
        open={sourceModalHook !== null}
        onClose={() => setSourceModalHook(null)}
      />
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────

function TabButton({ active, onClick, icon, label, count }: {
  active: boolean; onClick: () => void; icon: React.ReactNode; label: string; count?: number;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
      style={{
        backgroundColor: active ? '#27272a' : 'transparent',
        color: active ? '#e4e4e7' : '#71717a',
      }}
    >
      {icon}
      {label}
      {count !== undefined && count > 0 && (
        <span
          className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold leading-none"
          style={{
            backgroundColor: active ? '#f9731630' : '#27272a',
            color: active ? '#f97316' : '#71717a',
          }}
        >
          {count}
        </span>
      )}
    </button>
  );
}
