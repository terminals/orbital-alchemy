import { useState, type ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CollapsibleSectionProps {
  title: string;
  defaultOpen?: boolean;
  badge?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function CollapsibleSection({ title, defaultOpen = true, badge, children, className }: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className={cn('border-b border-border/50 last:border-b-0', className)}>
      <button
        type="button"
        className="flex w-full items-center gap-2 px-4 py-2 text-left text-xs font-medium text-foreground/80 hover:text-foreground transition-colors"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
      >
        <ChevronRight className={cn('h-3.5 w-3.5 shrink-0 transition-transform duration-200', open && 'rotate-90')} />
        <span className="flex-1 truncate">{title}</span>
        {badge && <span className="shrink-0">{badge}</span>}
      </button>
      <div
        className="grid transition-[grid-template-rows] duration-200 ease-out"
        style={{ gridTemplateRows: open ? '1fr' : '0fr' }}
      >
        <div className="overflow-hidden">
          <div className="px-4 pb-3">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
