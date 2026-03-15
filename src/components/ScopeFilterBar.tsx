import { FilterChip } from './FilterChip';
import { SearchInput } from './SearchInput';
import { Badge } from '@/components/ui/badge';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTheme } from '@/hooks/useTheme';
import type { FilterField, ScopeFilterState } from '@/types';
import type { FilterOption } from '@/hooks/useScopeFilters';
import type { SearchMode } from '@/hooks/useSearch';

interface ScopeFilterBarProps {
  filters: ScopeFilterState;
  optionsWithCounts: Record<FilterField, FilterOption[]>;
  onToggle: (field: FilterField, value: string) => void;
  onClearField: (field: FilterField) => void;
  onClearAll: () => void;
  hasActiveFilters: boolean;
  searchQuery?: string;
  searchMode?: SearchMode;
  searchIsStale?: boolean;
  onSearchChange?: (query: string) => void;
  onSearchModeChange?: (mode: SearchMode) => void;
}

const CHIP_CONFIG: { field: FilterField; label: string; glowClass: string }[] = [
  { field: 'priority', label: 'Priority', glowClass: 'glow-amber' },
  { field: 'category', label: 'Category', glowClass: 'glow-blue' },
  { field: 'tags', label: 'Tags', glowClass: 'glow-blue' },
  { field: 'effort', label: 'Effort', glowClass: '' },
  { field: 'dependencies', label: 'Deps', glowClass: 'glow-red' },
];

const FIELD_LABEL: Record<FilterField, string> = {
  priority: 'Priority',
  category: 'Category',
  tags: 'Tag',
  effort: 'Effort',
  dependencies: 'Dep',
};

const CATEGORY_COLOR: Record<string, string> = {
  trading:    '#00c853',
  funding:    '#ffab00',
  blockchain: '#8B5CF6',
  security:   '#ff1744',
  frontend:   '#EC4899',
  platform:   '#536dfe',
  devex:      '#f97316',
};

export function ScopeFilterBar({
  filters,
  optionsWithCounts,
  onToggle,
  onClearField,
  onClearAll,
  hasActiveFilters,
  searchQuery = '',
  searchMode = 'filter',
  searchIsStale,
  onSearchChange,
  onSearchModeChange,
}: ScopeFilterBarProps) {
  const { neonGlass } = useTheme();

  // Group active values by field
  const activeFields: { field: FilterField; values: { value: string; label: string }[] }[] = [];
  for (const { field } of CHIP_CONFIG) {
    if (filters[field].size === 0) continue;
    const values: { value: string; label: string }[] = [];
    for (const value of filters[field]) {
      const opt = optionsWithCounts[field].find((o) => o.value === value);
      values.push({ value, label: opt?.label ?? value });
    }
    activeFields.push({ field, values });
  }

  return (
    <div className="mb-4 space-y-2">
      {/* Chip row */}
      <div className="flex flex-wrap items-center gap-2">
        {CHIP_CONFIG.map(({ field, label, glowClass }) => (
          <FilterChip
            key={field}
            field={field}
            label={label}
            options={optionsWithCounts[field]}
            selected={filters[field]}
            onToggle={onToggle}
            glowClass={glowClass}
          />
        ))}

        {hasActiveFilters && (
          <button
            onClick={onClearAll}
            className="ml-2 text-xxs text-muted-foreground hover:text-foreground transition-colors"
          >
            Clear all
          </button>
        )}

        {onSearchChange && onSearchModeChange && (
          <SearchInput
            query={searchQuery}
            mode={searchMode}
            isStale={searchIsStale}
            onQueryChange={onSearchChange}
            onModeChange={onSearchModeChange}
          />
        )}
      </div>

      {/* Active filter summary — field label + individual value badges + clear-field */}
      {activeFields.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
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
                      neonGlass && isCat && 'bg-[rgba(var(--neon-blue),0.08)]'
                    )}
                    style={isCat ? { borderColor: CATEGORY_COLOR[value] } : undefined}
                    onClick={() => onToggle(field, value)}
                  >
                    {label}
                    <X className="h-2 w-2 opacity-60" />
                  </Badge>
                );
              })}
              {values.length > 1 && (
                <button
                  onClick={() => onClearField(field)}
                  className="rounded p-0.5 text-muted-foreground hover:bg-surface-light hover:text-foreground"
                  aria-label={`Clear all ${FIELD_LABEL[field]} filters`}
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
