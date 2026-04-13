import { useEffect, useRef, useState } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { Lightbulb, Sparkles, Star, AlertTriangle, Undo2, X } from 'lucide-react';
import type { Scope, CardDisplayConfig, Project } from '@/types';
import { Card, CardContent } from '@/components/ui/card';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { cn, formatScopeId } from '@/lib/utils';
import { scopeKey } from '@/lib/scope-key';
import { useActiveDispatches } from '@/hooks/useActiveDispatches';
import { useWorkflow } from '@/hooks/useWorkflow';
import { useProjectUrl } from '@/hooks/useProjectUrl';

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
        <button type="button" className="flex items-center gap-0.5 text-amber-500 hover:text-amber-400 transition-colors">
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
              type="button"
              className="flex items-center gap-1.5 text-xs px-2 py-1.5 rounded bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 transition-colors"
              onClick={() => onRecover(scopeId, info.from_status!, projectId)}
            >
              <Undo2 className="h-3 w-3" />
              Revert to {info.from_status}
            </button>
          )}
          <button
            type="button"
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
  const buildUrl = useProjectUrl();
  const entryPointId = engine.getEntryPoint().id;
  const isIdea = scope.status === entryPointId;
  const isGhost = isIdea && !!scope.is_ghost;
  const key = scopeKey(scope);
  const isDispatched = !isIdea && activeScopes.has(key);
  const abandonedInfo = !isIdea ? abandonedScopes.get(key) : undefined;
  const isAbandoned = !!abandonedInfo && !isDispatched;

  // JS-driven dispatch border animation — real DOM element instead of ::before
  // because browsers don't repaint pseudo-elements when inherited custom props change,
  // and Arc doesn't support @property for CSS-only animation.
  const borderRef = useRef<HTMLDivElement | null>(null);

  const [isNeon, setIsNeon] = useState(
    () => document.documentElement.getAttribute('data-theme') === 'neon-glass'
  );

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsNeon(document.documentElement.getAttribute('data-theme') === 'neon-glass');
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isDispatched || !borderRef.current) return;
    let angle = 0;
    let raf: number;
    const el = borderRef.current;
    const gradient = isNeon
      ? (a: number) => `conic-gradient(from ${a}deg, transparent 0%, rgba(var(--neon-pink), 0.9) 8%, rgba(var(--neon-pink), 0.5) 16%, rgba(var(--neon-cyan), 0.15) 24%, transparent 32%)`
      : (a: number) => `conic-gradient(from ${a}deg, transparent 0%, rgba(233,30,99,0.7) 10%, rgba(233,30,99,0.3) 20%, transparent 30%)`;
    const tick = () => {
      angle = (angle + 1.5) % 360;
      el.style.background = gradient(angle);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isDispatched, isNeon]);

  return (
    <Card
      ref={setNodeRef}
      data-tour="scope-card"
      style={{
        ...style,
        ...(!isGhost && !isIdea && project && cardDisplay?.project !== false ? { '--project-color': `hsl(${project.color})` } as React.CSSProperties : {}),
      }}
      className={cn(
        'scope-card group/scope-card cursor-grab transition-[colors,opacity] duration-200 hover:bg-surface-light active:cursor-grabbing',
        isGhost
          ? 'scope-card-ghost ghost-shimmer opacity-70'
          : isIdea
          ? 'border-l-2 border-dashed border-l-warning-amber/60'
          : '',
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
      {isDispatched && (
        <div
          ref={borderRef}
          className="dispatch-border-overlay"
        />
      )}
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
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  fetch(buildUrl(`/scopes/${scope.id}`), {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ favourite: !scope.favourite }),
                  });
                }}
                className={cn(
                  'inline-flex items-center justify-center h-3.5 w-3.5 transition-all duration-150',
                  scope.favourite
                    ? 'text-primary opacity-100'
                    : 'text-muted-foreground/40 opacity-0 group-hover/scope-card:opacity-100 hover:text-primary/70'
                )}
                aria-label={scope.favourite ? 'Remove from favourites' : 'Add to favourites'}
              >
                <Star className={cn('h-3 w-3', scope.favourite && 'fill-current')} />
              </button>
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
