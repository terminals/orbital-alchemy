import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { Lightbulb, Sparkles, AlertTriangle, Undo2, X } from 'lucide-react';
import type { Scope, CardDisplayConfig, Project } from '@/types';
import { Card, CardContent } from '@/components/ui/card';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { cn, formatScopeId } from '@/lib/utils';
import { scopeKey } from '@/lib/scope-key';
import { useActiveDispatches } from '@/hooks/useActiveDispatches';
import { useWorkflow } from '@/hooks/useWorkflow';

interface ScopeCardProps {
  scope: Scope;
  onClick?: (scope: Scope) => void;
  isDragOverlay?: boolean;
  cardDisplay?: CardDisplayConfig;
  dimmed?: boolean;
  /** Project info for the project badge (multi-project mode) */
  project?: Project;
}

const PRIORITY_COLOR: Record<string, string> = {
  critical: 'border-ask-red text-ask-red',
  high:     'border-warning-amber text-warning-amber',
  medium:   'border-accent-blue text-accent-blue',
  low:      'border-muted-foreground/30 text-muted-foreground',
};

const CATEGORY_COLOR: Record<string, string> = {
  'feature':        'border-category-feature text-category-feature',
  'bugfix':         'border-category-bugfix text-category-bugfix',
  'refactor':       'border-category-refactor text-category-refactor',
  'infrastructure': 'border-category-infrastructure text-category-infrastructure',
  'docs':           'border-category-docs text-category-docs',
};

const CATEGORY_BORDER: Record<string, string> = {
  'feature':        'border-l-2 border-l-category-feature scope-cat-feature',
  'bugfix':         'border-l-2 border-l-category-bugfix scope-cat-bugfix',
  'refactor':       'border-l-2 border-l-category-refactor scope-cat-refactor',
  'infrastructure': 'border-l-2 border-l-category-infrastructure scope-cat-infrastructure',
  'docs':           'border-l-2 border-l-category-docs scope-cat-docs',
};

const GHOST = 'inline-block rounded border px-1.5 py-0 text-[10px] uppercase bg-transparent';

interface AbandonedPopoverProps {
  scopeId: number;
  projectId?: string;
  info: { from_status: string | null };
  onRecover: (scopeId: number, fromStatus: string, projectId?: string) => Promise<void>;
  onDismiss: (scopeId: number, projectId?: string) => Promise<void>;
}

function AbandonedPopover({ scopeId, projectId, info, onRecover, onDismiss }: AbandonedPopoverProps) {
  return (
    <Popover>
      <PopoverTrigger asChild onClick={(e) => e.stopPropagation()}>
        <button className="flex items-center gap-0.5 text-amber-500 hover:text-amber-400 transition-colors">
          <AlertTriangle className="h-3 w-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-56 p-3"
        side="top"
        align="end"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-xs text-muted-foreground mb-2">
          Session ended without completing work.
        </p>
        <div className="flex flex-col gap-1.5">
          {info.from_status && (
            <button
              className="flex items-center gap-1.5 text-xs px-2 py-1.5 rounded bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 transition-colors"
              onClick={() => onRecover(scopeId, info.from_status!, projectId)}
            >
              <Undo2 className="h-3 w-3" />
              Revert to {info.from_status}
            </button>
          )}
          <button
            className="flex items-center gap-1.5 text-xs px-2 py-1.5 rounded bg-muted text-muted-foreground hover:bg-muted/80 transition-colors"
            onClick={() => onDismiss(scopeId, projectId)}
          >
            <X className="h-3 w-3" />
            Keep here
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function abbreviateEffort(raw: string): string {
  const s = raw.toLowerCase().trim();
  const minMatch = s.match(/^~?(\d+)(?:\s*-\s*\d+)?\s*min/);
  if (minMatch) return `${minMatch[1]}M`;
  const hrMatch = s.match(/^~?(\d+(?:\.\d+)?)(?:\s*-\s*\d+(?:\.\d+)?)?\s*hour/);
  if (hrMatch) return `${hrMatch[1]}H`;
  const parenMatch = s.match(/\((\d+(?:\.\d+)?)(?:\s*-\s*\d+(?:\.\d+)?)?\s*(hour|min)/);
  if (parenMatch) return `${parenMatch[1]}${parenMatch[2].startsWith('h') ? 'H' : 'M'}`;
  if (s.includes('large') || s.includes('multi')) return 'LG';
  if (s.includes('medium') || s.includes('half')) return 'MD';
  if (s.includes('small')) return 'SM';
  if (s === 'tbd') return 'TBD';
  return 'TBD';
}

export function ScopeCard({ scope, onClick, isDragOverlay, cardDisplay, dimmed, project }: ScopeCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    isDragging,
  } = useDraggable({
    id: scopeKey(scope),
    disabled: isDragOverlay || dimmed,
  });

  const style = transform
    ? { transform: CSS.Translate.toString(transform) }
    : undefined;

  const { engine } = useWorkflow();
  const { activeScopes, abandonedScopes, recoverScope, dismissAbandoned } = useActiveDispatches();
  const entryPointId = engine.getEntryPoint().id;
  const isIdea = scope.status === entryPointId;
  const isGhost = isIdea && !!scope.is_ghost;
  const key = scopeKey(scope);
  const isDispatched = !isIdea && activeScopes.has(key);
  const abandonedInfo = !isIdea ? abandonedScopes.get(key) : undefined;
  const isAbandoned = !!abandonedInfo && !isDispatched;

  return (
    <Card
      ref={setNodeRef}
      style={{
        ...style,
        ...(!isGhost && !isIdea && project && cardDisplay?.project !== false ? { borderLeftWidth: '2px', borderLeftColor: `hsl(${project.color})` } : {}),
      }}
      className={cn(
        'scope-card cursor-grab transition-[colors,opacity] duration-200 hover:bg-surface-light active:cursor-grabbing',
        isGhost
          ? 'scope-card-ghost ghost-shimmer opacity-70'
          : isIdea
          ? 'border-l-2 border-dashed border-l-warning-amber/60'
          : !project && scope.category ? CATEGORY_BORDER[scope.category] : '',
        isDispatched && 'scope-card-dispatched',
        isAbandoned && 'scope-card-abandoned',
        isDragging && 'opacity-30',
        dimmed && !isDragging && 'opacity-30 cursor-default',
      )}
      onClick={() => {
        if (!isDragging) onClick?.(scope);
      }}
      {...attributes}
      {...listeners}
    >
      <CardContent className="px-2.5 py-1.5">
        {/* Header: ID/idea label + badges */}
        <div className="mb-1.5 flex items-center gap-1.5">
          {isGhost ? (
            <span className="flex items-center gap-1 text-xxs text-purple-400">
              <Sparkles className="h-3 w-3" />
              ai suggestion
            </span>
          ) : isIdea ? (
            <span className="flex items-center gap-1 text-xxs text-warning-amber">
              <Lightbulb className="h-3 w-3" />
              idea
            </span>
          ) : (
            <span className="font-mono text-xxs text-muted-foreground flex items-center gap-1">
              {isDispatched && <span className="h-1.5 w-1.5 rounded-full bg-pink-500 dispatch-pulse" />}
              {isAbandoned && <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />}
              {formatScopeId(scope.id)}
            </span>
          )}
          {!isIdea && (
            <div className="ml-auto flex items-center gap-1">
              {isAbandoned && (
                <AbandonedPopover
                  scopeId={scope.id}
                  projectId={scope.project_id}
                  info={abandonedInfo}
                  onRecover={recoverScope}
                  onDismiss={dismissAbandoned}
                />
              )}
              {scope.effort_estimate && cardDisplay?.effort !== false && (
                <span className={cn(GHOST, 'effort-ghost border-muted-foreground/30 text-muted-foreground')}>
                  {abbreviateEffort(scope.effort_estimate)}
                </span>
              )}
              {scope.category && cardDisplay?.category !== false && (
                <span className={cn(
                  GHOST,
                  CATEGORY_COLOR[scope.category] ?? 'border-muted-foreground/30 text-muted-foreground'
                )}>
                  {scope.category}
                </span>
              )}
              {scope.priority && cardDisplay?.priority !== false && (
                <span className={cn(
                  GHOST,
                  PRIORITY_COLOR[scope.priority] ?? 'border-muted-foreground/30 text-muted-foreground'
                )}>
                  {scope.priority}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Title */}
        <h3 className="text-xs font-light leading-snug line-clamp-2">
          {scope.title}
        </h3>

        {/* Tags (ideas don't have tags) */}
        {!isIdea && scope.tags.length > 0 && cardDisplay?.tags !== false && (
          <div className="mt-2 flex flex-wrap gap-1">
            {scope.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="glass-pill inline-block rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
              >
                {tag}
              </span>
            ))}
            {scope.tags.length > 3 && (
              <span className="text-[10px] text-muted-foreground">
                +{scope.tags.length - 3}
              </span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
