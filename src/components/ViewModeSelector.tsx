import { Columns3, Rows3 } from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ViewMode, SwimGroupField } from '@/types';

interface ViewModeSelectorProps {
  viewMode: ViewMode;
  groupField: SwimGroupField;
  onViewModeChange: (mode: ViewMode) => void;
  onGroupFieldChange: (field: SwimGroupField) => void;
}

const VIEW_MODES: { value: ViewMode; label: string; Icon: typeof Columns3 }[] = [
  { value: 'kanban', label: 'Kanban', Icon: Columns3 },
  { value: 'swimlane', label: 'Swimlane', Icon: Rows3 },
];

const GROUP_FIELDS: { value: SwimGroupField; label: string }[] = [
  { value: 'priority', label: 'Priority' },
  { value: 'category', label: 'Category' },
  { value: 'tags', label: 'Tags' },
  { value: 'effort', label: 'Effort' },
  { value: 'dependencies', label: 'Dependencies' },
];

export function ViewModeSelector({
  viewMode,
  groupField,
  onViewModeChange,
  onGroupFieldChange,
}: ViewModeSelectorProps) {
  const ActiveIcon = viewMode === 'swimlane' ? Rows3 : Columns3;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 backdrop-blur-sm bg-white/[0.03] border-white/10"
          aria-label="Toggle view mode"
        >
          <ActiveIcon className="h-3 w-3" />
          Board
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="filter-popover-glass !bg-transparent w-44">
        {/* View mode selection */}
        <div className="space-y-0.5">
          <p className="px-2 pb-1 text-[10px] uppercase tracking-wider text-muted-foreground">View</p>
          {VIEW_MODES.map(({ value, label, Icon }) => (
            <button
              key={value}
              onClick={() => onViewModeChange(value)}
              className={cn(
                'flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs transition-colors',
                'hover:bg-white/[0.06]',
                viewMode === value && 'bg-white/[0.06]',
              )}
            >
              <span
                className={cn(
                  'flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border',
                  viewMode === value ? 'border-primary bg-primary' : 'border-white/15',
                )}
              >
                {viewMode === value && (
                  <span className="h-1.5 w-1.5 rounded-full bg-primary-foreground" />
                )}
              </span>
              <Icon className="h-3 w-3 text-muted-foreground" />
              <span className={cn(viewMode === value && 'text-foreground')}>{label}</span>
            </button>
          ))}
        </div>

        {/* Group-by field — only visible in swimlane mode */}
        {viewMode === 'swimlane' && (
          <>
            <div className="my-2 border-t border-white/[0.06]" />
            <div className="space-y-0.5">
              <p className="px-2 pb-1 text-[10px] uppercase tracking-wider text-muted-foreground">Group by</p>
              {GROUP_FIELDS.map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => onGroupFieldChange(value)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs transition-colors',
                    'hover:bg-white/[0.06]',
                    groupField === value && 'bg-white/[0.06]',
                  )}
                >
                  <span
                    className={cn(
                      'flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border',
                      groupField === value ? 'border-primary bg-primary' : 'border-white/15',
                    )}
                  >
                    {groupField === value && (
                      <span className="h-1.5 w-1.5 rounded-full bg-primary-foreground" />
                    )}
                  </span>
                  <span className={cn(groupField === value && 'text-foreground')}>{label}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
