import { createPortal } from 'react-dom';
import { File, Folder, Pencil, Trash2 } from 'lucide-react';
import type { ConfigFileNode } from '@/types';

export interface ContextMenuState {
  node: ConfigFileNode;
  x: number;
  y: number;
}

interface TreeContextMenuProps {
  menu: ContextMenuState;
  onRename: (node: ConfigFileNode) => void;
  onDelete: (node: ConfigFileNode) => void;
  onNewFile: (parentPath: string) => void;
  onNewFolder: (parentPath: string) => void;
  onClose: () => void;
}

export function TreeContextMenu({ menu, onRename, onDelete, onNewFile, onNewFolder, onClose }: TreeContextMenuProps) {
  return createPortal(
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        className="fixed z-50 min-w-[140px] rounded border border-border bg-surface shadow-lg"
        style={{ top: menu.y, left: menu.x }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={() => onRename(menu.node)}
          className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-foreground hover:bg-surface-light transition-colors"
        >
          <Pencil className="h-3 w-3" />
          Rename
        </button>
        {menu.node.type === 'folder' && (
          <>
            <button
              onClick={() => onNewFile(menu.node.path)}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-foreground hover:bg-surface-light transition-colors"
            >
              <File className="h-3 w-3" />
              New File
            </button>
            <button
              onClick={() => onNewFolder(menu.node.path)}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-foreground hover:bg-surface-light transition-colors"
            >
              <Folder className="h-3 w-3" />
              New Folder
            </button>
          </>
        )}
        <div className="border-t border-border" />
        {menu.node.type === 'file' && (
          <button
            onClick={() => onDelete(menu.node)}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-ask-red hover:bg-surface-light transition-colors"
          >
            <Trash2 className="h-3 w-3" />
            Delete
          </button>
        )}
      </div>
    </>,
    document.body,
  );
}
