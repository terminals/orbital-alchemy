import { useMemo } from 'react';
import { CollapsibleSection } from '@/components/ui/collapsible-section';
import { Badge } from '@/components/ui/badge';
import { MarkdownSection } from './MarkdownSection';
import { ProgressSection } from './ProgressSection';
import { ChecklistSection } from './ChecklistSection';
import { QuickStatusSection } from './QuickStatusSection';
import { ReviewSection } from './ReviewSection';
import { TableSection } from './TableSection';
import type { ScopeSection } from '@/lib/scope-sections';

interface ScopeSectionListProps {
  sections: ScopeSection[];
}

function SectionBadge({ section }: { section: ScopeSection }) {
  if (!section.meta) return null;

  if (section.meta.kind === 'progress') {
    const { done, total } = section.meta;
    const color = done === total ? 'text-bid-green' : 'text-muted-foreground';
    return <span className={`text-xxs ${color}`}>{done}/{total}</span>;
  }

  if (section.meta.kind === 'checklist') {
    const { done, total } = section.meta;
    const ratio = total > 0 ? done / total : 0;
    const color = ratio === 1 ? 'text-bid-green' : ratio >= 0.5 ? 'text-warning-amber' : 'text-muted-foreground';
    return <span className={`text-xxs ${color}`}>{done}/{total}</span>;
  }

  if (section.meta.kind === 'review') {
    const { blockers, warnings, suggestions, verdict } = section.meta;
    return (
      <span className="flex items-center gap-1.5">
        {verdict && (
          <Badge variant="outline" className={`h-4 px-1 text-xxs ${verdict.toUpperCase() === 'PASS' ? 'border-bid-green/40 text-bid-green' : 'border-ask-red/40 text-ask-red'}`}>
            {verdict}
          </Badge>
        )}
        {blockers > 0 && <span className="text-xxs text-ask-red">{blockers}B</span>}
        {warnings > 0 && <span className="text-xxs text-warning-amber">{warnings}W</span>}
        {suggestions > 0 && <span className="text-xxs text-accent-blue">{suggestions}S</span>}
      </span>
    );
  }

  return null;
}

function SectionRenderer({ section }: { section: ScopeSection }) {
  switch (section.type) {
    case 'quick-status':
      return <QuickStatusSection content={section.content} />;
    case 'progress':
      return section.meta?.kind === 'progress'
        ? <ProgressSection meta={section.meta} content={section.content} />
        : <MarkdownSection content={section.content} />;
    case 'requirements':
    case 'success-criteria':
    case 'definition-of-done':
    case 'next-actions':
      return section.meta?.kind === 'checklist'
        ? <ChecklistSection meta={section.meta} content={section.content} />
        : <MarkdownSection content={section.content} />;
    case 'files-summary':
    case 'risks':
      return <TableSection content={section.content} />;
    case 'agent-review':
      return <ReviewSection meta={section.meta?.kind === 'review' ? section.meta : undefined} content={section.content} />;
    default:
      return <MarkdownSection content={section.content} />;
  }
}

export function ScopeSectionList({ sections }: ScopeSectionListProps) {
  // Group sections by part for dividers
  const grouped = useMemo(() => {
    const groups: { part: string; sections: ScopeSection[] }[] = [];
    let currentPart = '';
    for (const s of sections) {
      if (s.part !== currentPart) {
        currentPart = s.part;
        groups.push({ part: currentPart, sections: [s] });
      } else {
        groups[groups.length - 1].sections.push(s);
      }
    }
    return groups;
  }, [sections]);

  return (
    <div className="divide-y-0">
      {grouped.map((group, gi) => (
        <div key={group.part}>
          {gi > 0 && (
            <div className="px-4 pt-4 pb-1">
              <span className="text-xxs font-medium uppercase tracking-widest text-muted-foreground/50">{group.part}</span>
            </div>
          )}
          {group.sections.map((section) => (
            <CollapsibleSection
              key={section.id}
              title={section.title}
              defaultOpen={!section.defaultCollapsed}
              badge={<SectionBadge section={section} />}
            >
              <SectionRenderer section={section} />
            </CollapsibleSection>
          ))}
        </div>
      ))}
    </div>
  );
}
