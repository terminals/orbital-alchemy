import { useCallback, useRef, useState } from 'react';
import {
  Package, Loader2, CheckCircle2, AlertTriangle,
  Download, RefreshCw,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { useAggregateManifest } from '@/hooks/useAggregateManifest';
import { useVersion } from '@/hooks/useVersion';
import { ConfigProjectRow } from './ConfigProjectRow';
import { UpdatePreviewDialog } from './UpdatePreviewDialog';
import { UpdateAllDialog } from './UpdateAllDialog';
import { DiffViewerDialog } from './DiffViewerDialog';

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

  // Roll up per-project readiness: "all synced" means every registered project has
  // a clean manifest AND no dirty files. Checking per-project state directly avoids
  // the mismatch where file counters (totalOutdated, etc.) report clean while
  // individual projects still have manifest.needsUpdate=true.
  const allProjectsSynced =
    summary.projects.length > 0 &&
    summary.projects.every(p => p.status === 'ok' && !p.manifest?.needsUpdate) &&
    summary.noManifest === 0 &&
    summary.totalOutdated === 0 &&
    summary.totalMissing === 0 &&
    summary.totalModified === 0 &&
    summary.totalPinned === 0;
  const projectsNeedingUpdate = summary.projects.filter(p => p.status === 'ok' && p.manifest?.needsUpdate).length;

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
          {!allProjectsSynced ? (
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
              {projectsNeedingUpdate > 0
                ? `Update ${projectsNeedingUpdate}/${summary.projects.length}`
                : 'Update All'}
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
      <UpdatePreviewDialog
        updatePreview={updatePreview}
        projectName={summary.projects.find(p => p.projectId === updatePreviewProjectId)?.projectName}
        updatePreviewProjectId={updatePreviewProjectId}
        actionLoading={actionLoading}
        onApply={applyProjectUpdate}
        onClose={clearUpdatePreview}
      />

      {/* ── Update All Confirmation ── */}
      <UpdateAllDialog
        open={showUpdateAllConfirm}
        onOpenChange={setShowUpdateAllConfirm}
        summary={summary}
        actionLoading={actionLoading}
        onUpdateAll={updateAll}
      />

      {/* ── Diff Dialog ── */}
      <DiffViewerDialog
        diffFile={diffFile}
        diffContent={diffContent}
        diffFileStatus={diffFileStatus}
        diffProjectId={diffProjectId}
        actionLoading={actionLoading}
        onResetFile={resetFile}
        onClearDiff={clearDiff}
      />
    </>
  );
}
