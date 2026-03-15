import { AlertTriangle, Plus, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatScopeId } from '@/lib/utils';

interface UnmetDep {
  scope_id: number;
  missing: Array<{ scope_id: number; title: string; status: string }>;
}

interface SprintDependencyDialogProps {
  open: boolean;
  unmetDeps: UnmetDep[];
  onAddAll: (scopeIds: number[]) => void;
  onCancel: () => void;
}

export function SprintDependencyDialog({ open, unmetDeps, onAddAll, onCancel }: SprintDependencyDialogProps) {
  // Collect all unique missing scope IDs
  const allMissing = new Map<number, { title: string; status: string }>();
  for (const dep of unmetDeps) {
    for (const m of dep.missing) {
      if (!allMissing.has(m.scope_id)) {
        allMissing.set(m.scope_id, { title: m.title, status: m.status });
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <AlertTriangle className="h-4 w-4 text-warning-amber" />
            Unmet Dependencies
          </DialogTitle>
          <DialogDescription className="text-xs">
            Some scopes you added depend on scopes not yet in this sprint.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 my-2">
          {unmetDeps.map((dep) => (
            <div key={dep.scope_id} className="text-xs">
              <span className="font-mono text-muted-foreground">{formatScopeId(dep.scope_id)}</span>
              <span className="ml-1">depends on:</span>
              <div className="ml-4 mt-1 space-y-1">
                {dep.missing.map((m) => (
                  <div key={m.scope_id} className="flex items-center gap-2">
                    <span className="font-mono text-muted-foreground">{formatScopeId(m.scope_id)}</span>
                    <span className="truncate">{m.title}</span>
                    <Badge variant="outline" className="text-[10px] ml-auto shrink-0">{m.status}</Badge>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t">
          <Button variant="ghost" size="sm" onClick={onCancel}>
            <X className="h-3 w-3 mr-1" /> Cancel
          </Button>
          <Button size="sm" onClick={() => onAddAll([...allMissing.keys()])}>
            <Plus className="h-3 w-3 mr-1" /> Add All Dependencies
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
