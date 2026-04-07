import { cn } from '@/lib/utils';
import type { SyncState } from '@/hooks/useSyncState';

interface SyncBadgeProps {
  state: SyncState;
  className?: string;
}

const STATE_CONFIG: Record<SyncState, { color: string; label: string; title: string }> = {
  synced: { color: 'bg-emerald-500', label: 'Synced', title: 'Synced with global' },
  override: { color: 'bg-blue-500', label: 'Override', title: 'Project override — not tracking global' },
  drifted: { color: 'bg-amber-500', label: 'Drifted', title: 'Modified outside dashboard — needs resolution' },
  absent: { color: 'bg-muted-foreground/30', label: 'Absent', title: 'Not present in this project' },
};

export function SyncBadge({ state, className }: SyncBadgeProps) {
  const config = STATE_CONFIG[state];

  return (
    <span
      className={cn('inline-flex items-center gap-1', className)}
      title={config.title}
    >
      <span className={cn('h-2 w-2 rounded-full shrink-0', config.color)} />
      <span className="text-[10px] text-muted-foreground">{config.label}</span>
    </span>
  );
}
