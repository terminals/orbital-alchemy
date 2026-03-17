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

  const entryPointId = engine.getEntryPoint().id;
  const list = engine.getList(columnId);
  const isBatchColumn = list?.supportsBatch ?? false;
  const isSprintColumn = list?.supportsSprint ?? false;
  const isEntryPoint = columnId === entryPointId;

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
    const groupType = isBatchColumn ? 'batch' : 'sprint';
    const label = isBatchColumn ? 'Batch' : 'Sprint';

    return (
      <Button
        variant="ghost"
        size="icon"
        className="ml-1 h-5 w-5"
        onClick={() => onCreateGroup(`New ${label}`, { target_column: columnId, group_type: groupType })}
        title={`Create ${label.toLowerCase()}`}
      >
        <Plus className="h-3 w-3" />
      </Button>
    );
  }

  return null;
}
