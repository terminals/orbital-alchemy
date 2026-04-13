import { Loader2, RotateCcw, ArrowRight, Minus, SkipForward, Archive } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose,
} from '@/components/ui/dialog';

interface UpdatePreview {
  isEmpty: boolean;
  toUpdate: string[];
  toAdd: string[];
  toRename: Array<{ from: string; to: string }>;
  toRemove: string[];
  toSkip: Array<{ file: string; reason: string }>;
}

interface UpdatePreviewDialogProps {
  updatePreview: UpdatePreview | null;
  projectName: string | undefined;
  updatePreviewProjectId: string | null;
  actionLoading: string | null;
  onApply: (projectId: string) => void;
  onClose: () => void;
}

export function UpdatePreviewDialog({
  updatePreview,
  projectName,
  updatePreviewProjectId,
  actionLoading,
  onApply,
  onClose,
}: UpdatePreviewDialogProps) {
  return (
    <Dialog open={updatePreview !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-md p-0 max-h-[80vh] overflow-hidden grid grid-rows-[auto_auto_1fr_auto_auto]">
        <DialogHeader className="px-5 pt-4 pb-3 pr-10">
          <DialogTitle className="text-sm">
            Update {projectName}
          </DialogTitle>
          <span className="text-xs text-muted-foreground/60">
            Review what will happen before applying
          </span>
        </DialogHeader>

        <Separator />

        {updatePreview && !updatePreview.isEmpty && (
          <div className="px-5 py-4 space-y-3 overflow-auto min-h-0">
            {/* What will be updated */}
            {(updatePreview.toUpdate.length > 0 || updatePreview.toAdd.length > 0) && (
              <div className="flex items-start gap-3">
                <RotateCcw className="h-4 w-4 text-cyan-400 mt-0.5 shrink-0" />
                <div>
                  <div className="text-sm text-foreground">
                    {updatePreview.toUpdate.length + updatePreview.toAdd.length} file{updatePreview.toUpdate.length + updatePreview.toAdd.length !== 1 ? 's' : ''} will be updated
                  </div>
                  <div className="text-xs text-muted-foreground/60 mt-0.5">
                    Synced and outdated files replaced with the latest template version
                  </div>
                  <div className="mt-1.5 space-y-0.5">
                    {updatePreview.toUpdate.map(f => (
                      <div key={f} className="text-xs font-mono text-cyan-400/70">{f}</div>
                    ))}
                    {updatePreview.toAdd.map(f => (
                      <div key={f} className="text-xs font-mono text-green-400/70">{f} <span className="text-muted-foreground/40">(new)</span></div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* What will be renamed */}
            {updatePreview.toRename.length > 0 && (
              <div className="flex items-start gap-3">
                <ArrowRight className="h-4 w-4 text-purple-400 mt-0.5 shrink-0" />
                <div>
                  <div className="text-sm text-foreground">
                    {updatePreview.toRename.length} file{updatePreview.toRename.length !== 1 ? 's' : ''} will be renamed
                  </div>
                  <div className="mt-1.5 space-y-0.5">
                    {updatePreview.toRename.map(r => (
                      <div key={r.from} className="text-xs font-mono text-purple-400/70">{r.from} → {r.to}</div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* What will be removed */}
            {updatePreview.toRemove.length > 0 && (
              <div className="flex items-start gap-3">
                <Minus className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
                <div>
                  <div className="text-sm text-foreground">
                    {updatePreview.toRemove.length} file{updatePreview.toRemove.length !== 1 ? 's' : ''} will be removed
                  </div>
                  <div className="text-xs text-muted-foreground/60 mt-0.5">
                    No longer part of the template
                  </div>
                  <div className="mt-1.5 space-y-0.5">
                    {updatePreview.toRemove.map(f => (
                      <div key={f} className="text-xs font-mono text-red-400/70">{f}</div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* What will be skipped */}
            {updatePreview.toSkip.length > 0 && (
              <div className="flex items-start gap-3">
                <SkipForward className="h-4 w-4 text-muted-foreground/50 mt-0.5 shrink-0" />
                <div>
                  <div className="text-sm text-foreground/70">
                    {updatePreview.toSkip.length} file{updatePreview.toSkip.length !== 1 ? 's' : ''} will be skipped
                  </div>
                  <div className="text-xs text-muted-foreground/60 mt-0.5">
                    Modified or pinned files are never overwritten
                  </div>
                  <div className="mt-1.5 space-y-0.5">
                    {updatePreview.toSkip.map(s => (
                      <div key={s.file} className="text-xs font-mono text-muted-foreground/40">{s.file} <span className="text-muted-foreground/30">({s.reason})</span></div>
                    ))}
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
        )}

        {updatePreview && updatePreview.isEmpty && (
          <div className="px-5 py-8 text-center text-sm text-muted-foreground">
            Everything is up to date. No changes needed.
          </div>
        )}

        <Separator />

        <div className="px-5 py-3 flex justify-end gap-2">
          <DialogClose asChild>
            <Button variant="ghost" size="sm">Cancel</Button>
          </DialogClose>
          {updatePreview && !updatePreview.isEmpty && updatePreviewProjectId && (
            <Button
              size="sm"
              onClick={() => onApply(updatePreviewProjectId)}
              disabled={actionLoading === `update:${updatePreviewProjectId}`}
              className="bg-cyan-600 hover:bg-cyan-700 text-white"
            >
              {actionLoading === `update:${updatePreviewProjectId}` && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              Update Project
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
