import { useState, useCallback } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useWorkflow } from '@/hooks/useWorkflow';
import type { Sprint } from '@/types';

interface ColumnHeaderActionsProps {
  columnId: string;
  dispatching?: boolean;
  onOpenIdeaForm?: () => void;
  onCreateGroup?: (name: string, options: { target_column: string; group_type: 'sprint' | 'batch' }) => Promise<Sprint | null>;
}

export function ColumnHeaderActions({ columnId, dispatching, onOpenIdeaForm, onCreateGroup }: ColumnHeaderActionsProps) {
  const { engine } = useWorkflow();
  const [creatingName, setCreatingName] = useState<string | null>(null);

  const entryPointId = engine.getEntryPoint().id;
  const list = engine.getList(columnId);
  const isBatchColumn = list?.supportsBatch ?? false;
  const isSprintColumn = list?.supportsSprint ?? false;
  const isEntryPoint = columnId === entryPointId;

  const handleCreate = useCallback(async () => {
    if (!creatingName?.trim() || !onCreateGroup) return;
    if (isSprintColumn) {
      await onCreateGroup(creatingName.trim(), { target_column: columnId, group_type: 'sprint' });
    } else if (isBatchColumn) {
      await onCreateGroup(creatingName.trim(), { target_column: columnId, group_type: 'batch' });
    }
    setCreatingName(null);
  }, [creatingName, onCreateGroup, isSprintColumn, isBatchColumn, columnId]);

  if (isEntryPoint && onOpenIdeaForm) {
    return (
      <Button
        variant="ghost"
        size="icon"
        className="ml-1 h-5 w-5"
        onClick={onOpenIdeaForm}
        disabled={dispatching}
        title="Add idea"
      >
        <Plus className="h-3 w-3" />
      </Button>
    );
  }

  if ((isSprintColumn || isBatchColumn) && onCreateGroup) {
    if (creatingName != null) {
      return (
        <div className="flex items-center gap-1 ml-1">
          <input
            autoFocus
            className="h-5 w-24 rounded bg-muted/50 px-1.5 text-[10px] text-foreground border border-cyan-500/30 focus:outline-none focus:ring-1 focus:ring-cyan-500/50"
            placeholder={isBatchColumn ? 'Batch name...' : 'Sprint name...'}
            value={creatingName}
            onChange={(e) => setCreatingName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreate();
              if (e.key === 'Escape') setCreatingName(null);
            }}
            onBlur={() => {
              if (!creatingName?.trim()) setCreatingName(null);
            }}
          />
        </div>
      );
    }

    return (
      <Button
        variant="ghost"
        size="icon"
        className="ml-1 h-5 w-5"
        onClick={() => setCreatingName('')}
        title={isBatchColumn ? 'Create batch' : 'Create sprint'}
      >
        <Plus className="h-3 w-3" />
      </Button>
    );
  }

  return null;
}
