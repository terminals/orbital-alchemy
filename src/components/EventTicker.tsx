import { AnimatePresence, motion } from 'framer-motion';
import { useEvents } from '@/hooks/useEvents';
import { useTheme } from '@/hooks/useTheme';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

const EVENT_ICON: Record<string, string> = {
  SESSION_START: '\u{1F7E2}',
  SESSION_END: '\u{1F534}',
  AGENT_STARTED: '\u{1F916}',
  AGENT_COMPLETED: '\u2705',
  AGENT_FINDING: '\u26A0\u{FE0F}',
  GATE_PASSED: '\u2705',
  GATE_FAILED: '\u274C',
  COMMIT_CREATED: '\u{1F4BE}',
  PR_CREATED: '\u{1F517}',
  DEPLOY_STARTED: '\u{1F680}',
  DEPLOY_HEALTHY: '\u{1F49A}',
  DEPLOY_FAILED: '\u{1F4A5}',
  SKILL_INVOKED: '\u{1F527}',
  BUILD_COMPLETED: '\u{1F3D7}\u{FE0F}',
  TESTS_COMPLETED: '\u{1F9EA}',
  SCOPE_STATUS_CHANGED: '\u{1F504}',
};

const slideIn = {
  initial: { opacity: 0, x: 20 },
  animate: { opacity: 1, x: 0, transition: { type: 'spring', stiffness: 400, damping: 30 } },
  exit: { opacity: 0, x: -10 },
};

export function EventTicker() {
  const { events } = useEvents({ limit: 10 });
  const { neonGlass } = useTheme();

  if (events.length === 0) return null;

  return (
    <div className={cn(
      'fixed bottom-0 left-24 right-0 z-40 border-t border-border bg-surface/95 backdrop-blur-sm',
      neonGlass && 'ticker-glass'
    )}>
      <div className="flex items-center gap-4 overflow-x-auto px-4 py-2">
        <span className="flex-shrink-0 text-xxs uppercase tracking-wider font-normal text-muted-foreground">
          Recent
        </span>
        {neonGlass ? (
          <AnimatePresence initial={false}>
            {events.slice(0, 8).map((event) => (
              <motion.div
                key={event.id}
                className="flex flex-shrink-0 items-center gap-1.5 text-xxs"
                {...slideIn}
              >
                <span>{EVENT_ICON[event.type] ?? '\u{1F4E1}'}</span>
                <span className="text-muted-foreground">
                  {formatEventLabel(event.type)}
                </span>
                <span className="text-muted-foreground/60">
                  {formatDistanceToNow(new Date(event.timestamp), { addSuffix: true })}
                </span>
              </motion.div>
            ))}
          </AnimatePresence>
        ) : (
          events.slice(0, 8).map((event) => (
            <div
              key={event.id}
              className={cn(
                'flex flex-shrink-0 items-center gap-1.5 text-xxs animate-fade-in'
              )}
            >
              <span>{EVENT_ICON[event.type] ?? '\u{1F4E1}'}</span>
              <span className="text-muted-foreground">
                {formatEventLabel(event.type)}
              </span>
              <span className="text-muted-foreground/60">
                {formatDistanceToNow(new Date(event.timestamp), { addSuffix: true })}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function formatEventLabel(type: string): string {
  return type
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/^\w/, (c) => c.toUpperCase());
}
