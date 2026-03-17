import { useState, useMemo, useRef, useCallback } from 'react';
import { Terminal, X, AlertTriangle } from 'lucide-react';

// ─── Types ──────────────────────────────────────────────

interface SkillCommandBuilderProps {
  value: string | null;
  onChange: (value: string | null) => void;
  allowedPrefixes: string[];
}

interface TokenSegment {
  text: string;
  type: 'prefix' | 'arg' | 'placeholder';
}

// ─── Constants ──────────────────────────────────────────

const EXAMPLE_SCOPE_ID = '093';

const KNOWN_PREFIXES = ['/scope-', '/git-', '/test-', '/session-'];

// ─── Component ──────────────────────────────────────────

export function SkillCommandBuilder({ value, onChange, allowedPrefixes }: SkillCommandBuilderProps) {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const prefixes = allowedPrefixes.length > 0 ? allowedPrefixes : KNOWN_PREFIXES;

  const validation = useMemo(() => {
    if (!value) return null;
    const isAllowed = prefixes.some((p) => value.startsWith(p));
    if (!isAllowed) {
      return { valid: false, message: `Command must start with: ${prefixes.join(', ')}` };
    }
    return { valid: true, message: '' };
  }, [value, prefixes]);

  const preview = useMemo(() => {
    if (!value) return null;
    return value.replace('{id}', EXAMPLE_SCOPE_ID);
  }, [value]);

  const handleSuggestionClick = useCallback((prefix: string) => {
    onChange(prefix + '{id}');
    setShowSuggestions(false);
    inputRef.current?.focus();
  }, [onChange]);

  const handleClear = useCallback(() => {
    onChange(null);
    setShowSuggestions(false);
  }, [onChange]);

  // Syntax-highlighted segments
  const segments = useMemo(() => {
    if (!value) return [];
    const parts: TokenSegment[] = [];
    const matchedPrefix = prefixes.find((p) => value.startsWith(p));

    if (matchedPrefix) {
      parts.push({ text: matchedPrefix, type: 'prefix' });
      const rest = value.slice(matchedPrefix.length);
      tokenize(rest, parts);
    } else {
      tokenize(value, parts);
    }
    return parts;
  }, [value, prefixes]);

  return (
    <div className="space-y-2">
      {/* Input field */}
      <div className="relative">
        <div className="flex items-center rounded border border-zinc-700 bg-zinc-800 focus-within:border-zinc-500">
          <Terminal className="ml-2 h-3 w-3 shrink-0 text-zinc-600" />
          <input
            ref={inputRef}
            value={value ?? ''}
            onChange={(e) => onChange(e.target.value || null)}
            onFocus={() => !value && setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
            className="flex-1 bg-transparent px-2 py-1.5 font-mono text-xs text-zinc-200 outline-none placeholder:text-zinc-600"
            placeholder="/scope-implement {id}"
          />
          {value && (
            <button
              onClick={handleClear}
              className="mr-1 rounded p-0.5 text-zinc-600 hover:text-zinc-300"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        {/* Autocomplete suggestions */}
        {showSuggestions && !value && (
          <div className="absolute left-0 top-full z-10 mt-1 w-full rounded border border-zinc-700 bg-zinc-800 py-1 shadow-xl">
            {prefixes.map((prefix) => (
              <button
                key={prefix}
                onMouseDown={() => handleSuggestionClick(prefix)}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-zinc-700"
              >
                <span className="font-mono text-cyan-400">{prefix.trim()}</span>
                <span className="text-[9px] text-zinc-600">{'{id}'}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Syntax-highlighted preview */}
      {value && segments.length > 0 && (
        <div className="rounded border border-zinc-800 bg-zinc-950/70 px-2.5 py-1.5 font-mono text-xs">
          {segments.map((seg, i) => (
            <span
              key={i}
              style={{
                color: seg.type === 'prefix' ? '#60a5fa'
                  : seg.type === 'placeholder' ? '#facc15'
                  : '#e4e4e7',
              }}
            >
              {seg.text}
            </span>
          ))}
        </div>
      )}

      {/* Template preview */}
      {preview && (
        <div className="flex items-center gap-2">
          <span className="text-[9px] text-zinc-600">Preview:</span>
          <code className="text-[9px] font-mono text-zinc-400">{preview}</code>
        </div>
      )}

      {/* Validation warning */}
      {validation && !validation.valid && (
        <div className="flex items-center gap-1.5 text-[9px] text-amber-400">
          <AlertTriangle className="h-3 w-3 shrink-0" />
          {validation.message}
        </div>
      )}

      {/* Placeholder hint */}
      <p className="text-[9px] text-zinc-600">
        Use <code className="rounded bg-zinc-800 px-1 text-yellow-400">{'{id}'}</code> as the scope ID placeholder
      </p>
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────

function tokenize(text: string, parts: TokenSegment[]) {
  const regex = /\{id\}/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ text: text.slice(lastIndex, match.index), type: 'arg' });
    }
    parts.push({ text: '{id}', type: 'placeholder' });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push({ text: text.slice(lastIndex), type: 'arg' });
  }
}
