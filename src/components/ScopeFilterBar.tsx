import { useState } from 'react';
import { ChevronRight, Filter } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { X } from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useTheme } from '@/hooks/useTheme';
import type { FilterField, ScopeFilterState } from '@/types';
import type { FilterOption } from '@/hooks/useScopeFilters';

interface ScopeFilterBarProps {
  filters: ScopeFilterState;
  optionsWithCounts: Record<FilterField, FilterOption[]>;
  onToggle: (field: FilterField, value: string) => void;
  onClearField: (field: FilterField) => void;
  onClearAll: () => void;
  hasActiveFilters: boolean;
}

const FILTER_SECTIONS: { field: FilterField; label: string }[] = [
  { field: 'priority', label: 'Priority' },
  { field: 'category', label: 'Category' },
  { field: 'tags', label: 'Tags' },
  { field: 'effort', label: 'Effort' },
  { field: 'dependencies', label: 'Dependencies' },
];

const FIELD_LABEL: Record<FilterField, string> = {
  priority: 'Priority',
  category: 'Category',
  tags: 'Tag',
  effort: 'Effort',
  dependencies: 'Dep',
};

const CATEGORY_COLOR: Record<string, string> = {
  feature:        '#536dfe',
  bugfix:         '#ff1744',
  refactor:       '#8B5CF6',
  infrastructure: '#40c4ff',
  docs:           '#6B7280',
};

const FIELD_COLORS: Record<string, string> = {
  priority: 'text-warning-amber',
  category: 'text-accent-blue',
  tags: 'text-info-cyan',
  effort: 'text-muted-foreground',
  dependencies: 'text-ask-red',
};

export function ScopeFilterBar({
  filters,
  optionsWithCounts,
  onToggle,
  onClearField,
  onClearAll,
  hasActiveFilters,
}: ScopeFilterBarProps) {
  const { neonGlass } = useTheme();
  const [openField, setOpenField] = useState<FilterField | null>(null);

  const totalActive = FILTER_SECTIONS.reduce((sum, { field }) => sum + filters[field].size, 0);

  // Group active values by field for the summary badges
  const activeFields: { field: FilterField; values: { value: string; label: string }[] }[] = [];
  for (const { field } of FILTER_SECTIONS) {
    if (filters[field].size === 0) continue;
    const values: { value: string; label: string }[] = [];
    for (const value of filters[field]) {
      const opt = optionsWithCounts[field].find((o) => o.value === value);
      values.push({ value, label: opt?.label ?? value });
    }
    activeFields.push({ field, values });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Popover onOpenChange={() => setOpenField(null)}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={cn(
              'gap-1.5 backdrop-blur-sm bg-white/[0.03] border-white/10',
              hasActiveFilters && 'border-white/20 text-foreground',
            )}
            aria-label="Filter scopes"
          >
            <Filter className="h-3 w-3" />
            Filters
            {totalActive > 0 && (
              <span className="ml-0.5 rounded-full bg-white/10 px-1.5 text-[10px]">
                {totalActive}
              </span>
            )}
          </Button>
        </PopoverTrigger>

        <PopoverContent align="start" className="filter-popover-glass !bg-transparent w-52">
          <div className="space-y-0.5">
            {FILTER_SECTIONS.map(({ field, label }) => {
              const options = optionsWithCounts[field];
              if (options.length === 0) return null;
              const isOpen = openField === field;
              const count = filters[field].size;

              return (
                <div key={field}>
                  {/* Accordion header */}
                  <button
                    onClick={() => setOpenField(isOpen ? null : field)}
                    className={cn(
                      'flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs transition-colors',
                      'hover:bg-white/[0.06]',
                      isOpen && 'bg-white/[0.06]',
                    )}
                  >
                    <ChevronRight className={cn(
                      'h-3 w-3 shrink-0 text-muted-foreground transition-transform duration-150',
                      isOpen && 'rotate-90',
                    )} />
                    <span className={cn(count > 0 && 'text-foreground')}>{label}</span>
                    {count > 0 && (
                      <span className="ml-auto rounded-full bg-white/10 px-1.5 text-[10px]">
                        {count}
                      </span>
                    )}
                  </button>

                  {/* Accordion body */}
                  {isOpen && (
                    <div className="ml-2 border-l border-white/[0.06] pl-2 mt-0.5 mb-1 space-y-0.5">
                      {options.map((opt) => {
                        const checked = filters[field].has(opt.value);
                        return (
                          <button
                            key={opt.value}
                            onClick={() => onToggle(field, opt.value)}
                            className={cn(
                              'flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs transition-colors',
                              'hover:bg-white/[0.06]',
                              checked && 'bg-white/[0.06]',
                            )}
                          >
                            <span
                              className={cn(
                                'flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border',
                                checked
                                  ? cn('border-primary bg-primary text-primary-foreground', FIELD_COLORS[field])
                                  : 'border-white/15',
                              )}
                            >
                              {checked && (
                                <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                              )}
                            </span>
                            <span className={cn('capitalize', checked && 'text-foreground')}>
                              {opt.label}
                            </span>
                            <span className="ml-auto text-[10px] text-muted-foreground">
                              {opt.count}
                            </span>
                          </button>
                        );
                      })}
                      {count > 0 && (
                        <button
                          onClick={() => onClearField(field)}
                          className="w-full rounded px-2 py-1 text-[10px] text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition-colors text-left"
                        >
                          Clear {label.toLowerCase()}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {hasActiveFilters && (
            <>
              <div className="my-2 border-t border-white/[0.06]" />
              <button
                onClick={onClearAll}
                className="w-full rounded px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition-colors text-center"
              >
                Clear all filters
              </button>
            </>
          )}
        </PopoverContent>
      </Popover>

      {/* Active filter summary badges */}
      {activeFields.map(({ field, values }) => (
        <div key={field} className="flex items-center gap-1">
          <span className="text-[10px] text-muted-foreground capitalize">{FIELD_LABEL[field]}:</span>
          {values.map(({ value, label }) => {
            const isCat = field === 'category';
            return (
              <Badge
                key={value}
                variant={isCat ? 'outline' : 'secondary'}
                className={cn(
                  'gap-0.5 capitalize cursor-pointer hover:bg-secondary/60 py-0 px-1 text-[10px] font-light',
                  neonGlass && !isCat && 'glass-pill',
                  neonGlass && isCat && 'bg-[rgba(var(--neon-blue),0.08)]',
                )}
                style={isCat ? { borderColor: CATEGORY_COLOR[value] } : undefined}
                onClick={() => onToggle(field, value)}
              >
                {label}
                <X className="h-2 w-2 opacity-60" />
              </Badge>
            );
          })}
        </div>
      ))}
    </div>
  );
}
