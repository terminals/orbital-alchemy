import { CheckSquare, Square, CircleMinus } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ChecklistMeta } from '@/lib/scope-sections';

interface ChecklistSectionProps {
  meta: ChecklistMeta;
  content: string;
}

interface ListItem {
  text: string;
  checked: boolean | null; // null = plain bullet (not a checkbox)
}

export function ChecklistSection({ meta, content }: ChecklistSectionProps) {
  // Parse all lines into groups: headings, checkboxes, and plain bullets
  const groups: { heading: string | null; items: ListItem[] }[] = [];
  let currentHeading: string | null = null;
  let checkIdx = 0;

  for (const line of content.split('\n')) {
    // #### heading — starts a new group
    const headingMatch = line.match(/^####\s+(.+)/);
    if (headingMatch) {
      currentHeading = headingMatch[1].trim();
      continue;
    }

    // Checkbox item: - [x] or - [ ]
    const checkMatch = line.match(/^[\s]*-\s+\[([ xX])\]\s+(.*)/);
    if (checkMatch) {
      const item = meta.items[checkIdx];
      if (item) {
        const lastGroup = groups[groups.length - 1];
        if (!lastGroup || lastGroup.heading !== currentHeading) {
          groups.push({ heading: currentHeading, items: [{ text: item.text, checked: item.checked }] });
        } else {
          lastGroup.items.push({ text: item.text, checked: item.checked });
        }
        checkIdx++;
      }
      continue;
    }

    // Plain bullet: - Item text
    const bulletMatch = line.match(/^[\s]*-\s+(.+)/);
    if (bulletMatch) {
      const lastGroup = groups[groups.length - 1];
      const item: ListItem = { text: bulletMatch[1].trim(), checked: null };
      if (!lastGroup || lastGroup.heading !== currentHeading) {
        groups.push({ heading: currentHeading, items: [item] });
      } else {
        lastGroup.items.push(item);
      }
    }
  }

  // If no groups were formed, just list all meta items
  if (groups.length === 0 && meta.items.length > 0) {
    groups.push({ heading: null, items: meta.items.map(i => ({ text: i.text, checked: i.checked })) });
  }

  return (
    <div className="space-y-3">
      {groups.map((group, gi) => (
        <div key={gi}>
          {group.heading && (
            <p className="mb-1.5 text-xxs font-medium uppercase tracking-wide text-muted-foreground/70">{group.heading}</p>
          )}
          <div className="space-y-0.5">
            {group.items.map((item, i) => (
              <div key={i} className={cn('flex items-start gap-2 rounded px-1 py-0.5 text-xxs', item.checked === true && 'opacity-50')}>
                {item.checked === true ? (
                  <CheckSquare className="mt-0.5 h-3 w-3 shrink-0 text-bid-green" />
                ) : item.checked === false ? (
                  <Square className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground/40" />
                ) : (
                  <CircleMinus className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground/30" />
                )}
                <span className={cn('text-foreground/80', item.checked === true && 'line-through text-muted-foreground', item.checked === null && 'text-muted-foreground')}>{item.text}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
