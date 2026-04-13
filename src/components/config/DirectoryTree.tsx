import { useState, useCallback, useEffect, useMemo } from 'react';
import { Plus, Bot, Terminal, Zap } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useProjectUrl } from '@/hooks/useProjectUrl';
import { TreeNode, type ContextAction } from './TreeNode';
import { TreeContextMenu, type ContextMenuState } from './TreeContextMenu';
import type { ConfigFileNode, ConfigPrimitiveType, ActiveSkillEntry } from '@/types';
import type { HookCategory } from '../../../shared/workflow-config';

export interface AgentTeamInfo {
  team: string;
  color: string;
}

interface DirectoryTreeProps {
  tree: ConfigFileNode[];
  loading: boolean;
  selectedPath: string | null;
  type: ConfigPrimitiveType;
  onSelect: (node: ConfigFileNode) => void;
  onRefresh: () => void;
  onTabChange: (value: ConfigPrimitiveType) => void;
  activePaths?: Set<string>;
  activeSkills?: ActiveSkillEntry[];
  hookCategoryMap?: Map<string, HookCategory>;
  agentTeamMap?: Map<string, AgentTeamInfo>;
}

const TAB_OPTIONS: Array<{ value: ConfigPrimitiveType; icon: React.ElementType; label: string }> = [
  { value: 'agents', icon: Bot, label: 'Agents' },
  { value: 'skills', icon: Terminal, label: 'Skills' },
  { value: 'hooks', icon: Zap, label: 'Hooks' },
];

// Flatten a tree by extracting all files from folders into a single-level list
function flattenFiles(nodes: ConfigFileNode[]): ConfigFileNode[] {
  const files: ConfigFileNode[] = [];
  function walk(items: ConfigFileNode[]) {
    for (const node of items) {
      if (node.type === 'file') {
        files.push(node);
      }
      if (node.children) walk(node.children);
    }
  }
  walk(nodes);
  return files.sort((a, b) => {
    const nameA = a.frontmatter?.name ? String(a.frontmatter.name) : a.name;
    const nameB = b.frontmatter?.name ? String(b.frontmatter.name) : b.name;
    return nameA.localeCompare(nameB);
  });
}

export function DirectoryTree({ tree, loading, selectedPath, type, onSelect, onRefresh, onTabChange, activePaths, activeSkills, hookCategoryMap, agentTeamMap }: DirectoryTreeProps) {
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const buildUrl = useProjectUrl();
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [renaming, setRenaming] = useState<ConfigFileNode | null>(null);
  const [renamingValue, setRenamingValue] = useState('');
  const [creating, setCreating] = useState<{ kind: 'file' | 'folder'; parent: string } | null>(null);
  const [createValue, setCreateValue] = useState('');

  // Scroll selected item into view when selection changes
  useEffect(() => {
    if (!selectedPath) return;
    requestAnimationFrame(() => {
      const el = document.querySelector(`[data-tree-path="${CSS.escape(selectedPath)}"]`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  }, [selectedPath]);

  // For skills, flatten the tree to remove parent folder nesting
  const displayTree = type === 'skills' ? flattenFiles(tree) : tree;

  // Split into active/inactive when activePaths is provided.
  // For skills, `activeSkills` carries parent → child ordering and depth;
  // it drives the Active section so sub-skills render nested under the
  // parent that orchestrates them. Agents/hooks fall back to a flat sort.
  const { activeItems, inactiveFiles } = useMemo(() => {
    if (!activePaths) return { activeItems: null, inactiveFiles: null };
    const flat = flattenFiles(tree);

    if (activeSkills) {
      // Skills: respect ordering from activeSkills; inactive = everything not in the active set
      const activePathSet = new Set(activeSkills.map(e => e.path));
      const nodeByPath = new Map(flat.map(n => [n.path, n]));
      const items: Array<{ node: ConfigFileNode; depth: number }> = [];
      for (const entry of activeSkills) {
        const node = nodeByPath.get(entry.path);
        if (node) items.push({ node, depth: entry.depth });
      }
      const inactive = flat.filter(n => !activePathSet.has(n.path));
      return { activeItems: items, inactiveFiles: inactive };
    }

    // Agents/hooks: flat alphabetical split
    const active: Array<{ node: ConfigFileNode; depth: number }> = [];
    const inactive: ConfigFileNode[] = [];
    for (const node of flat) {
      if (activePaths.has(node.path)) {
        active.push({ node, depth: 0 });
      } else {
        inactive.push(node);
      }
    }
    return { activeItems: active, inactiveFiles: inactive };
  }, [tree, activePaths, activeSkills]);

  const toggleExpand = useCallback((path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const handleContextMenu = useCallback((e: React.MouseEvent, node: ConfigFileNode) => {
    e.preventDefault();
    setContextMenu({ node, x: e.clientX, y: e.clientY });
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  // Rename
  const startRename = useCallback((node: ConfigFileNode) => {
    setRenaming(node);
    setRenamingValue(node.name);
    setContextMenu(null);
  }, []);

  const submitRename = useCallback(async () => {
    if (!renaming || !renamingValue.trim() || renamingValue === renaming.name) {
      setRenaming(null);
      return;
    }
    const parentDir = renaming.path.includes('/')
      ? renaming.path.slice(0, renaming.path.lastIndexOf('/'))
      : '';
    const newPath = parentDir ? `${parentDir}/${renamingValue}` : renamingValue;

    try {
      const res = await fetch(buildUrl(`/config/${type}/rename`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldPath: renaming.path, newPath }),
      });
      if (!res.ok) throw new Error('Rename failed');
      onRefresh();
    } catch {
      // silent fail
    }
    setRenaming(null);
  }, [renaming, renamingValue, type, onRefresh, buildUrl]);

  // Delete
  const handleDelete = useCallback(async (node: ConfigFileNode) => {
    setContextMenu(null);
    try {
      const res = await fetch(buildUrl(`/config/${type}/file?path=${encodeURIComponent(node.path)}`), {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Delete failed');
      onRefresh();
    } catch {
      // silent fail
    }
  }, [type, onRefresh, buildUrl]);

  // Create file/folder
  const startCreate = useCallback((kind: 'file' | 'folder', parentPath: string) => {
    setCreating({ kind, parent: parentPath });
    setCreateValue('');
    setContextMenu(null);
  }, []);

  const handleContextAction = useCallback((action: ContextAction, node: ConfigFileNode) => {
    if (action === 'rename') startRename(node);
    else if (action === 'delete') handleDelete(node);
    else if (action === 'new-file') startCreate('file', node.path);
    else if (action === 'new-folder') startCreate('folder', node.path);
  }, [startRename, handleDelete, startCreate]);

  const submitCreate = useCallback(async () => {
    if (!creating || !createValue.trim()) {
      setCreating(null);
      return;
    }
    const fullPath = creating.parent ? `${creating.parent}/${createValue}` : createValue;
    try {
      if (creating.kind === 'folder') {
        const res = await fetch(buildUrl(`/config/${type}/folder`), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: fullPath }),
        });
        if (!res.ok) throw new Error('Create folder failed');
      } else {
        const res = await fetch(buildUrl(`/config/${type}/file`), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: fullPath, content: '' }),
        });
        if (!res.ok) throw new Error('Create file failed');
      }
      onRefresh();
    } catch {
      // silent fail
    }
    setCreating(null);
  }, [creating, createValue, type, onRefresh, buildUrl]);

  const renderFileNode = (node: ConfigFileNode, dimmed?: boolean, depth: number = 0) => (
    <div
      key={node.path}
      onContextMenu={(e) => handleContextMenu(e, node)}
    >
      <TreeNode
        node={node}
        depth={depth}
        selectedPath={selectedPath}
        expandedPaths={expandedPaths}
        primitiveType={type}
        onSelect={onSelect}
        onToggle={toggleExpand}
        onContextAction={handleContextAction}
        hookCategoryMap={hookCategoryMap}
        agentTeamMap={agentTeamMap}
        dimmed={dimmed}
      />
    </div>
  );

  return (
    <div className="flex h-full flex-col" onClick={closeContextMenu}>
      {/* Header — tab selector + new file */}
      <div className="flex items-center justify-between border-b border-border px-2 py-1.5">
        <Tabs value={type} onValueChange={(v) => onTabChange(v as ConfigPrimitiveType)}>
          <TabsList>
            {TAB_OPTIONS.map(({ value, icon: Icon, label }) => (
              <TabsTrigger key={value} value={value} className="gap-1.5">
                <Icon className="h-3 w-3" />
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <button
          onClick={() => startCreate('file', '')}
          className="rounded p-1 text-muted-foreground hover:bg-surface-light hover:text-foreground transition-colors"
          title="New file"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Tree */}
      <ScrollArea className="flex-1">
        <div className="py-1">
          {loading ? (
            <div className="flex h-20 items-center justify-center">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : tree.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-muted-foreground/60">
              No files found
            </div>
          ) : activeItems && inactiveFiles ? (
            /* Active / Inactive split view */
            <>
              {/* Active section */}
              <div className="flex items-center gap-2 px-3 pt-2 pb-1">
                <div className="h-1.5 w-1.5 rounded-full bg-emerald-500/70" />
                <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400/80">
                  Active
                </span>
                <span className="text-[10px] text-muted-foreground/30">({activeItems.length})</span>
                <div className="flex-1 border-t border-emerald-500/15" />
              </div>
              {activeItems.length === 0 ? (
                <div className="px-3 py-2 text-[10px] text-muted-foreground/40 italic">
                  No active {type}
                </div>
              ) : (
                activeItems.map(({ node, depth }) => renderFileNode(node, false, depth))
              )}

              {/* Inactive section */}
              <div className="flex items-center gap-2 px-3 pt-3 pb-1">
                <div className="h-1.5 w-1.5 rounded-full bg-muted-foreground/30" />
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/40">
                  Inactive
                </span>
                <span className="text-[10px] text-muted-foreground/20">({inactiveFiles.length})</span>
                <div className="flex-1 border-t border-border/20" />
              </div>
              {inactiveFiles.length === 0 ? (
                <div className="px-3 py-2 text-[10px] text-muted-foreground/40 italic">
                  All {type} are active
                </div>
              ) : (
                inactiveFiles.map(node => renderFileNode(node, true))
              )}
            </>
          ) : (
            /* Default tree view (no active/inactive split) */
            displayTree.map((node) => (
              <div
                key={node.path}
                onContextMenu={(e) => handleContextMenu(e, node)}
              >
                <TreeNode
                  node={node}
                  depth={0}
                  selectedPath={selectedPath}
                  expandedPaths={expandedPaths}
                  primitiveType={type}
                  onSelect={onSelect}
                  onToggle={toggleExpand}
                  onContextAction={handleContextAction}
                  hookCategoryMap={hookCategoryMap}
                  agentTeamMap={agentTeamMap}
                />
              </div>
            ))
          )}

          {/* Inline rename input */}
          {renaming && (
            <div className="px-3 py-1">
              <input
                autoFocus
                value={renamingValue}
                onChange={(e) => setRenamingValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submitRename();
                  if (e.key === 'Escape') setRenaming(null);
                }}
                onBlur={submitRename}
                className="w-full rounded border border-accent-blue/40 bg-surface px-2 py-0.5 text-xs text-foreground outline-none"
                placeholder="New name"
              />
            </div>
          )}

          {/* Inline create input */}
          {creating && (
            <div className="px-3 py-1">
              <input
                autoFocus
                value={createValue}
                onChange={(e) => setCreateValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submitCreate();
                  if (e.key === 'Escape') setCreating(null);
                }}
                onBlur={submitCreate}
                className="w-full rounded border border-accent-blue/40 bg-surface px-2 py-0.5 text-xs text-foreground outline-none"
                placeholder={creating.kind === 'folder' ? 'Folder name' : 'File name'}
              />
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Context menu — portal to body to avoid transform-offset issues */}
      {contextMenu && (
        <TreeContextMenu
          menu={contextMenu}
          onRename={startRename}
          onDelete={handleDelete}
          onNewFile={(parentPath) => startCreate('file', parentPath)}
          onNewFolder={(parentPath) => startCreate('folder', parentPath)}
          onClose={closeContextMenu}
        />
      )}
    </div>
  );
}
