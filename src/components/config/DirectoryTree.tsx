import { useState, useCallback, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useDraggable } from '@dnd-kit/core';
import { ChevronRight, ChevronDown, File, Folder, FolderOpen, Plus, Trash2, Pencil, Bot, Terminal, Zap } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { useProjectUrl } from '@/hooks/useProjectUrl';
import { CATEGORY_STYLE } from './HookChip';
import type { ConfigFileNode, ConfigPrimitiveType } from '@/types';
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
  hookCategoryMap?: Map<string, HookCategory>;
  agentTeamMap?: Map<string, AgentTeamInfo>;
}

interface TreeNodeProps {
  node: ConfigFileNode;
  depth: number;
  selectedPath: string | null;
  expandedPaths: Set<string>;
  primitiveType: ConfigPrimitiveType;
  onSelect: (node: ConfigFileNode) => void;
  onToggle: (path: string) => void;
  onContextAction: (action: ContextAction, node: ConfigFileNode) => void;
  hookCategoryMap?: Map<string, HookCategory>;
  agentTeamMap?: Map<string, AgentTeamInfo>;
  dimmed?: boolean;
}

type ContextAction = 'rename' | 'delete' | 'new-file' | 'new-folder';

interface ContextMenuState {
  node: ConfigFileNode;
  x: number;
  y: number;
}

function TreeNode({ node, depth, selectedPath, expandedPaths, primitiveType, onSelect, onToggle, onContextAction, hookCategoryMap, agentTeamMap, dimmed }: TreeNodeProps) {
  const isFolder = node.type === 'folder';
  const isExpanded = expandedPaths.has(node.path);
  const isSelected = node.path === selectedPath;
  const displayName = node.frontmatter?.name
    ? String(node.frontmatter.name)
    : node.name;

  const dragId = !isFolder ? `tree::${primitiveType}::${node.path}` : '';
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: dragId,
    disabled: isFolder,
    data: { type: primitiveType, path: node.path, name: displayName },
  });

  const handleClick = () => {
    if (isFolder) {
      onToggle(node.path);
    } else {
      onSelect(node);
    }
  };

  const category = !isFolder ? hookCategoryMap?.get(node.path) : undefined;
  const catStyle = category ? CATEGORY_STYLE[category] : undefined;
  const CatIcon = catStyle?.icon;

  const agentTeam = !isFolder ? agentTeamMap?.get(node.path) : undefined;

  // Compute content-matched selection color
  const CATEGORY_HEX: Record<string, string> = {
    guard: '#ef4444', gate: '#f59e0b', lifecycle: '#06b6d4', observer: '#71717a',
  };
  const selectionColor = isSelected && !isFolder
    ? (category ? CATEGORY_HEX[category] : agentTeam ? agentTeam.color : primitiveType === 'skills' ? '#22c55e' : '#00bcd4')
    : undefined;

  return (
    <>
      <div
        ref={!isFolder ? setNodeRef : undefined}
        data-tree-path={!isFolder ? node.path : undefined}
        className={cn(
          'group flex w-full items-center rounded text-left text-xs transition-colors',
          isSelected && selectionColor
            ? 'glow-selected'
            : isSelected
              ? 'bg-[#00bcd4]/15 text-[#00bcd4]'
              : 'text-muted-foreground hover:bg-surface-light hover:text-foreground',
          isDragging && 'opacity-40',
          dimmed && !isSelected && 'opacity-50',
        )}
        style={selectionColor ? {
          '--glow-color': `${selectionColor}50`,
          backgroundColor: `${selectionColor}18`,
          color: selectionColor,
        } as React.CSSProperties : undefined}
        {...(!isFolder ? { ...listeners, ...attributes } : {})}
      >
        <button
          onClick={handleClick}
          className="flex flex-1 min-w-0 items-center gap-1.5 px-2 py-1"
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
        >
          {isFolder ? (
            <>
              {isExpanded ? (
                <ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
              ) : (
                <ChevronRight className="h-3 w-3 shrink-0 opacity-60" />
              )}
              {isExpanded ? (
                <FolderOpen className="h-3.5 w-3.5 shrink-0 text-warning-amber/70" />
              ) : (
                <Folder className="h-3.5 w-3.5 shrink-0 text-warning-amber/70" />
              )}
            </>
          ) : (
            <>
              <span className="w-3" />
              <File className="h-3.5 w-3.5 shrink-0 opacity-50" />
            </>
          )}
          <span className="min-w-0 truncate">{displayName}</span>
          {catStyle && CatIcon && (
            <span
              className={cn(
                'inline-flex shrink-0 items-center gap-0.5 rounded border px-1 py-0 text-[9px] font-medium',
                catStyle.bg, catStyle.border, catStyle.text,
              )}
            >
              <CatIcon className="h-2.5 w-2.5" />
              {category}
            </span>
          )}
          {agentTeam && (
            <span
              className="inline-flex shrink-0 items-center gap-0.5 rounded border px-1 py-0 text-[9px] font-medium"
              style={{
                color: agentTeam.color,
                borderColor: `${agentTeam.color}4D`,
                backgroundColor: `${agentTeam.color}1A`,
              }}
            >
              <Bot className="h-2.5 w-2.5" />
              {agentTeam.team}
            </span>
          )}
        </button>

        {/* Hover-visible action icons */}
        <div className="mr-1 flex shrink-0 items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => { e.stopPropagation(); onContextAction('rename', node); }}
            className="rounded p-0.5 hover:bg-surface-light"
            title="Rename"
          >
            <Pencil className="h-3 w-3" />
          </button>
          {node.type === 'file' && (
            <button
              onClick={(e) => { e.stopPropagation(); onContextAction('delete', node); }}
              className="rounded p-0.5 hover:bg-ask-red/20 text-muted-foreground hover:text-ask-red"
              title="Delete"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          )}
          {node.type === 'folder' && (
            <button
              onClick={(e) => { e.stopPropagation(); onContextAction('new-file', node); }}
              className="rounded p-0.5 hover:bg-surface-light"
              title="New file"
            >
              <Plus className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {isFolder && isExpanded && node.children?.map((child) => (
        <TreeNode
          key={child.path}
          node={child}
          depth={depth + 1}
          selectedPath={selectedPath}
          expandedPaths={expandedPaths}
          primitiveType={primitiveType}
          onSelect={onSelect}
          onToggle={onToggle}
          onContextAction={onContextAction}
          hookCategoryMap={hookCategoryMap}
          agentTeamMap={agentTeamMap}
          dimmed={dimmed}
        />
      ))}
    </>
  );
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

export function DirectoryTree({ tree, loading, selectedPath, type, onSelect, onRefresh, onTabChange, activePaths, hookCategoryMap, agentTeamMap }: DirectoryTreeProps) {
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

  // Split into active/inactive when activePaths is provided
  const { activeFiles, inactiveFiles } = useMemo(() => {
    if (!activePaths) return { activeFiles: null, inactiveFiles: null };
    const flat = flattenFiles(tree);
    const active: ConfigFileNode[] = [];
    const inactive: ConfigFileNode[] = [];
    for (const node of flat) {
      if (activePaths.has(node.path)) {
        active.push(node);
      } else {
        inactive.push(node);
      }
    }
    return { activeFiles: active, inactiveFiles: inactive };
  }, [tree, activePaths]);

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

  const renderFileNode = (node: ConfigFileNode, dimmed?: boolean) => (
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
          ) : activeFiles && inactiveFiles ? (
            /* Active / Inactive split view */
            <>
              {/* Active section */}
              <div className="flex items-center gap-2 px-3 pt-2 pb-1">
                <div className="h-1.5 w-1.5 rounded-full bg-emerald-500/70" />
                <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400/80">
                  Active
                </span>
                <span className="text-[10px] text-muted-foreground/30">({activeFiles.length})</span>
                <div className="flex-1 border-t border-emerald-500/15" />
              </div>
              {activeFiles.length === 0 ? (
                <div className="px-3 py-2 text-[10px] text-muted-foreground/40 italic">
                  No active {type}
                </div>
              ) : (
                activeFiles.map(node => renderFileNode(node))
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
      {contextMenu && createPortal(
        <>
        <div className="fixed inset-0 z-40" onClick={closeContextMenu} />
        <div
          className="fixed z-50 min-w-[140px] rounded border border-border bg-surface shadow-lg"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => startRename(contextMenu.node)}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-foreground hover:bg-surface-light transition-colors"
          >
            <Pencil className="h-3 w-3" />
            Rename
          </button>
          {contextMenu.node.type === 'folder' && (
            <>
              <button
                onClick={() => startCreate('file', contextMenu.node.path)}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-foreground hover:bg-surface-light transition-colors"
              >
                <File className="h-3 w-3" />
                New File
              </button>
              <button
                onClick={() => startCreate('folder', contextMenu.node.path)}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-foreground hover:bg-surface-light transition-colors"
              >
                <Folder className="h-3 w-3" />
                New Folder
              </button>
            </>
          )}
          <div className="border-t border-border" />
          {contextMenu.node.type === 'file' && (
            <button
              onClick={() => handleDelete(contextMenu.node)}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-ask-red hover:bg-surface-light transition-colors"
            >
              <Trash2 className="h-3 w-3" />
              Delete
            </button>
          )}
        </div>
        </>,
        document.body,
      )}
    </div>
  );
}
