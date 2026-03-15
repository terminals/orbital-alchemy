import { CheckCircle2, XCircle, Loader2, MinusCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { GateStatus } from '@/types';

interface GateIndicatorProps {
  status: GateStatus;
  className?: string;
}

const STATUS_CONFIG: Record<GateStatus, {
  icon: typeof CheckCircle2;
  color: string;
  label: string;
  animate?: string;
  glow: string;
}> = {
  pass: { icon: CheckCircle2, color: 'text-bid-green', label: 'Pass', glow: 'gate-glow-pass glow-green' },
  fail: { icon: XCircle, color: 'text-ask-red', label: 'Fail', glow: 'gate-glow-fail glow-red' },
  running: { icon: Loader2, color: 'text-accent-blue', label: 'Running', animate: 'animate-spin', glow: 'glow-blue' },
  skipped: { icon: MinusCircle, color: 'text-muted-foreground', label: 'Skipped', glow: '' },
};

export function GateIndicator({ status, className }: GateIndicatorProps) {
  const config = STATUS_CONFIG[status];
  const Icon = config.icon;

  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      <Icon className={cn('h-4 w-4', config.color, config.animate, config.glow)} />
      <span className={cn('text-xs', config.color)}>{config.label}</span>
    </div>
  );
}
