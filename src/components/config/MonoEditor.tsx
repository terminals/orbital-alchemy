import { useCallback, useRef, useMemo } from 'react';
import { detectLang, highlightLine } from './syntax-highlighter';

const MONO_FONT = "'JetBrains Mono', 'SF Mono', 'Fira Code', monospace";

interface MonoEditorProps {
  value: string;
  onChange: (v: string) => void;
  filePath: string | null;
}

export function MonoEditor({ value, onChange, filePath }: MonoEditorProps) {
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
