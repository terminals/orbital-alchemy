import { useCallback, useRef, useState } from 'react';
import {
  Package, Loader2, CheckCircle2, AlertTriangle,
  RotateCcw, Minus, ArrowRight, Download, RefreshCw,
  ShieldCheck, SkipForward, Archive,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { useAggregateManifest } from '@/hooks/useAggregateManifest';
import { useVersion } from '@/hooks/useVersion';
import { ConfigProjectRow } from './ConfigProjectRow';

export function ConfigHealthDashboard() {
  const {
    summary, loading, actionLoading,
    expandedProjectId, projectFiles,
    updatePreview, updatePreviewProjectId,
    diffContent, diffFile, diffFileStatus, diffProjectId,
    expandProject,
    updateAll,
    previewProjectUpdate, applyProjectUpdate, clearUpdatePreview,
    initProject,
    pinFile, unpinFile, resetFile, revertFile,
    getDiff, clearDiff,
  } = useAggregateManifest();

  const {
    version, updateAvailable, behindCount,
    updateStage, updateError,
    checkForUpdate, performUpdate,
  } = useVersion();

  // Track updateStage via ref so the async callback reads the latest value
  const updateStageRef = useRef(updateStage);
  updateStageRef.current = updateStage;

  // Update package, then propagate templates to all projects
  const updatePackageAndPropagate = useCallback(async () => {
    await performUpdate();
    // Only propagate if the package update succeeded
    if (updateStageRef.current !== 'error') {
      await updateAll();
    }
  }, [performUpdate, updateAll]);

  const isUpdatingPackage = updateStage === 'pulling' || updateStage === 'installing';
  const isCheckBusy = updateStage === 'checking' || updateStage === 'checked';
  const [showUpdateAllConfirm, setShowUpdateAllConfirm] = useState(false);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground text-sm">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading configuration status...
      </div>
    );
  }

  if (!summary || summary.total === 0) {
    return (
      <div className="text-sm text-muted-foreground/60">
        No projects registered.
      </div>
    );
  }

  const allProjectsSynced = summary.projectsOutdated === 0 && summary.noManifest === 0 && summary.totalOutdated === 0 && summary.totalMissing === 0 && summary.totalModified === 0 && summary.totalPinned === 0;

  return (
    <>
      {/* ── Package Version ── */}
      {version && (
        <>
          <div className="mb-2 flex items-baseline gap-3">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground/70">Package</span>
            <span className="text-[11px] text-muted-foreground/40">Globally installed Orbital Command version</span>
          </div>
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-2 min-w-0">
              <Package className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-sm text-foreground">Orbital Command</span>
              <Badge variant="outline" className={cn(
                'text-[10px] px-1.5 py-0',
                updateAvailable
                  ? 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10'
                  : 'border-green-500/30 text-green-400 bg-green-500/10',
              )}>
                v{version.version}
              </Badge>
              {updateAvailable && (
                <span className="text-xs text-emerald-400/70">
                  {behindCount} update{behindCount !== 1 ? 's' : ''} available
                </span>
              )}
              {updateStage === 'checked' && !updateAvailable && (
                <span className="text-xs text-green-400">Up to date</span>
              )}
              {updateStage === 'done' && (
                <span className="text-xs text-green-400">Updated — restart server to apply</span>
              )}
              {updateStage === 'error' && (
                <span className="text-xs text-red-400 truncate">{updateError}</span>
              )}
              {isUpdatingPackage && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  {updateStage === 'pulling' ? 'Pulling...' : 'Installing...'}
                </span>
              )}
            </div>

            <div className="flex gap-1.5 shrink-0">
              <Button
                size="sm"
                variant="ghost"
                onClick={checkForUpdate}
                disabled={isUpdatingPackage || isCheckBusy}
                className="h-7 px-2 text-xs"
              >
                {updateStage === 'checked' && !updateAvailable ? (
                  <CheckCircle2 className="h-3 w-3 mr-1 text-green-400" />
                ) : (
                  <RefreshCw className={cn('h-3 w-3 mr-1', updateStage === 'checking' && 'animate-spin')} />
                )}
                {updateStage === 'checked' && !updateAvailable ? 'Latest' : 'Check'}
              </Button>
              {updateAvailable && updateStage !== 'done' && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={updatePackageAndPropagate}
                  disabled={isUpdatingPackage}
                  className="h-7 px-2.5 text-xs border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
                >
                  {isUpdatingPackage
                    ? <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                    : <Download className="h-3 w-3 mr-1" />}
                  Update
                </Button>
              )}
            </div>
          </div>

          <Separator className="mb-4" />
        </>
      )}

      {/* ── Project Sync ── */}
      <div className="mb-2 flex items-baseline gap-3">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground/70">Project Sync</span>
        <span className="text-[11px] text-muted-foreground/40">Sync templates and config to your installed version</span>
      </div>
      <div className="flex items-center gap-2 mb-3 pl-3">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {allProjectsSynced ? (
            <CheckCircle2 className="h-2 w-2 text-green-400 shrink-0" />
          ) : (
            <AlertTriangle className="h-2 w-2 text-amber-400 shrink-0" />
          )}
          <span className="text-sm text-foreground truncate w-[80px] sm:w-[140px] shrink-0">
            All Projects
          </span>
          {version && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0 border-green-500/30 text-green-400 bg-green-500/10">
              v{version.version}
            </Badge>
          )}
          <span className="hidden md:flex items-center text-xs shrink-0 tabular-nums">
            <span className={cn('w-[80px] text-center', summary.totalMissing > 0 ? 'text-red-400' : 'text-red-400/25')}>{summary.totalMissing} missing</span>
            <span className={cn('w-[80px] text-center', summary.totalOutdated > 0 ? 'text-amber-400' : 'text-amber-400/25')}>{summary.totalOutdated} outdated</span>
            <span className={cn('w-[80px] text-center', summary.totalModified > 0 ? 'text-orange-400' : 'text-orange-400/25')}>{summary.totalModified} modified</span>
            <span className={cn('w-[80px] text-center', summary.totalPinned > 0 ? 'text-blue-400' : 'text-blue-400/25')}>{summary.totalPinned} pinned</span>
            <span className={cn('w-[80px] text-center', summary.totalSynced > 0 ? 'text-green-400/50' : 'text-green-400/20')}>{summary.totalSynced} synced</span>
            <span className={cn('w-[80px] text-center', summary.totalUserOwned > 0 ? 'text-muted-foreground/40' : 'text-muted-foreground/20')}>{summary.totalUserOwned} user</span>
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {(summary.totalOutdated > 0 || summary.totalMissing > 0) ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowUpdateAllConfirm(true)}
              disabled={actionLoading === 'update-all'}
              className="h-6 px-2 text-xs w-auto sm:w-[130px] justify-center border-[rgba(0,188,212,0.3)] text-cyan-400 hover:bg-cyan-500/10"
            >
              {actionLoading === 'update-all'
                ? <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                : <Package className="h-3 w-3 mr-1" />}
              Update All
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              disabled
              className="h-6 px-2 text-xs w-auto sm:w-[130px] justify-center border-green-500/30 text-green-400/60"
            >
              <Package className="h-3 w-3 mr-1" />
              Up to Date
            </Button>
          )}
        </div>
      </div>

      <Separator className="mb-2" />

      {/* ── Project Rows ── */}
      <div className="space-y-0.5 pl-3">
        {summary.projects.map(project => (
          <ConfigProjectRow
            key={project.projectId}
            project={project}
            expanded={expandedProjectId === project.projectId}
            files={expandedProjectId === project.projectId ? projectFiles : []}
            actionLoading={actionLoading}
            onToggle={() => expandProject(project.projectId)}
            onUpdate={() => previewProjectUpdate(project.projectId)}
            onInit={() => initProject(project.projectId)}
            onPin={(file) => pinFile(project.projectId, file)}
            onUnpin={(file) => unpinFile(project.projectId, file)}
            onReset={(file) => resetFile(project.projectId, file)}
            onRevert={(file) => revertFile(project.projectId, file)}
            onDiff={(file, status) => getDiff(project.projectId, file, status)}
          />
        ))}
      </div>

      {/* ── Update Project Confirmation ── */}
      <Dialog open={updatePreview !== null} onOpenChange={(open) => { if (!open) clearUpdatePreview(); }}>
        <DialogContent className="max-w-md p-0 max-h-[80vh] overflow-hidden grid grid-rows-[auto_auto_1fr_auto_auto]">
          <DialogHeader className="px-5 pt-4 pb-3 pr-10">
            <DialogTitle className="text-sm">
              Update {summary.projects.find(p => p.projectId === updatePreviewProjectId)?.projectName}
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
                onClick={() => applyProjectUpdate(updatePreviewProjectId)}
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

      {/* ── Update All Confirmation ── */}
      <Dialog open={showUpdateAllConfirm} onOpenChange={setShowUpdateAllConfirm}>
        <DialogContent className="max-w-md p-0 max-h-[80vh] overflow-hidden grid grid-rows-[auto_auto_1fr_auto_auto]">
          <DialogHeader className="px-5 pt-4 pb-3 pr-10">
            <DialogTitle className="text-sm">Update All Projects</DialogTitle>
            <span className="text-xs text-muted-foreground/60">
              Review what will happen across all projects
            </span>
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
              onClick={() => { setShowUpdateAllConfirm(false); updateAll(); }}
              disabled={actionLoading === 'update-all'}
              className="bg-cyan-600 hover:bg-cyan-700 text-white"
            >
              {actionLoading === 'update-all' && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              Update All Projects
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Diff Dialog ── */}
      <Dialog open={diffFile !== null} onOpenChange={(open) => { if (!open) clearDiff(); }}>
        <DialogContent className="max-w-2xl p-0 max-h-[80vh] overflow-hidden grid grid-rows-[auto_auto_auto_1fr_auto_auto]">
          {/* Header */}
          <DialogHeader className="px-5 pt-4 pb-3 pr-10">
            <DialogTitle className="text-sm font-mono">{diffFile}</DialogTitle>
            <span className="text-xs text-muted-foreground/60">
              Template → Your file
            </span>
          </DialogHeader>

          <Separator />

          {/* Legend */}
          <div className="px-5 py-2 text-xs text-muted-foreground/50">
            <span className="text-red-400/70">−</span> template version
            <span className="mx-2">·</span>
            <span className="text-green-400/70">+</span> your local file
          </div>

          {/* Diff body — scrollable */}
          <div className="overflow-auto min-h-0">
            {diffContent ? (
              <DiffViewer diff={diffContent} />
            ) : (
              <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Loading diff...
              </div>
            )}
          </div>

          {/* Footer with contextual action */}
          <Separator />
          <div className="px-5 py-3 flex justify-end gap-2">
            <DialogClose asChild>
              <Button variant="ghost" size="sm">Close</Button>
            </DialogClose>
            {diffFileStatus === 'outdated' && diffProjectId && (
              <Button
                size="sm"
                onClick={() => { resetFile(diffProjectId, diffFile!); clearDiff(); }}
                disabled={actionLoading === `reset:${diffFile}`}
                className="bg-cyan-600 hover:bg-cyan-700 text-white"
              >
                {actionLoading === `reset:${diffFile}` && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
                Update to latest
              </Button>
            )}
            {diffFileStatus === 'modified' && diffProjectId && (
              <Button
                size="sm"
                onClick={() => { resetFile(diffProjectId, diffFile!); clearDiff(); }}
                disabled={actionLoading === `reset:${diffFile}`}
                variant="outline"
              >
                {actionLoading === `reset:${diffFile}` && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
                Reset to template
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Diff Viewer ────────────────────────────────────────────

interface DiffLine {
  type: 'add' | 'remove' | 'context' | 'hunk' | 'meta';
  content: string;
  oldNum?: number;
  newNum?: number;
}

function parseDiff(raw: string): DiffLine[] {
  const lines = raw.split('\n');
  const result: DiffLine[] = [];
  let oldLine = 0;
  let newLine = 0;

  for (const line of lines) {
    // Hunk header: @@ -5,18 +5,14 @@
    const hunkMatch = line.match(/^@@\s+-(\d+)(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s+@@(.*)/);
    if (hunkMatch) {
      oldLine = parseInt(hunkMatch[1], 10);
      newLine = parseInt(hunkMatch[2], 10);
      result.push({ type: 'hunk', content: line });
      continue;
    }

    // Meta lines (diff --git, index, ---, +++)
    if (line.startsWith('diff ') || line.startsWith('index ') ||
        line.startsWith('--- ') || line.startsWith('+++ ')) {
      result.push({ type: 'meta', content: line });
      continue;
    }

    if (line.startsWith('-')) {
      result.push({ type: 'remove', content: line.slice(1), oldNum: oldLine });
      oldLine++;
    } else if (line.startsWith('+')) {
      result.push({ type: 'add', content: line.slice(1), newNum: newLine });
      newLine++;
    } else {
      // Context line (starts with space or is empty)
      const content = line.startsWith(' ') ? line.slice(1) : line;
      result.push({ type: 'context', content, oldNum: oldLine, newNum: newLine });
      oldLine++;
      newLine++;
    }
  }

  return result;
}

function DiffViewer({ diff }: { diff: string }) {
  const lines = parseDiff(diff);

  // Compute gutter width based on max line number
  const maxNum = lines.reduce((m, l) => Math.max(m, l.oldNum ?? 0, l.newNum ?? 0), 0);
  const gutterWidth = String(maxNum).length;

  return (
    <div className="text-[11px] font-mono leading-[1.6] pb-1">
      {lines.map((line, i) => {
        if (line.type === 'meta') return null;

        if (line.type === 'hunk') {
          return (
            <div key={i} className="px-3 py-1.5 mt-1 first:mt-0 text-cyan-400/60 bg-cyan-500/5 border-y border-cyan-500/10 select-none">
              {line.content}
            </div>
          );
        }

        const oldGutter = line.oldNum != null ? String(line.oldNum).padStart(gutterWidth) : ''.padStart(gutterWidth);
        const newGutter = line.newNum != null ? String(line.newNum).padStart(gutterWidth) : ''.padStart(gutterWidth);

        const rowStyle = cn(
          'flex',
          line.type === 'add' && 'bg-green-500/10',
          line.type === 'remove' && 'bg-red-500/10',
        );

        const gutterStyle = cn(
          'select-none border-r border-border/40 px-2 text-right shrink-0',
          line.type === 'add' && 'text-green-400/40',
          line.type === 'remove' && 'text-red-400/40',
          line.type === 'context' && 'text-muted-foreground/25',
        );

        const contentStyle = cn(
          'px-3 whitespace-pre-wrap break-all flex-1 min-w-0',
          line.type === 'add' && 'text-green-400',
          line.type === 'remove' && 'text-red-400',
          line.type === 'context' && 'text-foreground/50',
        );

        const marker = line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' ';

        return (
          <div key={i} className={rowStyle}>
            <span className={gutterStyle}>{oldGutter}</span>
            <span className={gutterStyle}>{newGutter}</span>
            <span className={cn(
              'w-4 text-center shrink-0 select-none',
              line.type === 'add' && 'text-green-400/60',
              line.type === 'remove' && 'text-red-400/60',
              line.type === 'context' && 'text-transparent',
            )}>{marker}</span>
            <span className={contentStyle}>{line.content || '\u00a0'}</span>
          </div>
        );
      })}
    </div>
  );
}
