import { useRef, useEffect, useCallback } from 'react';
import { Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTheme } from '@/hooks/useTheme';
import type { SearchMode } from '@/hooks/useSearch';

interface SearchInputProps {
  query: string;
  mode: SearchMode;
  isStale?: boolean;
  onQueryChange: (query: string) => void;
  onModeChange: (mode: SearchMode) => void;
}

export function SearchInput({ query, mode, isStale, onQueryChange, onModeChange }: SearchInputProps) {
  const { neonGlass } = useTheme();
  const inputRef = useRef<HTMLInputElement>(null);

  // Global `/` shortcut to focus search
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === '/' && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (query) {
        onQueryChange('');
      } else {
        inputRef.current?.blur();
      }
    }
  }, [query, onQueryChange]);

  return (
    <div className="flex items-center gap-1.5 ml-auto" role="search" aria-label="Search scopes">
      {/* Search input */}
      <div className={cn(
        'flex items-center gap-1.5 rounded-md border px-2 py-1 backdrop-blur-sm bg-white/[0.03] border-white/10 transition-colors',
        'focus-within:border-white/20',
        neonGlass && 'focus-within:glow-blue',
      )}>
        <Search className={cn('h-3 w-3 shrink-0 text-muted-foreground', isStale && 'animate-pulse')} />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => onQueryChange(e.target.value.slice(0, 100))}
          onKeyDown={handleKeyDown}
          placeholder="Search scopes..."
          className="w-32 bg-transparent text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
          aria-label="Search scopes"
        />
        {query && (
          <button
            onClick={() => onQueryChange('')}
            className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Clear search"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* Mode toggle */}
      <div className={cn(
        'flex rounded-md border backdrop-blur-sm bg-white/[0.03] border-white/10 overflow-hidden',
      )}>
        <button
          onClick={() => onModeChange('filter')}
          className={cn(
            'px-2 py-1 text-[10px] transition-colors',
            mode === 'filter'
              ? 'bg-white/10 text-foreground'
              : 'text-muted-foreground hover:text-foreground hover:bg-white/[0.04]',
          )}
          aria-pressed={mode === 'filter'}
        >
          Filter
        </button>
        <button
          onClick={() => onModeChange('highlight')}
          className={cn(
            'px-2 py-1 text-[10px] transition-colors',
            mode === 'highlight'
              ? 'bg-white/10 text-foreground'
              : 'text-muted-foreground hover:text-foreground hover:bg-white/[0.04]',
          )}
          aria-pressed={mode === 'highlight'}
        >
          Highlight
        </button>
      </div>
    </div>
  );
}
