import { ChevronDown } from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useTheme } from '@/hooks/useTheme';
import type { FilterField } from '@/types';
import type { FilterOption } from '@/hooks/useScopeFilters';

interface FilterChipProps {
  field: FilterField;
  label: string;
  options: FilterOption[];
  selected: Set<string>;
  onToggle: (field: FilterField, value: string) => void;
  glowClass?: string;
}

const FIELD_COLORS: Record<string, string> = {
  priority: 'text-warning-amber',
  category: 'text-accent-blue',
  tags: 'text-info-cyan',
  effort: 'text-muted-foreground',
  dependencies: 'text-ask-red',
};

export function FilterChip({
  field,
  label,
  options,
  selected,
  onToggle,
  glowClass,
}: FilterChipProps) {
  const { neonGlass } = useTheme();
  const isActive = selected.size > 0;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            'gap-1.5 capitalize backdrop-blur-sm bg-white/[0.03] border-white/10',
            isActive && 'border-white/20 text-foreground',
            isActive && neonGlass && glowClass
          )}
        >
          {label}
          {isActive && (
            <span className="ml-0.5 rounded-full bg-white/10 px-1.5 text-[10px]">
              {selected.size}
            </span>
          )}
          <ChevronDown className="h-3 w-3 opacity-50" />
        </Button>
      </PopoverTrigger>

      <PopoverContent className="filter-popover-glass !bg-transparent">
        <div className="space-y-0.5">
          {options.map((opt) => {
            const checked = selected.has(opt.value);
            return (
              <button
                key={opt.value}
                onClick={() => onToggle(field, opt.value)}
                className={cn(
                  'flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs transition-colors',
                  'hover:bg-white/[0.06]',
                  checked && 'bg-white/[0.06]'
                )}
              >
                {/* Checkbox indicator */}
                <span
                  className={cn(
                    'flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border',
                    checked
                      ? cn('border-primary bg-primary text-primary-foreground', FIELD_COLORS[field])
                      : 'border-white/15'
                  )}
                >
                  {checked && (
                    <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </span>

                {/* Label */}
                <span className={cn('capitalize', checked && 'text-foreground')}>
                  {opt.label}
                </span>

                {/* Count */}
                <span className="ml-auto text-[10px] text-muted-foreground">
                  {opt.count}
                </span>
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
