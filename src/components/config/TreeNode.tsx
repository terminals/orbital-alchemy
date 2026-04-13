import { useDraggable } from '@dnd-kit/core';
import { ChevronRight, ChevronDown, File, Folder, FolderOpen, Plus, Trash2, Pencil, Bot } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CATEGORY_STYLE } from './HookChip';
import { CATEGORY_HEX } from '@/lib/workflow-constants';
import type { ConfigFileNode, ConfigPrimitiveType } from '@/types';
import type { HookCategory } from '../../../shared/workflow-config';
import type { AgentTeamInfo } from './DirectoryTree';

export type ContextAction = 'rename' | 'delete' | 'new-file' | 'new-folder';

export interface TreeNodeProps {
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

export function TreeNode({ node, depth, selectedPath, expandedPaths, primitiveType, onSelect, onToggle, onContextAction, hookCategoryMap, agentTeamMap, dimmed }: TreeNodeProps) {
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
  const selectionColor = isSelected && !isFolder
    ? (category ? CATEGORY_HEX[category] : agentTeam ? agentTeam.color : primitiveType === 'skills' ? '#22c55e' : '#00bcd4')
    : undefined;

  const isNested = depth > 0;
  const rowStyle: React.CSSProperties = selectionColor
    ? {
        '--glow-color': `${selectionColor}50`,
        backgroundColor: `${selectionColor}18`,
        color: selectionColor,
      } as React.CSSProperties
    : {};
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
        style={rowStyle}
        {...(!isFolder ? { ...listeners, ...attributes } : {})}
      >
        {isNested && (
          <span
            aria-hidden
            className="self-stretch shrink-0 border-l border-emerald-500/25"
            style={{ marginLeft: `${(depth - 1) * 14 + 14}px`, width: 0 }}
          />
        )}
        <button
          onClick={handleClick}
          className="flex flex-1 min-w-0 items-center gap-1.5 px-2 py-1"
          style={{ paddingLeft: isNested ? '10px' : `${depth * 12 + 8}px` }}
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
          <span className="min-w-0 truncate" title={displayName}>{displayName}</span>
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
