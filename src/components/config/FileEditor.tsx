import { useEffect, useCallback, useRef, useMemo } from 'react';
import { Save, FileText, AlertCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ConfigPrimitiveType } from '@/types';

interface FileEditorProps {
  type: ConfigPrimitiveType | null;
  filePath: string | null;
  content: string;
  setContent: (value: string) => void;
  frontmatter: Record<string, string>;
  setFrontmatterField: (key: string, value: string) => void;
  body: string;
  setBody: (value: string) => void;
  dirty: boolean;
  saving: boolean;
  loading: boolean;
  error: string | null;
  onSave: () => Promise<void>;
}

export function FileEditor({
  filePath,
  content: _content,
  setContent: _setContent,
  frontmatter,
  setFrontmatterField,
  body,
  setBody,
  dirty,
  saving,
  loading,
  error,
  onSave,
}: FileEditorProps) {
  // Cmd+S / Ctrl+S save handler
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        if (dirty && !saving) onSave();
      }
    },
    [dirty, saving, onSave],
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Empty state
  if (!filePath) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-center">
          <FileText className="h-10 w-10 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground/60">
            Select a file to edit
          </p>
        </div>
      </div>
    );
  }

  // Loading state
  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  const frontmatterKeys = Object.keys(frontmatter);
  const hasFrontmatter = frontmatterKeys.length > 0;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex items-center gap-2 min-w-0">
          <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate text-xs text-foreground">{filePath}</span>
          {dirty && (
            <Badge variant="warning" className="shrink-0 text-[10px] px-1 py-0">
              unsaved
            </Badge>
          )}
        </div>
        <Button
          variant="default"
          size="sm"
          disabled={!dirty || saving}
          onClick={onSave}
          className="shrink-0"
        >
          <Save className="mr-1.5 h-3.5 w-3.5" />
          {saving ? 'Saving...' : 'Save'}
        </Button>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 border-b border-red-500/20 bg-red-500/10 px-3 py-1.5 text-xs text-ask-red">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Frontmatter form */}
      {hasFrontmatter && (
        <div className="space-y-2 border-b border-border px-3 py-3">
          <div className="flex items-center gap-2">
            <span className="text-xxs font-medium uppercase tracking-wider text-muted-foreground">
              Frontmatter
            </span>
            <div className="h-px flex-1 bg-border" />
          </div>
          <div className="grid gap-2">
            {frontmatterKeys.map((key) => (
              <div key={key} className="flex items-center gap-2">
                <label className="w-28 shrink-0 text-right text-xxs text-muted-foreground">
                  {key}
                </label>
                <input
                  value={frontmatter[key] ?? ''}
                  onChange={(e) => setFrontmatterField(key, e.target.value)}
                  className={cn(
                    'flex-1 rounded border border-border bg-surface px-2 py-1 text-xs text-foreground',
                    'outline-none focus:border-accent-blue/50 transition-colors',
                  )}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Body editor — fills remaining height */}
      <div className="flex flex-1 flex-col min-h-0 p-3">
        {hasFrontmatter && (
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xxs font-medium uppercase tracking-wider text-muted-foreground">
              Content
            </span>
            <div className="h-px flex-1 bg-border" />
          </div>
        )}
        <MonoEditor value={body} onChange={setBody} filePath={filePath} />
      </div>
    </div>
  );
}

const MONO_FONT = "'JetBrains Mono', 'SF Mono', 'Fira Code', monospace";

// ─── Syntax Highlighting ─────────────────────────────────

type Lang = 'shell' | 'markdown' | 'yaml' | 'json' | 'text';

function detectLang(filePath: string | null): Lang {
  if (!filePath) return 'text';
  if (filePath.endsWith('.sh')) return 'shell';
  if (filePath.endsWith('.md')) return 'markdown';
  if (filePath.endsWith('.yml') || filePath.endsWith('.yaml')) return 'yaml';
  if (filePath.endsWith('.json') || filePath.endsWith('.jsonc')) return 'json';
  return 'text';
}

// Token colors — neon glass palette
const TC = {
  comment:  '#6B7280',  // muted gray
  keyword:  '#e91e63',  // neon pink
  string:   '#00c853',  // neon green
  number:   '#ffab00',  // amber
  variable: '#40c4ff',  // cyan
  heading:  '#00bcd4',  // neon cyan
  bold:     '#e0e0e0',  // bright foreground
  italic:   '#b0b0b0',  // slightly dimmer
  operator: '#e91e63',  // pink
  key:      '#40c4ff',  // cyan
  builtin:  '#536dfe',  // indigo
  link:     '#8B5CF6',  // purple
  punctuation: '#6B7280',
} as const;

interface Token { text: string; color?: string; bold?: boolean; italic?: boolean }

function highlightLine(line: string, lang: Lang): Token[] {
  if (lang === 'text') return [{ text: line }];
  if (lang === 'shell') return highlightShell(line);
  if (lang === 'markdown') return highlightMarkdown(line);
  if (lang === 'yaml') return highlightYaml(line);
  if (lang === 'json') return highlightJson(line);
  return [{ text: line }];
}

const SHELL_KEYWORDS = new Set([
  'if', 'then', 'else', 'elif', 'fi', 'for', 'in', 'do', 'done', 'while', 'until',
  'case', 'esac', 'function', 'return', 'exit', 'local', 'export', 'readonly',
  'source', 'set', 'unset', 'shift', 'break', 'continue', 'true', 'false',
]);

function highlightShell(line: string): Token[] {
  const tokens: Token[] = [];
  // Full-line comment
  const trimmed = line.trimStart();
  if (trimmed.startsWith('#')) {
    return [{ text: line, color: TC.comment, italic: true }];
  }

  let i = 0;
  while (i < line.length) {
    // Inline comment (preceded by whitespace)
    if (line[i] === '#' && (i === 0 || /\s/.test(line[i - 1]))) {
      tokens.push({ text: line.slice(i), color: TC.comment, italic: true });
      break;
    }
    // Double-quoted string
    if (line[i] === '"') {
      const end = findClosingQuote(line, i, '"');
      tokens.push({ text: line.slice(i, end), color: TC.string });
      i = end;
      continue;
    }
    // Single-quoted string
    if (line[i] === "'") {
      const end = findClosingQuote(line, i, "'");
      tokens.push({ text: line.slice(i, end), color: TC.string });
      i = end;
      continue;
    }
    // Variable $VAR or ${VAR}
    if (line[i] === '$') {
      if (line[i + 1] === '{') {
        const close = line.indexOf('}', i + 2);
        const end = close === -1 ? line.length : close + 1;
        tokens.push({ text: line.slice(i, end), color: TC.variable });
        i = end;
      } else if (line[i + 1] === '(') {
        tokens.push({ text: '$(', color: TC.variable });
        i += 2;
      } else {
        const m = line.slice(i).match(/^\$[A-Za-z_]\w*/);
        if (m) {
          tokens.push({ text: m[0], color: TC.variable });
          i += m[0].length;
        } else {
          tokens.push({ text: '$', color: TC.variable });
          i++;
        }
      }
      continue;
    }
    // Operators
    if ('|&;><'.includes(line[i])) {
      let op = line[i];
      if (i + 1 < line.length && (line.slice(i, i + 2) === '||' || line.slice(i, i + 2) === '&&' || line.slice(i, i + 2) === '>>' || line.slice(i, i + 2) === '<<')) {
        op = line.slice(i, i + 2);
      }
      tokens.push({ text: op, color: TC.operator });
      i += op.length;
      continue;
    }
    // Word (keyword or plain)
    const wordMatch = line.slice(i).match(/^[A-Za-z_]\w*/);
    if (wordMatch) {
      const w = wordMatch[0];
      if (SHELL_KEYWORDS.has(w)) {
        tokens.push({ text: w, color: TC.keyword, bold: true });
      } else {
        tokens.push({ text: w });
      }
      i += w.length;
      continue;
    }
    // Number
    const numMatch = line.slice(i).match(/^\d+/);
    if (numMatch) {
      tokens.push({ text: numMatch[0], color: TC.number });
      i += numMatch[0].length;
      continue;
    }
    // Default: single char
    tokens.push({ text: line[i] });
    i++;
  }
  return tokens;
}

function highlightMarkdown(line: string): Token[] {
  const trimmed = line.trimStart();
  // Heading
  const headingMatch = trimmed.match(/^(#{1,6})\s/);
  if (headingMatch) {
    return [{ text: line, color: TC.heading, bold: true }];
  }
  // Code block fence
  if (trimmed.startsWith('```')) {
    return [{ text: line, color: TC.builtin }];
  }
  // HTML comment
  if (trimmed.startsWith('<!--')) {
    return [{ text: line, color: TC.comment, italic: true }];
  }
  // List item
  if (/^(\s*[-*+]|\s*\d+\.)\s/.test(line)) {
    const m = line.match(/^(\s*[-*+\d.]+\s)(.*)$/);
    if (m) {
      return [
        { text: m[1], color: TC.operator },
        ...highlightMarkdownInline(m[2]),
      ];
    }
  }
  return highlightMarkdownInline(line);
}

function highlightMarkdownInline(line: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < line.length) {
    // Inline code
    if (line[i] === '`') {
      const end = line.indexOf('`', i + 1);
      if (end !== -1) {
        tokens.push({ text: line.slice(i, end + 1), color: TC.builtin });
        i = end + 1;
        continue;
      }
    }
    // Bold **text**
    if (line.slice(i, i + 2) === '**') {
      const end = line.indexOf('**', i + 2);
      if (end !== -1) {
        tokens.push({ text: line.slice(i, end + 2), color: TC.bold, bold: true });
        i = end + 2;
        continue;
      }
    }
    // Link [text](url)
    if (line[i] === '[') {
      const m = line.slice(i).match(/^\[([^\]]*)\]\(([^)]*)\)/);
      if (m) {
        tokens.push({ text: `[${m[1]}]`, color: TC.heading });
        tokens.push({ text: `(${m[2]})`, color: TC.link });
        i += m[0].length;
        continue;
      }
    }
    tokens.push({ text: line[i] });
    i++;
  }
  return tokens;
}

function highlightYaml(line: string): Token[] {
  const trimmed = line.trimStart();
  if (trimmed.startsWith('#')) {
    return [{ text: line, color: TC.comment, italic: true }];
  }
  // Key: value
  const kvMatch = line.match(/^(\s*)([\w.-]+)(:)(.*)/);
  if (kvMatch) {
    const tokens: Token[] = [
      { text: kvMatch[1] },
      { text: kvMatch[2], color: TC.key },
      { text: kvMatch[3], color: TC.punctuation },
    ];
    const val = kvMatch[4];
    if (val) tokens.push(...highlightYamlValue(val));
    return tokens;
  }
  // List item
  if (/^\s*-\s/.test(line)) {
    const m = line.match(/^(\s*-\s)(.*)/);
    if (m) {
      return [{ text: m[1], color: TC.operator }, ...highlightYamlValue(m[2])];
    }
  }
  return [{ text: line }];
}

function highlightYamlValue(val: string): Token[] {
  const trimmed = val.trim();
  if (!trimmed) return [{ text: val }];
  if (/^["']/.test(trimmed)) return [{ text: val, color: TC.string }];
  if (/^(true|false|null|yes|no)$/i.test(trimmed)) return [{ text: val, color: TC.keyword }];
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return [{ text: val, color: TC.number }];
  if (trimmed.startsWith('#')) return [{ text: val, color: TC.comment, italic: true }];
  // Check for inline comment after value
  const commentIdx = val.indexOf(' #');
  if (commentIdx !== -1) {
    return [
      { text: val.slice(0, commentIdx) },
      { text: val.slice(commentIdx), color: TC.comment, italic: true },
    ];
  }
  return [{ text: val, color: TC.string }];
}

function highlightJson(line: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < line.length) {
    // String (key or value)
    if (line[i] === '"') {
      const end = findClosingQuote(line, i, '"');
      const str = line.slice(i, end);
      // Check if this is a key (followed by :)
      const after = line.slice(end).trimStart();
      const color = after.startsWith(':') ? TC.key : TC.string;
      tokens.push({ text: str, color });
      i = end;
      continue;
    }
    // Numbers
    const numMatch = line.slice(i).match(/^-?\d+(\.\d+)?([eE][+-]?\d+)?/);
    if (numMatch) {
      tokens.push({ text: numMatch[0], color: TC.number });
      i += numMatch[0].length;
      continue;
    }
    // Booleans and null
    const kwMatch = line.slice(i).match(/^(true|false|null)\b/);
    if (kwMatch) {
      tokens.push({ text: kwMatch[0], color: TC.keyword });
      i += kwMatch[0].length;
      continue;
    }
    // Punctuation
    if ('{}[]:,'.includes(line[i])) {
      tokens.push({ text: line[i], color: TC.punctuation });
      i++;
      continue;
    }
    tokens.push({ text: line[i] });
    i++;
  }
  return tokens;
}

function findClosingQuote(line: string, start: number, quote: string): number {
  let i = start + 1;
  while (i < line.length) {
    if (line[i] === '\\') { i += 2; continue; }
    if (line[i] === quote) return i + 1;
    i++;
  }
  return line.length;
}

// ─── MonoEditor with syntax highlighting ─────────────────

function MonoEditor({ value, onChange, filePath }: { value: string; onChange: (v: string) => void; filePath: string | null }) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);
  const highlightRef = useRef<HTMLPreElement>(null);

  const lang = useMemo(() => detectLang(filePath), [filePath]);
  const lines = useMemo(() => value.split('\n'), [value]);

  const highlighted = useMemo(
    () => lines.map(line => highlightLine(line, lang)),
    [lines, lang],
  );

  const syncScroll = useCallback(() => {
    const ta = textareaRef.current;
    if (gutterRef.current) gutterRef.current.scrollTop = ta?.scrollTop ?? 0;
    if (highlightRef.current) {
      highlightRef.current.scrollTop = ta?.scrollTop ?? 0;
      highlightRef.current.scrollLeft = ta?.scrollLeft ?? 0;
    }
  }, []);

  const editorStyle = {
    fontFamily: MONO_FONT,
    fontSize: '12px',
    lineHeight: '1.625',
    padding: '12px',
    tabSize: 2,
  } as const;

  return (
    <div
      className="flex flex-1 overflow-hidden rounded border border-border bg-surface transition-colors focus-within:border-accent-blue/50"
      style={{ fontFamily: MONO_FONT }}
    >
      {/* Line numbers */}
      <div
        ref={gutterRef}
        aria-hidden
        className="select-none overflow-hidden border-r border-border py-3 pl-2 pr-3 text-right text-muted-foreground/40"
        style={{ fontSize: '12px', lineHeight: '1.625' }}
      >
        {lines.map((_, i) => (
          <div key={i}>{i + 1}</div>
        ))}
      </div>

      {/* Editor area — overlay pattern */}
      <div className="relative flex-1 min-w-0 overflow-hidden">
        {/* Highlighted layer (behind) */}
        <pre
          ref={highlightRef}
          aria-hidden
          className="absolute inset-0 overflow-hidden whitespace-pre pointer-events-none m-0"
          style={editorStyle}
        >
          {highlighted.map((tokens, lineIdx) => (
            <div key={lineIdx}>
              {tokens.length === 0 ? ' ' : tokens.map((t, tIdx) => (
                <span
                  key={tIdx}
                  style={{
                    color: t.color,
                    fontWeight: t.bold ? 600 : undefined,
                    fontStyle: t.italic ? 'italic' : undefined,
                  }}
                >
                  {t.text}
                </span>
              ))}
            </div>
          ))}
        </pre>

        {/* Textarea (on top, transparent text) */}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onScroll={syncScroll}
          className="relative z-10 w-full h-full resize-none bg-transparent outline-none"
          style={{
            ...editorStyle,
            color: 'transparent',
            caretColor: 'hsl(0 0% 88%)',
            WebkitTextFillColor: 'transparent',
          }}
          spellCheck={false}
        />
      </div>
    </div>
  );
}
