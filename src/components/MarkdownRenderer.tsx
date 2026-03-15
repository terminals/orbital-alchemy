import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

export function MarkdownRenderer({ content, className }: MarkdownRendererProps) {
  return (
    <div className={cn(
      'space-y-4 text-[13px] leading-[1.7]',
      className,
    )} style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        h1: ({ children }) => (
          <h1 className="text-base font-semibold text-foreground border-b border-border pb-2 mb-3">{children}</h1>
        ),
        h2: ({ children }) => (
          <h2 className="text-sm font-semibold text-foreground mt-6 mb-2 border-b border-border/50 pb-1.5">{children}</h2>
        ),
        h3: ({ children }) => (
          <h3 className="text-[13px] font-semibold text-foreground mt-5 mb-1.5">{children}</h3>
        ),
        h4: ({ children }) => (
          <h4 className="text-[13px] font-medium text-foreground/90 mt-4 mb-1">{children}</h4>
        ),
        p: ({ children }) => (
          <p className="text-foreground/70 mb-2">{children}</p>
        ),
        a: ({ href, children }) => (
          <a href={href} className="text-accent-blue hover:text-accent-blue/80 underline underline-offset-2" target="_blank" rel="noopener noreferrer">
            {children}
          </a>
        ),
        ul: ({ children }) => (
          <ul className="ml-5 space-y-1.5 list-disc text-foreground/70 marker:text-muted-foreground">{children}</ul>
        ),
        ol: ({ children }) => (
          <ol className="ml-5 space-y-1.5 list-decimal text-foreground/70 marker:text-muted-foreground">{children}</ol>
        ),
        li: ({ children, ...props }) => {
          const checkbox = props.node?.properties?.className;
          if (checkbox && String(checkbox).includes('task-list-item')) {
            return <li className="list-none ml-[-1.25rem] flex items-start gap-2">{children}</li>;
          }
          return <li className="pl-1">{children}</li>;
        },
        input: ({ checked }) => (
          <input
            type="checkbox"
            checked={checked}
            readOnly
            className="mt-1 h-3.5 w-3.5 rounded border-border accent-primary"
          />
        ),
        code: ({ children, className: codeClassName }) => {
          const isBlock = codeClassName?.startsWith('language-');
          if (isBlock) {
            return (
              <code className={cn(
                'block rounded p-3 font-mono text-xxs overflow-x-auto',
                'bg-[#0d0d14] border border-border/50',
                codeClassName,
              )}>
                {children}
              </code>
            );
          }
          return (
            <code className="bg-[#0d0d14] border border-border/30 rounded px-1.5 py-0.5 font-mono text-xxs text-accent-blue/90">
              {children}
            </code>
          );
        },
        pre: ({ children }) => (
          <pre className="overflow-x-auto my-3">{children}</pre>
        ),
        blockquote: ({ children }) => (
          <blockquote className="border-l-2 border-accent-blue/40 pl-4 py-1 text-foreground/60 italic bg-surface/50 rounded-r">
            {children}
          </blockquote>
        ),
        table: ({ children }) => (
          <div className="overflow-x-auto my-3 rounded border border-border">
            <table className="w-full text-xs">{children}</table>
          </div>
        ),
        thead: ({ children }) => (
          <thead className="bg-[#0d0d14] text-muted-foreground">{children}</thead>
        ),
        tr: ({ children }) => (
          <tr className="border-b border-border/50 even:bg-surface/30">{children}</tr>
        ),
        th: ({ children }) => (
          <th className="px-3 py-2 text-left text-xxs font-medium uppercase tracking-wider">{children}</th>
        ),
        td: ({ children }) => (
          <td className="px-3 py-2 text-foreground/70">{children}</td>
        ),
        hr: () => <hr className="border-border/50 my-4" />,
        strong: ({ children }) => (
          <strong className="font-semibold text-foreground">{children}</strong>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
    </div>
  );
}
