import { useState, useEffect, useRef } from 'react';
import { useDraggable, useDroppable, useDndContext } from '@dnd-kit/core';
import { X, Layers, Package, Clock, Check } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Sprint, Scope, CardDisplayConfig, Project } from '@/types';
import { scopeKey, parseScopeKey } from '@/lib/scope-key';
import { ScopeCard } from './ScopeCard';
import { ProjectSelectorPill } from './ProjectSelectorPill';
import { cn, formatScopeId } from '@/lib/utils';
import { useWorkflow } from '@/hooks/useWorkflow';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

interface SprintContainerProps {
  sprint: Sprint;
  /** Full scope objects keyed by composite scopeKey (project_id::id) */
  scopeLookup: Map<string, Scope>;
  onDelete?: (id: number) => void;

  onRename?: (id: number, name: string) => void;
  onScopeClick?: (scope: Scope) => void;
  cardDisplay?: CardDisplayConfig;
  dimmedIds?: Set<string>;
  /** Number of loose (non-batched) scopes in the column — drives "Add all" button visibility */
  looseCount?: number;
  /** Bulk-add all loose column scopes into this batch */
  onAddAll?: (sprintId: number) => void;
  /** Project lookup for rendering project color indicators */
  projectLookup?: Map<string, Project>;
  /** Whether this sprint was just created and should start with name editing */
  editingName?: boolean;
  /** Called when name editing finishes (committed or cancelled) */
  onEditingDone?: () => void;
  /** Called when user changes the project assignment (empty assembling sprints only) */
  onProjectChange?: (sprintId: number, newProjectId: string) => void;
}

const STATUS_STYLE: Record<string, string> = {
  assembling: 'border-dashed border-cyan-500/40',
  dispatched: 'border-solid border-amber-500/50 batch-group-dispatched',
  in_progress: 'border-solid border-amber-500/40 batch-group-dispatched',
  completed: 'border-solid border-green-500/40',
  failed: 'border-solid border-red-500/40',
  cancelled: 'border-solid border-muted-foreground/30 opacity-50',
};

const STATUS_PILL: Record<string, { icon: LucideIcon; label: string; bg: string; text: string }> = {
  assembling:  { icon: Layers, label: 'Assembling',  bg: 'bg-cyan-500/15',  text: 'text-cyan-400' },
  dispatched:  { icon: Clock,  label: 'In Progress', bg: 'bg-amber-500/15', text: 'text-amber-400' },
  in_progress: { icon: Clock,  label: 'In Progress', bg: 'bg-amber-500/15', text: 'text-amber-400' },
  completed:   { icon: Check,  label: 'Completed',   bg: 'bg-green-500/15', text: 'text-green-400' },
  failed:      { icon: X,      label: 'Failed',      bg: 'bg-red-500/15',   text: 'text-red-400' },
  cancelled:   { icon: X,      label: 'Cancelled',   bg: 'bg-muted',        text: 'text-muted-foreground' },
};

export function SprintContainer({ sprint, scopeLookup, onDelete, onRename, onScopeClick, cardDisplay, dimmedIds, looseCount, onAddAll, projectLookup, editingName, onEditingDone, onProjectChange }: SprintContainerProps) {
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


  const isExecuting = sprint.status === 'dispatched' || sprint.status === 'in_progress';
  const {
    attributes: dragAttrs,
    listeners: dragListeners,
    setNodeRef: setDragRef,
    isDragging,
  } = useDraggable({
    id: `sprint-${sprint.id}`,
    disabled: isExecuting || sprint.scope_ids.length === 0,
  });

  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `sprint-drop-${sprint.id}`,
    disabled: !isAssembling,
  });
  const { active: dndActive } = useDndContext();
  const activeDragId = dndActive ? String(dndActive.id) : null;
  const dragProjectId = activeDragId && !activeDragId.startsWith('sprint-') ? parseScopeKey(activeDragId).projectId : undefined;
  const isDragActive = isAssembling && activeDragId != null && !activeDragId.startsWith('sprint-')
    && (!sprint.project_id || !dragProjectId || sprint.project_id === dragProjectId);

  const totalScopes = sprint.scope_ids.length;
  const { progress } = sprint;


  // Icon and border vary by group_type
  const Icon = isBatch ? Package : Layers;
  const project = sprint.project_id && projectLookup?.get(sprint.project_id);
  const projectHsl = project ? `hsl(${project.color})` : undefined;
  const projectHeaderBg = project ? `hsl(${project.color} / 0.1)` : undefined;
  const iconColor = projectHsl ? '' : 'text-muted-foreground';
  const borderStyle = isBatch && isAssembling
    ? 'border-muted-foreground/30'
    : STATUS_STYLE[sprint.status] ?? 'border-muted-foreground/30';

  return (
    <div
      ref={setDragRef}
      style={{
        ...(projectHsl
          ? { borderColor: projectHsl }
          : isBatch && isAssembling
            ? { borderColor: (engine.getList(sprint.target_column)?.hex ?? '') + '80' }
            : undefined),
      }}
      className={cn(
        'rounded-lg border bg-card/30 transition-all duration-200',
        !projectHsl && borderStyle,
        isDragging && 'opacity-0',
        !isExecuting && sprint.scope_ids.length > 0 && 'cursor-grab active:cursor-grabbing',
      )}
      {...dragAttrs}
      {...dragListeners}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2 px-2.5 py-1.5 border-b border-inherit rounded-t-lg transition-colors duration-200"
        style={projectHeaderBg ? { backgroundColor: projectHeaderBg } : undefined}
      >
        <Icon className={cn('h-3 w-3 shrink-0 transition-colors duration-200', iconColor)} style={projectHsl ? { color: projectHsl } : undefined} />
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
            className={cn('text-xs font-medium text-foreground truncate', isAssembling && 'cursor-text')}
            onDoubleClick={() => { if (isAssembling) { setIsEditing(true); setDraftName(sprint.name); } }}
          >
            {sprint.name}
          </span>
        )}
        <div className="flex-1" />
        {isAssembling && (looseCount ?? 0) > 0 && onAddAll && (
          <button
            onClick={(e) => { e.stopPropagation(); onAddAll(sprint.id); }}
            className="shrink-0 flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
            title={`Add all ${looseCount} remaining scopes`}
          >
            + All ({looseCount})
          </button>
        )}

        {onDelete && (
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(sprint.id); }}
            disabled={sprint.status === 'dispatched' || sprint.status === 'in_progress'}
            className={cn(
              'shrink-0 transition-colors',
              sprint.status === 'dispatched' || sprint.status === 'in_progress'
                ? 'text-muted-foreground/30 cursor-not-allowed'
                : 'text-muted-foreground hover:text-[#FFFFFF]',
            )}
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
          const lookupKey = sprint.project_id ? `${sprint.project_id}::${scopeId}` : String(scopeId);
          const scope = scopeLookup.get(lookupKey);
          if (!scope) {
            const ss = sprint.scopes.find((s) => s.scope_id === scopeId);
            return (
              <div key={scopeId} className="rounded border border-muted-foreground/20 bg-card/50 px-2 py-1 text-xs text-muted-foreground">
                <span className="font-mono">{formatScopeId(scopeId)}</span>
                {ss && <span className="ml-2">{ss.title}</span>}
              </div>
            );
          }
          // Hide the card being dragged out — collapse its space in the container
          if (activeDragId && scopeKey(scope) === activeDragId) return null;
          return (
            <ScopeCard key={scopeKey(scope)} scope={scope} onClick={onScopeClick} cardDisplay={cardDisplay} dimmed={dimmedIds?.has(scopeKey(scope))} project={scope.project_id && projectLookup ? projectLookup.get(scope.project_id) : undefined} />
          );
        })}
        {isDragActive && (
          <div className={cn(
            'flex h-8 items-center justify-center rounded border border-dashed text-[10px] transition-colors',
            isOver
              ? 'border-cyan-500/60 bg-cyan-500/10 text-cyan-400'
              : 'border-white/20 bg-white/[0.03] text-white/30',
          )}>
            Drop to add
          </div>
        )}
      </div>

      {/* Footer: project pill + scope count + status pill */}
      <div className="flex items-center justify-between border-t border-inherit px-2.5 py-1">
        <div className="inline-flex items-stretch rounded-full border border-muted-foreground/30 bg-muted/40 pl-0 pr-2 text-[10px] leading-[16px] text-muted-foreground">
          <ProjectSelectorPill
            projectId={sprint.project_id}
            disabled={totalScopes > 0 || !isAssembling}
            onProjectChange={onProjectChange ? (newId) => onProjectChange(sprint.id, newId) : undefined}
            className="-ml-px -my-px"
          />
          <span className="ml-1.5 flex items-center">{totalScopes} scope{totalScopes !== 1 ? 's' : ''}</span>
        </div>
        {(() => {
          const pill = STATUS_PILL[sprint.status];
          if (!pill) return null;
          const PillIcon = pill.icon;
          const hasProgress = !isAssembling && totalScopes > 0
            && (progress.completed > 0 || progress.failed > 0 || progress.in_progress > 0);
          const pillEl = (
            <span className={cn(
              'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] leading-[16px]',
              pill.bg, pill.text,
            )}>
              <PillIcon className="h-2.5 w-2.5" />
              {pill.label}
            </span>
          );
          if (!hasProgress) return pillEl;
          const lines: string[] = [];
          if (progress.completed > 0) lines.push(`${progress.completed} done`);
          if (progress.in_progress > 0) lines.push(`${progress.in_progress} active`);
          if (progress.failed > 0) lines.push(`${progress.failed} failed`);
          return (
            <Tooltip>
              <TooltipTrigger asChild>{pillEl}</TooltipTrigger>
              <TooltipContent side="top">{lines.join(' \u00b7 ')}</TooltipContent>
            </Tooltip>
          );
        })()}
      </div>
      {/* Dispatch result (batch only — commit SHA / PR link) */}
      {isBatch && sprint.dispatch_result && (sprint.dispatch_result.commit_sha || sprint.dispatch_result.pr_url) && (
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

/** Drag overlay that mirrors the actual SprintContainer appearance */
export function SprintDragPreview({ sprint, scopeLookup, projectLookup }: {
  sprint: Sprint;
  scopeLookup?: Map<string, Scope>;
  projectLookup?: Map<string, Project>;
}) {
  const isBatch = sprint.group_type === 'batch';
  const Icon = isBatch ? Package : Layers;
  const project = sprint.project_id && projectLookup?.get(sprint.project_id);
  const projectHsl = project ? `hsl(${project.color})` : undefined;
  const projectHeaderBg = project ? `hsl(${project.color} / 0.1)` : undefined;
  const iconColor = projectHsl ? '' : 'text-muted-foreground';
  const borderStyle = STATUS_STYLE[sprint.status] ?? 'border-muted-foreground/30';
  const pill = STATUS_PILL[sprint.status];
  const totalScopes = sprint.scope_ids.length;

  return (
    <div
      className={cn('w-72 rotate-1 opacity-90 shadow-xl shadow-black/40 rounded-lg border bg-card/80 overflow-hidden', !projectHsl && borderStyle)}
      style={projectHsl ? { borderColor: projectHsl } : undefined}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2 px-2.5 py-1.5 border-b border-inherit rounded-t-lg"
        style={projectHeaderBg ? { backgroundColor: projectHeaderBg } : undefined}
      >
        <Icon className={cn('h-3 w-3 shrink-0', iconColor)} style={projectHsl ? { color: projectHsl } : undefined} />
        <span className="text-xs font-medium text-foreground truncate">{sprint.name}</span>
      </div>
      {/* Scope cards */}
      <div className="p-1.5 space-y-1">
        {sprint.scope_ids.map((scopeId) => {
          const lookupKey = sprint.project_id ? `${sprint.project_id}::${scopeId}` : String(scopeId);
          const scope = scopeLookup?.get(lookupKey);
          if (scope) {
            return <ScopeCard key={scopeKey(scope)} scope={scope} project={scope.project_id && projectLookup ? projectLookup.get(scope.project_id) : undefined} />;
          }
          const ss = sprint.scopes.find((s) => s.scope_id === scopeId);
          return (
            <div key={scopeId} className="rounded border border-muted-foreground/20 bg-card/50 px-2 py-1 text-xs text-muted-foreground">
              <span className="font-mono">{formatScopeId(scopeId)}</span>
              {ss && <span className="ml-2">{ss.title}</span>}
            </div>
          );
        })}
      </div>
      {/* Footer */}
      <div className="flex items-center justify-between border-t border-inherit px-2.5 py-1">
        <span className="text-[10px] text-muted-foreground">
          {totalScopes} scope{totalScopes !== 1 ? 's' : ''}
        </span>
        {pill && (() => {
          const PillIcon = pill.icon;
          return (
            <span className={cn('inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px]', pill.bg, pill.text)}>
              <PillIcon className="h-2.5 w-2.5" />
              {pill.label}
            </span>
          );
        })()}
      </div>
    </div>
  );
}
