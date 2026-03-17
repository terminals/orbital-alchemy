import { useState, useEffect, useRef } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { X, Layers, Package, Play } from 'lucide-react';
import type { Sprint, Scope, CardDisplayConfig } from '@/types';
import { ScopeCard } from './ScopeCard';
import { cn, formatScopeId } from '@/lib/utils';
import { useWorkflow } from '@/hooks/useWorkflow';

interface SprintContainerProps {
  sprint: Sprint;
  /** Full scope objects for scopes in the sprint (for rendering cards) */
  scopeLookup: Map<number, Scope>;
  onDelete?: (id: number) => void;
  onDispatch?: (id: number) => void;
  onRename?: (id: number, name: string) => void;
  onScopeClick?: (scope: Scope) => void;
  cardDisplay?: CardDisplayConfig;
  dimmedIds?: Set<number>;
  /** Number of loose (non-batched) scopes in the column — drives "Add all" button visibility */
  looseCount?: number;
  /** Bulk-add all loose column scopes into this batch */
  onAddAll?: (sprintId: number) => void;
  /** Whether this sprint was just created and should start with name editing */
  editingName?: boolean;
  /** Called when name editing finishes (committed or cancelled) */
  onEditingDone?: () => void;
}

const STATUS_STYLE: Record<string, string> = {
  assembling: 'border-dashed border-cyan-500/40',
  dispatched: 'border-solid border-amber-500/50 batch-group-dispatched',
  in_progress: 'border-solid border-amber-500/40 batch-group-dispatched',
  completed: 'border-solid border-green-500/40 opacity-60',
  failed: 'border-solid border-red-500/40',
  cancelled: 'border-solid border-muted-foreground/30 opacity-50',
};

const STATUS_LABEL: Record<string, string> = {
  assembling: 'Assembling',
  dispatched: 'Dispatched',
  in_progress: 'Running',
  completed: 'Complete',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

function totalEffortHours(sprint: Sprint): string {
  let total = 0;
  for (const ss of sprint.scopes) {
    if (!ss.effort_estimate) continue;
    const match = ss.effort_estimate.toLowerCase().match(/(\d+(?:\.\d+)?)\s*hour/);
    if (match) total += parseFloat(match[1]);
    const minMatch = ss.effort_estimate.toLowerCase().match(/(\d+)\s*min/);
    if (minMatch) total += parseInt(minMatch[1]) / 60;
  }
  if (total === 0) return 'TBD';
  return total < 1 ? `${Math.round(total * 60)}M` : `~${total.toFixed(0)}H`;
}

export function SprintContainer({ sprint, scopeLookup, onDelete, onDispatch, onRename, onScopeClick, cardDisplay, dimmedIds, looseCount, onAddAll, editingName, onEditingDone }: SprintContainerProps) {
  const { engine } = useWorkflow();
  const isAssembling = sprint.status === 'assembling';
  const [isEditing, setIsEditing] = useState(editingName ?? false);
  const [draftName, setDraftName] = useState(sprint.name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingName) {
      setIsEditing(true);
      setDraftName('');
    }
  }, [editingName]);

  useEffect(() => {
    if (isEditing) inputRef.current?.focus();
  }, [isEditing]);

  const commitName = () => {
    const trimmed = draftName.trim();
    if (trimmed && trimmed !== sprint.name && onRename) {
      onRename(sprint.id, trimmed);
    }
    setIsEditing(false);
    setDraftName(trimmed || sprint.name);
    onEditingDone?.();
  };
  const isBatch = sprint.group_type === 'batch';
  const batchActionLabel = isBatch
    ? (() => {
        const target = engine.getBatchTargetStatus(sprint.target_column);
        return target ? engine.findEdge(sprint.target_column, target)?.label ?? 'Dispatch' : 'Dispatch';
      })()
    : undefined;

  // Only sprints are draggable (batches dispatch via header button)
  const {
    attributes: dragAttrs,
    listeners: dragListeners,
    setNodeRef: setDragRef,
    transform,
    isDragging,
  } = useDraggable({
    id: `sprint-${sprint.id}`,
    disabled: isBatch || !isAssembling || sprint.scope_ids.length === 0,
  });

  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `sprint-drop-${sprint.id}`,
    disabled: !isAssembling,
  });

  const dragStyle = transform ? { transform: CSS.Translate.toString(transform) } : undefined;

  const totalScopes = sprint.scope_ids.length;
  const { progress } = sprint;
  const canDispatch = isBatch && isAssembling && totalScopes > 0 && onDispatch;

  // Icon and border vary by group_type
  const Icon = isBatch ? Package : Layers;
  const iconColor = isBatch ? 'text-amber-400' : 'text-cyan-400';
  const borderStyle = isBatch && isAssembling
    ? 'border-muted-foreground/30'
    : STATUS_STYLE[sprint.status] ?? 'border-muted-foreground/30';

  return (
    <div
      ref={setDragRef}
      style={{
        ...dragStyle,
        ...(isBatch && isAssembling ? { borderColor: (engine.getList(sprint.target_column)?.hex ?? '') + '80' } : undefined),
      }}
      className={cn(
        'rounded-lg border bg-card/30 transition-all duration-200',
        borderStyle,
        isDragging && 'opacity-30',
        !isBatch && isAssembling && 'cursor-grab active:cursor-grabbing',
      )}
      {...(isBatch ? {} : dragAttrs)}
      {...(isBatch ? {} : dragListeners)}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-2.5 py-1.5 border-b border-inherit">
        <Icon className={cn('h-3 w-3 shrink-0', iconColor)} />
        {isEditing ? (
          <input
            ref={inputRef}
            className="min-w-0 flex-1 h-5 rounded bg-muted/50 px-1.5 text-xs font-medium text-foreground border border-cyan-500/30 focus:outline-none focus:ring-1 focus:ring-cyan-500/50"
            placeholder={isBatch ? 'Batch name...' : 'Sprint name...'}
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitName();
              if (e.key === 'Escape') { setIsEditing(false); setDraftName(sprint.name); onEditingDone?.(); }
            }}
            onBlur={commitName}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span
            className={cn('text-xs font-medium text-foreground truncate flex-1', isAssembling && 'cursor-text')}
            onDoubleClick={() => { if (isAssembling) { setIsEditing(true); setDraftName(sprint.name); } }}
          >
            {sprint.name}
          </span>
        )}
        <span className={cn(
          'rounded px-1 py-0.5 text-[10px] uppercase',
          sprint.status === 'dispatched' || sprint.status === 'in_progress'
            ? 'bg-amber-500/20 text-amber-400'
            : sprint.status === 'completed'
            ? 'bg-green-500/20 text-green-400'
            : sprint.status === 'failed'
            ? 'bg-red-500/20 text-red-400'
            : 'text-muted-foreground',
        )}>
          {STATUS_LABEL[sprint.status]}
        </span>
        {isAssembling && (looseCount ?? 0) > 0 && onAddAll && (
          <button
            onClick={(e) => { e.stopPropagation(); onAddAll(sprint.id); }}
            className="shrink-0 flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
            title={`Add all ${looseCount} remaining scopes`}
          >
            + All ({looseCount})
          </button>
        )}
        {canDispatch && (
          <button
            onClick={(e) => { e.stopPropagation(); onDispatch(sprint.id); }}
            className="shrink-0 flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] bg-cyan-600/80 text-black hover:bg-cyan-500/80 transition-colors"
            title={batchActionLabel ?? 'Dispatch'}
          >
            <Play className="h-2.5 w-2.5" />
            {batchActionLabel ?? 'Dispatch'}
          </button>
        )}
        {isAssembling && onDelete && (
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(sprint.id); }}
            className="shrink-0 text-muted-foreground hover:text-red-400 transition-colors"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* Scope Cards (inside the sprint) */}
      <div
        ref={setDropRef}
        className={cn(
          'p-1.5 space-y-1 min-h-[40px] transition-colors duration-150',
          isOver && isAssembling && 'bg-cyan-500/5 ring-1 ring-inset ring-cyan-500/30 rounded-b-lg',
        )}
      >
        {sprint.scope_ids.map((scopeId) => {
          const scope = scopeLookup.get(scopeId);
          if (!scope) {
            // Fallback: show minimal info from sprint scope data
            const ss = sprint.scopes.find((s) => s.scope_id === scopeId);
            return (
              <div key={scopeId} className="rounded border border-muted-foreground/20 bg-card/50 px-2 py-1 text-xs text-muted-foreground">
                <span className="font-mono">{formatScopeId(scopeId)}</span>
                {ss && <span className="ml-2">{ss.title}</span>}
              </div>
            );
          }
          return (
            <ScopeCard key={scopeId} scope={scope} onClick={onScopeClick} cardDisplay={cardDisplay} dimmed={dimmedIds?.has(scopeId)} />
          );
        })}
        {totalScopes === 0 && isAssembling && isOver && (
          <p className="py-3 text-center text-[10px] text-muted-foreground/50">
            Drop to add
          </p>
        )}
      </div>

      {/* Footer: effort + scope count + progress + dispatch result */}
      <div className="flex items-center justify-between border-t border-inherit px-2.5 py-1">
        <span className="text-[10px] text-muted-foreground">
          {isBatch ? batchActionLabel ?? 'Batch' : `Effort: ${totalEffortHours(sprint)}`}
        </span>
        <span className="text-[10px] text-muted-foreground">
          {totalScopes} scope{totalScopes !== 1 ? 's' : ''}
        </span>
        {sprint.status !== 'assembling' && totalScopes > 0 && (
          <div className="flex items-center gap-1">
            {progress.completed > 0 && (
              <span className="text-[10px] text-green-400">{progress.completed} done</span>
            )}
            {progress.failed > 0 && (
              <span className="text-[10px] text-red-400">{progress.failed} fail</span>
            )}
            {progress.in_progress > 0 && (
              <span className="text-[10px] text-amber-400">{progress.in_progress} active</span>
            )}
          </div>
        )}
      </div>
      {/* Dispatch result (batch only — commit SHA / PR link) */}
      {isBatch && sprint.dispatch_result && (
        <div className="border-t border-inherit px-2.5 py-1 text-[10px] text-muted-foreground space-y-0.5">
          {sprint.dispatch_result.commit_sha && (
            <span className="font-mono">{sprint.dispatch_result.commit_sha.slice(0, 7)}</span>
          )}
          {sprint.dispatch_result.pr_url && (
            <a
              href={sprint.dispatch_result.pr_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-cyan-400 hover:underline ml-1"
            >
              PR #{sprint.dispatch_result.pr_number ?? ''}
            </a>
          )}
        </div>
      )}
    </div>
  );
}

/** Compact sprint preview for drag overlay */
export function SprintDragPreview({ sprint }: { sprint: Sprint }) {
  return (
    <div className="w-72 rotate-1 opacity-90 shadow-xl shadow-black/40 rounded-lg border border-cyan-500/40 bg-card/80 p-2">
      <div className="flex items-center gap-2 mb-1">
        <Layers className="h-3 w-3 text-cyan-400" />
        <span className="text-xs font-medium">{sprint.name}</span>
      </div>
      <div className="space-y-0.5">
        {sprint.scopes.slice(0, 3).map((ss) => (
          <div key={ss.scope_id} className="rounded bg-muted/30 px-1.5 py-0.5 text-[10px] text-muted-foreground truncate">
            {formatScopeId(ss.scope_id)} {ss.title}
          </div>
        ))}
        {sprint.scopes.length > 3 && (
          <p className="text-[10px] text-muted-foreground text-center">+{sprint.scopes.length - 3} more</p>
        )}
      </div>
    </div>
  );
}
