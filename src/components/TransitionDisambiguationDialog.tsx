import type { WorkflowEdge } from '../../shared/workflow-config';

interface TransitionDisambiguationDialogProps {
  open: boolean;
  edges: WorkflowEdge[];
  onSelect: (edge: WorkflowEdge) => void;
  onCancel: () => void;
}

export function TransitionDisambiguationDialog({
  open,
  edges,
  onSelect,
  onCancel,
}: TransitionDisambiguationDialogProps) {
  if (!open || edges.length === 0) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-80 rounded-lg border border-border bg-card p-4 shadow-xl space-y-3">
        <h3 className="text-sm font-medium">Choose Transition</h3>
        <p className="text-xs text-muted-foreground">
          Multiple transitions are available for this move. Select one:
        </p>

        <div className="space-y-1.5">
          {edges.map((edge) => (
            <button
              key={`${edge.from}-${edge.to}`}
              onClick={() => onSelect(edge)}
              className="flex w-full items-center gap-2 rounded border border-border px-3 py-2 text-left text-xs hover:bg-muted/50 transition-colors"
            >
              <span className="font-medium">{edge.label ?? `${edge.from} → ${edge.to}`}</span>
              {edge.description && (
                <span className="text-muted-foreground/70 truncate">{edge.description}</span>
              )}
            </button>
          ))}
        </div>

        <div className="flex justify-end pt-1">
          <button
            onClick={onCancel}
            className="rounded px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
