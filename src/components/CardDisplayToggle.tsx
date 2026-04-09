import { SlidersHorizontal } from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { CardDisplayConfig } from '@/types';

interface CardDisplayToggleProps {
  display: CardDisplayConfig;
  onToggle: (field: keyof CardDisplayConfig) => void;
  hiddenCount: number;
}

const FIELDS: { key: keyof CardDisplayConfig; label: string }[] = [
  { key: 'effort', label: 'Effort' },
  { key: 'category', label: 'Category' },
  { key: 'priority', label: 'Priority' },
  { key: 'tags', label: 'Tags' },
  { key: 'project', label: 'Project colors' },
];

export function CardDisplayToggle({ display, onToggle, hiddenCount }: CardDisplayToggleProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 backdrop-blur-sm bg-white/[0.03] border-white/10"
          aria-label="Toggle card display"
        >
          <SlidersHorizontal className="h-3 w-3" />
          Cards
          {hiddenCount > 0 && (
            <span className="ml-0.5 rounded-full bg-white/10 px-1.5 text-[10px]">
              {hiddenCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="filter-popover-glass !bg-transparent w-40">
        <div className="space-y-0.5">
          {FIELDS.map(({ key, label }) => {
            const checked = display[key];
            return (
              <button
                key={key}
                onClick={() => onToggle(key)}
                className={cn(
                  'flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs transition-colors',
                  'hover:bg-white/[0.06]',
                  checked && 'bg-white/[0.06]',
                )}
              >
                <span
                  className={cn(
                    'flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border',
                    checked ? 'border-primary bg-primary text-primary-foreground' : 'border-white/15',
                  )}
                >
                  {checked && (
                    <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </span>
                <span className={cn('capitalize', checked && 'text-foreground')}>{label}</span>
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
