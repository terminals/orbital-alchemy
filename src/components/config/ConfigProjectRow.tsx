import {
  ChevronDown, ChevronRight, Package, Loader2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ConfigFileInventory } from './ConfigFileInventory';
import type { ProjectManifestOverview, ManifestFileEntry } from '@/types';

interface ConfigProjectRowProps {
  project: ProjectManifestOverview;
  expanded: boolean;
  files: ManifestFileEntry[];
  actionLoading: string | null;
  onToggle: () => void;
  onUpdate: () => void;
  onInit: () => void;
  onPin: (file: string) => void;
  onUnpin: (file: string) => void;
  onReset: (file: string) => void;
  onRevert: (file: string) => void;
  onDiff: (file: string, status: ManifestFileEntry['status']) => void;
}

export function ConfigProjectRow({
  project, expanded, files, actionLoading,
  onToggle, onUpdate, onInit,
  onPin, onUnpin, onReset, onRevert, onDiff,
}: ConfigProjectRowProps) {
  const { projectId, projectName, projectColor, status, manifest } = project;

  // No manifest state
  if (status === 'no-manifest') {
    return (
      <div className="py-1.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className="h-2 w-2 rounded-full shrink-0"
              style={{ backgroundColor: `hsl(${projectColor})` }}
            />
            <span className="text-sm text-foreground truncate">{projectName}</span>
            <span className="text-xs text-muted-foreground/40">No manifest</span>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={onInit}
            disabled={actionLoading === `init:${projectId}`}
            className="h-6 px-2 text-xs border-[rgba(0,188,212,0.3)] text-cyan-400 hover:bg-cyan-500/10"
          >
            {actionLoading === `init:${projectId}`
              ? <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              : <Package className="h-3 w-3 mr-1" />}
            Initialize
          </Button>
        </div>
      </div>
    );
  }

  // Error state
  if (status === 'error') {
    return (
      <div className="py-1.5">
        <div className="flex items-center gap-2">
          <span
            className="h-2 w-2 rounded-full shrink-0 opacity-40"
            style={{ backgroundColor: `hsl(${projectColor})` }}
          />
          <span className="text-sm text-foreground/50 truncate">{projectName}</span>
          <span className="text-xs text-red-400/60">Offline</span>
        </div>
      </div>
    );
  }

  // Normal state — has manifest
  const m = manifest!;
  const hasUpdatable = m.files.outdated > 0 || m.files.missing > 0 || m.needsUpdate;

  return (
    <div className="py-1.5">
      <div className="flex items-center gap-2">
        {/* Left: color dot + name + version + status */}
        <div
          className="flex items-center gap-2 min-w-0 flex-1 cursor-pointer hover:opacity-80 transition-opacity"
          onClick={onToggle}
        >
          <span
            className="h-2 w-2 rounded-full shrink-0"
            style={{ backgroundColor: `hsl(${projectColor})` }}
          />
          <span className="text-sm text-foreground truncate w-[140px] shrink-0">{projectName}</span>
          <Badge variant="outline" className={cn(
            'text-[10px] px-1.5 py-0 shrink-0',
            m.needsUpdate
              ? 'border-amber-500/30 text-amber-400 bg-amber-500/10'
              : 'border-green-500/30 text-green-400 bg-green-500/10',
          )}>
            v{m.installedVersion}
          </Badge>
          {m.needsUpdate && (
            <span className="text-[10px] text-amber-400/60 shrink-0">
              → v{m.packageVersion}
            </span>
          )}
          <span className="flex items-center text-xs shrink-0 tabular-nums">
            <span className={cn('w-[80px] text-center', m.files.missing > 0 ? 'text-red-400' : 'text-red-400/25')}>{m.files.missing} missing</span>
            <span className={cn('w-[80px] text-center', m.files.outdated > 0 ? 'text-amber-400' : 'text-amber-400/25')}>{m.files.outdated} outdated</span>
            <span className={cn('w-[80px] text-center', m.files.modified > 0 ? 'text-orange-400' : 'text-orange-400/25')}>{m.files.modified} modified</span>
            <span className={cn('w-[80px] text-center', m.files.pinned > 0 ? 'text-blue-400' : 'text-blue-400/25')}>{m.files.pinned} pinned</span>
            <span className={cn('w-[80px] text-center', m.files.synced > 0 ? 'text-green-400/50' : 'text-green-400/20')}>{m.files.synced} synced</span>
            <span className={cn('w-[80px] text-center', m.files.userOwned > 0 ? 'text-muted-foreground/40' : 'text-muted-foreground/20')}>{m.files.userOwned} user</span>
          </span>
        </div>

        {/* Right: update project + expand toggle */}
        <div className="flex items-center gap-1.5 shrink-0">
          <Button
            size="sm"
            variant="outline"
            onClick={hasUpdatable ? onUpdate : undefined}
            disabled={!hasUpdatable || actionLoading === `preview:${projectId}` || actionLoading === `update:${projectId}`}
            className={cn(
              'h-6 px-2 text-xs w-[130px] justify-center',
              hasUpdatable
                ? 'border-[rgba(0,188,212,0.3)] text-cyan-400 hover:bg-cyan-500/10'
                : 'border-green-500/30 text-green-400/60',
            )}
          >
            {(actionLoading === `preview:${projectId}` || actionLoading === `update:${projectId}`)
              ? <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              : <Package className="h-3 w-3 mr-1" />}
            {hasUpdatable ? 'Update Project' : 'Up to Date'}
          </Button>
          <button
            onClick={onToggle}
            className="flex items-center justify-center h-6 w-6 rounded text-muted-foreground/40 hover:text-muted-foreground hover:bg-white/5 transition-colors"
          >
            {expanded
              ? <ChevronDown className="h-3.5 w-3.5" />
              : <ChevronRight className="h-3.5 w-3.5" />
            }
          </button>
        </div>
      </div>

      {/* Expanded file inventory */}
      {expanded && (
        <ConfigFileInventory
          files={files}
          actionLoading={actionLoading}
          onPin={onPin}
          onUnpin={onUnpin}
          onReset={onReset}
          onRevert={onRevert}
          onDiff={onDiff}
        />
      )}
    </div>
  );
}
