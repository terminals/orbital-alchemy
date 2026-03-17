import { useState, useCallback, useMemo } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { Puzzle, Zap, Terminal, Trash2 } from 'lucide-react';
import { useZoomModifier } from '@/hooks/useZoomModifier';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DirectoryTree, type AgentTeamInfo } from '@/components/config/DirectoryTree';
import { FileEditor } from '@/components/config/FileEditor';
import { UnifiedWorkflowPipeline } from '@/components/config/UnifiedWorkflowPipeline';
import { useWorkflowEditor } from '@/components/workflow/useWorkflowEditor';
import { useWorkflow } from '@/hooks/useWorkflow';
import { useConfigTree } from '@/hooks/useConfigTree';
import { usePipelineData } from '@/hooks/usePipelineData';
import { useFileEditor } from '@/hooks/useFileEditor';
import { cn } from '@/lib/utils';
import type { ConfigPrimitiveType, ConfigFileNode } from '@/types';
import type { HookCategory } from '../../shared/workflow-config';

/** Extract a logical ID from a file path: folder name or filename without extension */
function extractIdFromPath(path: string): string {
  const parts = path.split('/');
  const filename = parts[parts.length - 1];
  // If the file is inside a named folder (e.g., "scope-create/SKILL.md"), use the folder name
  if (parts.length >= 2 && /^(SKILL|AGENT)\.md$/i.test(filename)) {
    return parts[parts.length - 2].toLowerCase();
  }
  return filename.replace(/\.(md|sh)$/, '').toLowerCase();
}

export function PrimitivesConfig() {
  const [activeTab, setActiveTab] = useState<ConfigPrimitiveType>('agents');
  const [selectedFile, setSelectedFile] = useState<{ type: ConfigPrimitiveType; path: string } | null>(null);
  const [activeDrag, setActiveDrag] = useState<{ type: string; name: string } | null>(null);

  const { tree, loading: treeLoading, refresh } = useConfigTree(activeTab);

  const editorType = selectedFile?.type ?? null;
  const editorPath = selectedFile?.path ?? null;

  const {
    content,
    setContent,
    frontmatter,
    setFrontmatterField,
    body,
    setBody,
    dirty,
    saving: fileSaving,
    loading: fileLoading,
    save: fileSave,
    error: fileError,
  } = useFileEditor(editorType, editorPath);

  // Workflow editor for pipeline mutations
  const { engine } = useWorkflow();
  const activeConfig = engine.getConfig();
  const editor = useWorkflowEditor(activeConfig);

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );
  const modifiers = useZoomModifier();

  const handleTabChange = useCallback((value: string) => {
    setActiveTab(value as ConfigPrimitiveType);
    setSelectedFile(null);
  }, []);

  const handleFileSelect = useCallback((node: ConfigFileNode) => {
    if (node.type === 'file') {
      setSelectedFile({ type: activeTab, path: node.path });
    }
  }, [activeTab]);

  // Cross-panel selection from the pipeline
  const handlePipelineSelect = useCallback((type: ConfigPrimitiveType, path: string) => {
    setActiveTab(type);
    setSelectedFile({ type, path });
  }, []);

  // ─── Remove Handlers ──────────────────────────────────

  const handleRemoveEdgeHook = useCallback((from: string, to: string, hookId: string) => {
    if (!editor.editMode) editor.enterEditMode();
    const edge = editor.editConfig.edges.find(e => e.from === from && e.to === to);
    if (!edge) return;
    editor.updateEdge(edge, { ...edge, hooks: (edge.hooks ?? []).filter(h => h !== hookId) });
  }, [editor]);

  const handleRemoveStageHook = useCallback((listId: string, hookId: string) => {
    if (!editor.editMode) editor.enterEditMode();
    const list = editor.editConfig.lists.find(l => l.id === listId);
    if (!list) return;
    editor.updateList(list, { ...list, activeHooks: (list.activeHooks ?? []).filter(h => h !== hookId) });
  }, [editor]);

  const handleRemoveGlobalHook = useCallback((hookId: string) => {
    if (!editor.editMode) editor.enterEditMode();
    // Build a single atomic config update — multiple updateList/updateEdge
    // calls would each read stale history.present within the same render batch
    const config = structuredClone(editor.editMode ? editor.editConfig : activeConfig);
    for (const list of config.lists) {
      if (list.activeHooks?.includes(hookId)) {
        list.activeHooks = list.activeHooks.filter(h => h !== hookId);
      }
    }
    for (const edge of config.edges) {
      if (edge.hooks?.includes(hookId)) {
        edge.hooks = edge.hooks.filter(h => h !== hookId);
      }
    }
    editor.updateConfig(config);
  }, [editor, activeConfig]);

  const pipelineEditConfig = editor.editMode ? editor.editConfig : undefined;

  // ─── Pipeline-derived active paths & hook categories ───
  const pipelineData = usePipelineData(pipelineEditConfig);

  // Reverse map: tree path → hook ID (for drag-drop resolution)
  const hookIdByPath = useMemo(() => {
    const map = new Map<string, string>();
    for (const [id, treePath] of pipelineData.hookPathMap) {
      map.set(treePath, id);
    }
    return map;
  }, [pipelineData.hookPathMap]);

  // ─── DnD Handlers ──────────────────────────────────────

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const dragId = String(event.active.id);
    if (dragId.startsWith('pipeline::')) {
      const data = event.active.data.current as { hookId?: string } | undefined;
      setActiveDrag({ type: 'pipeline', name: data?.hookId ?? 'hook' });
      return;
    }
    const data = event.active.data.current as { type?: string; name?: string } | undefined;
    if (data?.type && data?.name) {
      setActiveDrag({ type: data.type, name: data.name });
    }
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setActiveDrag(null);
    const { active, over } = event;
    if (!over) return;

    const dragId = String(active.id);
    const dropId = String(over.id);

    // ─── Pipeline → Tree (removal) ──────────────────────
    if (dropId === 'drop::remove') {
      const edgeHookMatch = dragId.match(/^pipeline::edge-hook::(.+?):(.+?)::(.+)$/);
      if (edgeHookMatch) {
        const [, from, to, hookId] = edgeHookMatch;
        handleRemoveEdgeHook(from, to, hookId);
        return;
      }
      const stageHookMatch = dragId.match(/^pipeline::stage-hook::(.+?)::(.+)$/);
      if (stageHookMatch) {
        const [, listId, hookId] = stageHookMatch;
        handleRemoveStageHook(listId, hookId);
        return;
      }
      const globalHookMatch = dragId.match(/^pipeline::global-hook::(.+)$/);
      if (globalHookMatch) {
        const [, hookId] = globalHookMatch;
        handleRemoveGlobalHook(hookId);
        return;
      }
      return;
    }

    // ─── Tree → Pipeline (addition) ─────────────────────
    const dragMatch = dragId.match(/^tree::(hooks|skills|agents)::(.+)$/);
    const dropMatch = dropId.match(/^drop::(edge-hooks|stage-hooks|edge-skill)::(.+)$/);
    if (!dragMatch || !dropMatch) return;

    const [, dragType, dragPath] = dragMatch;
    const [, dropZone, dropKey] = dropMatch;

    // Resolve the canonical ID: for hooks, use the workflow config's hook ID
    // (matched via target path). For skills, use folder/filename convention.
    const itemId = dragType === 'hooks'
      ? hookIdByPath.get(dragPath)
      : extractIdFromPath(dragPath);
    if (!itemId) return;

    if (!editor.editMode) editor.enterEditMode();

    if (dropZone === 'edge-hooks' && dragType === 'hooks') {
      const [from, to] = dropKey.split(':');
      const edge = editor.editConfig.edges.find(e => e.from === from && e.to === to);
      if (!edge || edge.hooks?.includes(itemId)) return;
      editor.updateEdge(edge, { ...edge, hooks: [...(edge.hooks ?? []), itemId] });
    }

    if (dropZone === 'stage-hooks' && dragType === 'hooks') {
      const list = editor.editConfig.lists.find(l => l.id === dropKey);
      if (!list || list.activeHooks?.includes(itemId)) return;
      editor.updateList(list, { ...list, activeHooks: [...(list.activeHooks ?? []), itemId] });
    }

    if (dropZone === 'edge-skill' && dragType === 'skills') {
      const [from, to] = dropKey.split(':');
      const edge = editor.editConfig.edges.find(e => e.from === from && e.to === to);
      if (!edge) return;
      editor.updateEdge(edge, { ...edge, command: `/${itemId} {id}` });
    }
  }, [editor, handleRemoveEdgeHook, handleRemoveStageHook, handleRemoveGlobalHook, hookIdByPath]);

  const handleDragCancel = useCallback(() => {
    setActiveDrag(null);
  }, []);

  const [savingWorkflow, setSavingWorkflow] = useState(false);
  const [workflowSaveError, setWorkflowSaveError] = useState<string | null>(null);

  const handleSave = useCallback(async () => {
    if (!editor.validation.valid || savingWorkflow) return;
    setSavingWorkflow(true);
    setWorkflowSaveError(null);
    try {
      const res = await fetch('/api/orbital/workflow', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editor.editConfig),
      });
      const json: { success: boolean; error?: string } = await res.json();
      if (!json.success) throw new Error(json.error ?? 'Save failed');
      // discard() resets history (changeCount → 0) AND exits edit mode cleanly.
      // editor.save() only calls exitEditMode() which leaves changeCount stale.
      editor.discard();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Workflow save failed';
      console.error('Workflow save failed:', err);
      setWorkflowSaveError(message);
    } finally {
      setSavingWorkflow(false);
    }
  }, [editor, savingWorkflow]);

  const { activePaths, hookCategoryMap } = useMemo(() => {
    const activeHookPaths = new Set<string>();
    const activeSkillPaths = new Set<string>();
    const activeAgentPaths = new Set<string>();
    const catMap = new Map<string, HookCategory>();

    // Collect active hooks from pipeline (global + stage + edge hooks)
    const allResolved = [
      ...pipelineData.globalHooks,
      ...pipelineData.stages.flatMap(s => s.stageHooks),
      ...pipelineData.stages.flatMap(s => s.forwardEdges.flatMap(e => e.edgeHooks)),
    ];
    for (const hook of allResolved) {
      if (hook.filePath) {
        activeHookPaths.add(hook.filePath);
        catMap.set(hook.filePath, hook.category);
      }
    }

    // Build category map for ALL defined hooks (including inactive ones)
    const allDefinedHooks = engine.getAllHooks();
    for (const hook of allDefinedHooks) {
      const filePath = pipelineData.hookPathMap.get(hook.id);
      if (filePath && !catMap.has(filePath)) {
        catMap.set(filePath, hook.category);
      }
    }

    // Active skills (edges with commands)
    for (const stage of pipelineData.stages) {
      for (const edge of stage.forwardEdges) {
        if (edge.skillPath) activeSkillPaths.add(edge.skillPath);
      }
    }

    // Transitively activate sub-skills via orchestratesMap
    const { orchestratesMap, skillPathMap } = pipelineData;
    if (orchestratesMap.size > 0) {
      // Reverse lookup: skill path → skill name
      const skillNameByPath = new Map<string, string>();
      for (const [name, path] of skillPathMap) {
        skillNameByPath.set(path, name);
      }
      // BFS from directly-active skills
      const visited = new Set<string>();
      const queue: string[] = [];
      for (const path of activeSkillPaths) {
        const name = skillNameByPath.get(path);
        if (name && orchestratesMap.has(name)) {
          queue.push(name);
          visited.add(name);
        }
      }
      while (queue.length > 0) {
        const current = queue.shift()!;
        for (const sub of orchestratesMap.get(current) ?? []) {
          const subPath = skillPathMap.get(sub);
          if (subPath) activeSkillPaths.add(subPath);
          if (!visited.has(sub) && orchestratesMap.has(sub)) {
            visited.add(sub);
            queue.push(sub);
          }
        }
      }
    }

    // Active agents (always-on + review teams)
    for (const stage of pipelineData.stages) {
      for (const agent of stage.alwaysOnAgents) {
        if (agent.filePath) activeAgentPaths.add(agent.filePath);
      }
      for (const team of stage.reviewTeams) {
        for (const agent of team.agents) {
          if (agent.filePath) activeAgentPaths.add(agent.filePath);
        }
      }
    }

    const pathsByType: Record<ConfigPrimitiveType, Set<string>> = {
      hooks: activeHookPaths,
      skills: activeSkillPaths,
      agents: activeAgentPaths,
    };

    return { activePaths: pathsByType[activeTab], hookCategoryMap: catMap };
  }, [pipelineData, activeTab, engine]);

  // Build agent team map: file path → { team (parent folder), color matched to team name }
  const agentTeamMap = useMemo(() => {
    if (activeTab !== 'agents') return undefined;
    const TEAM_COLORS: Record<string, string> = {
      'red-team': '#ef4444',
      'blue-team': '#3b82f6',
      'green-team': '#22c55e',
    };
    const map = new Map<string, AgentTeamInfo>();
    function walk(nodes: ConfigFileNode[], teamName: string | null) {
      for (const node of nodes) {
        if (node.type === 'folder' && node.children) {
          walk(node.children, node.name);
        } else if (node.type === 'file' && teamName) {
          const color = TEAM_COLORS[teamName.toLowerCase()] ?? '#8B5CF6';
          map.set(node.path, { team: teamName, color });
        }
      }
    }
    walk(tree, null);
    return map;
  }, [activeTab, tree]);

  // Droppable removal zone — the tree panel acts as a trash target
  const { setNodeRef: setRemoveRef, isOver: isOverRemove } = useDroppable({ id: 'drop::remove' });

  // Track whether a pipeline item is being dragged (for showing remove hint)
  const isDraggingPipelineItem = activeDrag?.type === 'pipeline';

  // Count files recursively
  const fileCount = useMemo(() => {
    let count = 0;
    function walk(nodes: ConfigFileNode[]) {
      for (const n of nodes) {
        if (n.type === 'file') count++;
        if (n.children) walk(n.children);
      }
    }
    walk(tree);
    return count;
  }, [tree]);

  return (
    <DndContext
      sensors={sensors}
      modifiers={modifiers}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="flex flex-1 min-h-0 flex-col">
        {/* Header */}
        <div className="mb-4 flex items-center gap-3">
          <Puzzle className="h-4 w-4 text-primary" />
          <h1 className="text-xl font-light">Primitives</h1>
          <Badge variant="secondary" className="ml-2">
            {fileCount} {activeTab}
          </Badge>
        </div>

        {/* Save bar */}
        {editor.editMode && editor.changeCount > 0 && (
          <div className="mb-2 flex items-center gap-2 rounded border border-border bg-card px-3 py-2">
            <Badge variant="outline">{editor.changeCount} unsaved</Badge>
            {editor.canUndo && (
              <Button variant="ghost" size="sm" onClick={editor.undo}>Undo</Button>
            )}
            {editor.canRedo && (
              <Button variant="ghost" size="sm" onClick={editor.redo}>Redo</Button>
            )}
            <div className="flex-1" />
            <Button variant="ghost" size="sm" onClick={editor.discard}>Discard</Button>
            <Button size="sm" onClick={handleSave} disabled={savingWorkflow || !editor.validation.valid}>
              {savingWorkflow ? 'Saving...' : 'Save'}
            </Button>
            {workflowSaveError && (
              <span className="text-xs text-destructive ml-2">{workflowSaveError}</span>
            )}
          </div>
        )}

        {/* Three-panel layout: Tree | Pipeline | Editor */}
        <div className="flex min-h-0 flex-1 gap-2">
          {/* Panel 1: Directory Tree (~20%) — also a removal drop zone */}
          <div
            ref={setRemoveRef}
            className={cn(
              'flex w-[20%] min-w-[180px] flex-col rounded border bg-card card-glass neon-border-blue transition-colors',
              isOverRemove
                ? 'border-ask-red/60 bg-ask-red/5'
                : 'border-border',
            )}
          >
            {isDraggingPipelineItem && isOverRemove && (
              <div className="flex items-center justify-center gap-1.5 border-b border-ask-red/30 bg-ask-red/10 px-2 py-1.5 text-[10px] text-ask-red">
                <Trash2 className="h-3 w-3" /> Drop to remove
              </div>
            )}
            <DirectoryTree
              tree={tree}
              loading={treeLoading}
              selectedPath={editorPath}
              type={activeTab}
              onSelect={handleFileSelect}
              onRefresh={refresh}
              onTabChange={handleTabChange}
              activePaths={activePaths}
              hookCategoryMap={activeTab === 'hooks' ? hookCategoryMap : undefined}
              agentTeamMap={agentTeamMap}
            />
          </div>

          {/* Panel 2: Unified Workflow Pipeline (~35%) */}
          <div className="flex w-[35%] min-w-[220px] flex-col rounded border border-border bg-card card-glass neon-border-blue">
            <UnifiedWorkflowPipeline
              selectedPath={editorPath}
              onSelectItem={handlePipelineSelect}
              editConfig={pipelineEditConfig}
              editable
              onRemoveEdgeHook={handleRemoveEdgeHook}
              onRemoveStageHook={handleRemoveStageHook}
              onRemoveGlobalHook={handleRemoveGlobalHook}
            />
          </div>

          {/* Panel 3: File Editor (~45%) */}
          <div className="flex w-[45%] min-w-[280px] flex-col rounded border border-border bg-card card-glass neon-border-blue">
            <FileEditor
              type={editorType}
              filePath={editorPath}
              content={content}
              setContent={setContent}
              frontmatter={frontmatter}
              setFrontmatterField={setFrontmatterField}
              body={body}
              setBody={setBody}
              dirty={dirty}
              saving={fileSaving}
              loading={fileLoading}
              error={fileError}
              onSave={fileSave}
            />
          </div>
        </div>
      </div>

      {/* Drag overlay — floating chip preview */}
      <DragOverlay>
        {activeDrag && (
          <div className="inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-medium bg-card shadow-lg border-accent-blue/50 text-foreground">
            {activeDrag.type === 'hooks' && <Zap className="h-3 w-3 text-amber-400" />}
            {activeDrag.type === 'skills' && <Terminal className="h-3 w-3 text-green-400" />}
            {activeDrag.type === 'agents' && <Puzzle className="h-3 w-3 text-purple-400" />}
            {activeDrag.name}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
