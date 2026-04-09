import { Badge } from '@/components/ui/badge';
import { MarkdownSection } from './MarkdownSection';
import type { ReviewMeta } from '@/lib/scope-sections';

interface ReviewSectionProps {
  meta?: ReviewMeta;
  content: string;
}

export function ReviewSection({ meta, content }: ReviewSectionProps) {
  return (
    <div className="space-y-3">
      {meta && (
        <div className="flex flex-wrap items-center gap-2">
          {meta.verdict && (
            <Badge variant="outline" className={meta.verdict.toUpperCase() === 'PASS'
              ? 'border-bid-green/40 bg-bid-green/10 text-bid-green'
              : 'border-ask-red/40 bg-ask-red/10 text-ask-red'
            }>
              {meta.verdict}
            </Badge>
          )}
          {meta.blockers > 0 && (
            <Badge variant="outline" className="border-ask-red/40 bg-ask-red/10 text-ask-red">
              {meta.blockers} blocker{meta.blockers !== 1 ? 's' : ''}
            </Badge>
          )}
          {meta.warnings > 0 && (
            <Badge variant="outline" className="border-warning-amber/40 bg-warning-amber/10 text-warning-amber">
              {meta.warnings} warning{meta.warnings !== 1 ? 's' : ''}
            </Badge>
          )}
          {meta.suggestions > 0 && (
            <Badge variant="outline" className="border-accent-blue/40 bg-accent-blue/10 text-accent-blue">
              {meta.suggestions} suggestion{meta.suggestions !== 1 ? 's' : ''}
            </Badge>
          )}
        </div>
      )}
      <MarkdownSection content={content} />
    </div>
  );
}
