import { useState } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { useProjects } from '@/hooks/useProjectContext';
import { cn } from '@/lib/utils';

interface ProjectSelectorPillProps {
  projectId?: string;
  disabled?: boolean;
  onProjectChange?: (newProjectId: string) => void;
  className?: string;
}

/**
 * Small pill showing the current project with a color dot.
 * When clickable, opens a dropdown to change the project assignment.
 * Only renders in multi-project mode when projectId is provided.
 */
export function ProjectSelectorPill({ projectId, disabled, onProjectChange, className }: ProjectSelectorPillProps) {
  const { projects, hasMultipleProjects, getProjectColor, getProjectName } = useProjects();
  const [open, setOpen] = useState(false);

  if (!hasMultipleProjects || !projectId) return null;

  const color = getProjectColor(projectId);
  const name = getProjectName(projectId);
  const enabledProjects = projects.filter(p => p.enabled);

  return (
    <Popover open={open && !disabled} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          disabled={disabled}
          className={cn(
            'inline-flex items-center gap-1 rounded-full px-1.5 py-0 text-[10px] leading-[16px] transition-all duration-200',
            disabled
              ? 'opacity-50 cursor-default'
              : 'cursor-pointer hover:bg-accent/50',
            className,
          )}
          style={{
            borderColor: `hsl(${color} / 0.4)`,
            color: `hsl(${color})`,
            borderWidth: '1px',
            borderStyle: 'solid',
          }}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <span
            className="h-1.5 w-1.5 rounded-full shrink-0 transition-all duration-200"
            style={{ backgroundColor: `hsl(${color})` }}
          />
          <span className="truncate max-w-[60px]">{name}</span>
          {!disabled && <ChevronDown className="h-2.5 w-2.5 shrink-0 opacity-60" />}
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-44 p-1"
        align="start"
        side="top"
        sideOffset={6}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="max-h-48 overflow-y-auto">
          {enabledProjects.map(p => {
            const isActive = p.id === projectId;
            return (
              <button
                key={p.id}
                className={cn(
                  'flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs transition-colors',
                  isActive ? 'bg-accent' : 'hover:bg-accent/50',
                )}
                onClick={() => {
                  if (!isActive && onProjectChange) onProjectChange(p.id);
                  setOpen(false);
                }}
              >
                <span
                  className="h-2 w-2 rounded-full shrink-0"
                  style={{ backgroundColor: `hsl(${p.color})` }}
                />
                <span className="truncate flex-1 text-left">{p.name}</span>
                {isActive && <Check className="h-3 w-3 shrink-0 text-muted-foreground" />}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
