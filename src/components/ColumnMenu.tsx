import { MoreVertical, ChevronUp, ChevronDown, Eye, EyeOff } from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import type { SortField, SortDirection } from '@/hooks/useBoardSettings';

interface ColumnMenuProps {
  sortField: SortField;
  sortDirection: SortDirection;
  onSetSort: (field: SortField) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

const SORT_OPTIONS: { field: SortField; label: string }[] = [
  { field: 'id', label: 'Scope ID' },
  { field: 'priority', label: 'Priority' },
  { field: 'effort', label: 'Effort' },
  { field: 'updated_at', label: 'Last Updated' },
  { field: 'created_at', label: 'Created' },
  { field: 'title', label: 'Alphabetical' },
];

export function ColumnMenu({
  sortField,
  sortDirection,
  onSetSort,
  collapsed,
  onToggleCollapse,
}: ColumnMenuProps) {
  const Arrow = sortDirection === 'asc' ? ChevronUp : ChevronDown;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className="ml-1 flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-white/[0.06] hover:text-foreground"
          aria-label="Column options"
        >
          <MoreVertical className="h-3 w-3" />
        </button>
      </PopoverTrigger>

      <PopoverContent className="filter-popover-glass !bg-transparent w-44" align="end">
        {/* Sort options */}
        <div className="space-y-0.5">
          <p className="px-2 pb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Sort by
          </p>
          {SORT_OPTIONS.map((opt) => {
            const isActive = sortField === opt.field;
            return (
              <button
                key={opt.field}
                onClick={() => onSetSort(opt.field)}
                className={cn(
                  'flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs transition-colors',
                  'hover:bg-white/[0.06]',
                  isActive && 'bg-white/[0.06]',
                )}
              >
                {/* Radio indicator */}
                <span
                  className={cn(
                    'flex h-3 w-3 shrink-0 items-center justify-center rounded-full border',
                    isActive ? 'border-primary bg-primary' : 'border-white/15',
                  )}
                >
                  {isActive && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                </span>

                <span className={cn('flex-1 text-left', isActive && 'text-foreground')}>
                  {opt.label}
                </span>

                {isActive && <Arrow className="h-3 w-3 text-muted-foreground" />}
              </button>
            );
          })}
        </div>

        {/* Separator */}
        <div className="my-1.5 border-t border-white/10" />

        {/* Collapse toggle */}
        <button
          onClick={onToggleCollapse}
          className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs transition-colors hover:bg-white/[0.06]"
        >
          {collapsed ? (
            <Eye className="h-3 w-3 text-muted-foreground" />
          ) : (
            <EyeOff className="h-3 w-3 text-muted-foreground" />
          )}
          <span>{collapsed ? 'Expand column' : 'Collapse column'}</span>
        </button>
      </PopoverContent>
    </Popover>
  );
}
