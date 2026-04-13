import { Loader2, RotateCcw, ShieldCheck, Archive } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogClose,
} from '@/components/ui/dialog';

interface UpdateAllSummary {
  totalOutdated: number;
  totalMissing: number;
  totalModified: number;
  totalPinned: number;
  projectsOutdated: number;
  projects: Array<{ manifest?: { files: { outdated: number; missing: number } } | null }>;
}

interface UpdateAllDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  summary: UpdateAllSummary;
  actionLoading: string | null;
  onUpdateAll: () => void;
}

export function UpdateAllDialog({
  open,
  onOpenChange,
  summary,
  actionLoading,
  onUpdateAll,
}: UpdateAllDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0 max-h-[80vh] overflow-hidden grid grid-rows-[auto_auto_1fr_auto_auto]">
        <DialogHeader className="px-5 pt-4 pb-3 pr-10">
          <DialogTitle className="text-sm">Update All Projects</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground/60">
            Review what will happen across all projects
          </DialogDescription>
        </DialogHeader>

        <Separator />

        <div className="px-5 py-4 space-y-3 overflow-auto min-h-0">
          {/* What will be updated */}
          <div className="flex items-start gap-3">
            <RotateCcw className="h-4 w-4 text-cyan-400 mt-0.5 shrink-0" />
            <div>
              <div className="text-sm text-foreground">
                {summary.totalOutdated + summary.totalMissing} file{summary.totalOutdated + summary.totalMissing !== 1 ? 's' : ''} to sync across {summary.projectsOutdated || summary.projects.filter(p => p.manifest && (p.manifest.files.outdated > 0 || p.manifest.files.missing > 0)).length} project{summary.projects.filter(p => p.manifest && (p.manifest.files.outdated > 0 || p.manifest.files.missing > 0)).length !== 1 ? 's' : ''}
              </div>
              <div className="text-xs text-muted-foreground/60 mt-0.5">
                Synced and outdated files will be replaced with the latest template version
              </div>
            </div>
          </div>

          {/* What will be skipped */}
          {(summary.totalModified > 0 || summary.totalPinned > 0) && (
            <div className="flex items-start gap-3">
              <ShieldCheck className="h-4 w-4 text-green-400/60 mt-0.5 shrink-0" />
              <div>
                <div className="text-sm text-foreground/70">
                  {summary.totalModified + summary.totalPinned} file{summary.totalModified + summary.totalPinned !== 1 ? 's' : ''} will not be touched
                </div>
                <div className="text-xs text-muted-foreground/60 mt-0.5">
                  {summary.totalModified > 0 && <>{summary.totalModified} modified</>}
                  {summary.totalModified > 0 && summary.totalPinned > 0 && ' and '}
                  {summary.totalPinned > 0 && <>{summary.totalPinned} pinned</>}
                  {' '}file{summary.totalModified + summary.totalPinned !== 1 ? 's' : ''} are never overwritten
                </div>
              </div>
            </div>
          )}

          {/* Backup notice */}
          <div className="flex items-start gap-3">
            <Archive className="h-4 w-4 text-muted-foreground/40 mt-0.5 shrink-0" />
            <div className="text-xs text-muted-foreground/50">
              Previous versions will be backed up and can be reverted
            </div>
          </div>
        </div>

        <Separator />

        <div className="px-5 py-3 flex justify-end gap-2">
          <DialogClose asChild>
            <Button variant="ghost" size="sm">Cancel</Button>
          </DialogClose>
          <Button
            size="sm"
            onClick={() => { onOpenChange(false); onUpdateAll(); }}
            disabled={actionLoading === 'update-all'}
            className="bg-cyan-600 hover:bg-cyan-700 text-white"
          >
            {actionLoading === 'update-all' && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
            Update All Projects
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
