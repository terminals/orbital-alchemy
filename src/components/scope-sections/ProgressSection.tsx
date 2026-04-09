import { CheckCircle2, Circle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ProgressMeta } from '@/lib/scope-sections';
import { MarkdownSection } from './MarkdownSection';

interface ProgressSectionProps {
  meta: ProgressMeta;
  content: string;
}

export function ProgressSection({ meta, content }: ProgressSectionProps) {
  const pct = meta.total > 0 ? (meta.done / meta.total) * 100 : 0;

  return (
    <div className="space-y-3">
      {/* Progress bar */}
      <div className="flex items-center gap-3">
        <div className="h-1.5 flex-1 rounded-full bg-muted">
          <div
            className={cn('h-full rounded-full transition-all duration-500', pct === 100 ? 'bg-bid-green' : 'bg-accent-blue')}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="text-xxs text-muted-foreground">{meta.done}/{meta.total}</span>
      </div>

      {/* Phase table */}
      <div className="space-y-1">
        {meta.phases.map((phase, i) => {
          const isInProgress = /⏳|in.?progress|pending/i.test(phase.status) && !phase.done;
          return (
            <div key={i} className="flex items-center gap-2 rounded px-2 py-1 text-xxs">
              {phase.done ? (
                <CheckCircle2 className="h-3 w-3 shrink-0 text-bid-green" />
              ) : isInProgress ? (
                <Loader2 className="h-3 w-3 shrink-0 text-accent-blue animate-spin" />
              ) : (
                <Circle className="h-3 w-3 shrink-0 text-muted-foreground/40" />
              )}
              <span className="font-mono text-muted-foreground/50 w-4">{phase.name}</span>
              <span className={cn('flex-1', phase.done ? 'text-muted-foreground' : 'text-foreground/80')}>
                {phase.description}
              </span>
            </div>
          );
        })}
      </div>

      {/* Render any content beyond the table (like notes) */}
      {content.split('\n').some(l => l.trim() && !/^\|/.test(l.trim())) && (
        <div className="pt-1">
          <MarkdownSection content={content.split('\n').filter(l => !l.trim().startsWith('|')).join('\n').trim()} />
        </div>
      )}
    </div>
  );
}
