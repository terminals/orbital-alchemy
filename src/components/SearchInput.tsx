import { useState, useRef, useEffect, useCallback } from 'react';
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
  const containerRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(!!query);

  // Collapse when query is empty and focus leaves the component
  const handleBlur = useCallback(() => {
    requestAnimationFrame(() => {
      if (!containerRef.current?.contains(document.activeElement) && !query) {
        setExpanded(false);
      }
    });
  }, [query]);

  // Global `/` shortcut to focus search
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === '/' && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        setExpanded(true);
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Auto-focus input when expanding (slight delay lets the width transition start)
  useEffect(() => {
    if (expanded) {
      const t = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [expanded]);

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
    <div
      ref={containerRef}
      className={cn(
        'flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs',
        'backdrop-blur-sm bg-white/[0.03] border-white/10',
        'transition-all duration-200 ease-out',
        expanded
          ? 'focus-within:border-white/20'
          : 'cursor-pointer hover:bg-white/[0.06]',
        neonGlass && expanded && 'focus-within:glow-blue',
      )}
      role="search"
      aria-label="Search scopes"
      onClick={!expanded ? () => setExpanded(true) : undefined}
      onBlur={expanded ? handleBlur : undefined}
    >
      <Search className={cn('h-3 w-3 shrink-0 text-muted-foreground', isStale && 'animate-pulse')} />

      {/* "Search" label — visible when collapsed, crossfades out */}
      <span
        className={cn(
          'text-xs font-medium whitespace-nowrap overflow-hidden transition-all duration-200 ease-out',
          expanded ? 'w-0 opacity-0' : 'w-10 opacity-100',
        )}
      >
        Search
      </span>

      {/* Input — expands width smoothly */}
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => onQueryChange(e.target.value.slice(0, 100))}
        onKeyDown={handleKeyDown}
        placeholder="Search scopes..."
        className={cn(
          'min-w-0 overflow-hidden bg-transparent text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none',
          'transition-all duration-200 ease-out',
          expanded ? 'w-48 opacity-100' : 'w-0 opacity-0',
        )}
        tabIndex={expanded ? 0 : -1}
        aria-label="Search scopes"
      />

      {/* Clear button — pops in when query exists */}
      {expanded && query && (
        <button
          onClick={() => { onQueryChange(''); inputRef.current?.focus(); }}
          className="shrink-0 text-muted-foreground hover:text-foreground transition-colors animate-in fade-in zoom-in-75 duration-150"
          aria-label="Clear search"
        >
          <X className="h-3 w-3" />
        </button>
      )}

      {/* Mode toggle — slides in from collapsed */}
      <div
        className={cn(
          'flex shrink-0 overflow-hidden -my-1 -mr-2 rounded-r-md',
          'transition-all duration-200 ease-out',
          expanded
            ? 'max-w-[150px] opacity-100 border-l border-white/10'
            : 'max-w-0 opacity-0 border-l border-transparent',
        )}
      >
        <button
          onClick={() => onModeChange('filter')}
          className={cn(
            'px-2 py-1 text-[10px] whitespace-nowrap transition-colors',
            mode === 'filter'
              ? 'bg-white/10 text-foreground'
              : 'text-muted-foreground hover:text-foreground hover:bg-white/[0.04]',
          )}
          tabIndex={expanded ? 0 : -1}
          aria-pressed={mode === 'filter'}
        >
          Filter
        </button>
        <button
          onClick={() => onModeChange('highlight')}
          className={cn(
            'px-2 py-1 text-[10px] whitespace-nowrap transition-colors',
            mode === 'highlight'
              ? 'bg-white/10 text-foreground'
              : 'text-muted-foreground hover:text-foreground hover:bg-white/[0.04]',
          )}
          tabIndex={expanded ? 0 : -1}
          aria-pressed={mode === 'highlight'}
        >
          Highlight
        </button>
      </div>
    </div>
  );
}
