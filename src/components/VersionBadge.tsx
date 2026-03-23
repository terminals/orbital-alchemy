import { RefreshCw, Download, Check, AlertCircle, GitBranch, GitCommit, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useVersion } from '@/hooks/useVersion';
import { cn } from '@/lib/utils';

export function VersionBadge() {
  const {
    version,
    updateAvailable,
    behindCount,
    updateStage,
    updateError,
    loading,
    checkForUpdate,
    performUpdate,
  } = useVersion();

  if (loading) return null;
  if (!version) {
    return (
      <button className="version-badge flex items-center gap-1.5 rounded-lg px-2 py-1 text-[10px] font-mono text-muted-foreground/50">
        <span>v?</span>
      </button>
    );
  }

  const isWorking = updateStage === 'checking' || updateStage === 'pulling' || updateStage === 'installing';

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="relative cursor-pointer">
          <Badge
            variant={updateAvailable ? 'warning' : 'success'}
            className="version-badge font-mono text-[10px] transition-colors"
          >
            v{version.version}
          </Badge>
          {updateAvailable && (
            <span className="version-pulse-dot absolute -top-1 -right-1 h-2 w-2 rounded-full bg-emerald-400" />
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent
        side="top"
        align="end"
        sideOffset={8}
        className="w-64 filter-popover-glass"
      >
        <div className="space-y-3">
          {/* Version header */}
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-foreground">Orbital Command</span>
            <Badge variant="outline" className="font-mono text-[10px]">
              v{version.version}
            </Badge>
          </div>

          {/* Git info */}
          <div className="space-y-1.5 text-[11px] text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <GitCommit className="h-3 w-3" />
              <span className="font-mono">{version.commitSha}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <GitBranch className="h-3 w-3" />
              <span className="font-mono">{version.branch}</span>
            </div>
          </div>

          {/* Update status */}
          {updateAvailable && updateStage !== 'done' && (
            <div className="rounded-md border border-emerald-500/20 bg-emerald-500/5 px-2 py-1.5 text-[11px] text-emerald-400">
              {behindCount} commit{behindCount !== 1 ? 's' : ''} behind remote
            </div>
          )}

          {updateStage === 'done' && (
            <div className="flex items-center gap-1.5 rounded-md border border-emerald-500/20 bg-emerald-500/5 px-2 py-1.5 text-[11px] text-emerald-400">
              <Check className="h-3 w-3" />
              Updated. Restart server to apply.
            </div>
          )}

          {updateStage === 'error' && (
            <div className="flex items-start gap-1.5 rounded-md border border-destructive/20 bg-destructive/5 px-2 py-1.5 text-[11px] text-destructive">
              <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
              <span>{updateError ?? 'An unknown error occurred'}</span>
            </div>
          )}

          {isWorking && (
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>
                {updateStage === 'checking' && 'Checking for updates...'}
                {updateStage === 'pulling' && 'Pulling latest changes...'}
                {updateStage === 'installing' && 'Installing dependencies...'}
              </span>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <button
              onClick={checkForUpdate}
              disabled={isWorking}
              className={cn(
                'flex flex-1 items-center justify-center gap-1.5 rounded-md border border-border px-2 py-1 text-[11px]',
                'text-muted-foreground hover:text-foreground hover:bg-surface-light transition-colors',
                'disabled:opacity-40 disabled:cursor-not-allowed',
              )}
            >
              <RefreshCw className={cn('h-3 w-3', updateStage === 'checking' && 'animate-spin')} />
              Check
            </button>
            {updateAvailable && updateStage !== 'done' && (
              <button
                onClick={performUpdate}
                disabled={isWorking}
                className={cn(
                  'flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1 text-[11px]',
                  'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400',
                  'hover:bg-emerald-500/20 transition-colors',
                  'disabled:opacity-40 disabled:cursor-not-allowed',
                )}
              >
                <Download className="h-3 w-3" />
                Update
              </button>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
