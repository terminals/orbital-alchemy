import { Zap, Clock } from 'lucide-react';

// ─── Component ──────────────────────────────────────────
// Placeholder for hook execution history.
// The CC events system does not yet track hook executions,
// so this component shows a "no data" state.
// When hook execution tracking is added (scope 079+),
// this will subscribe to Socket.io events and display live data.

export function HookExecutionLog() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-950/50 p-8 text-center">
      <div className="flex items-center gap-2 text-zinc-600">
        <Zap className="h-4 w-4" />
        <Clock className="h-4 w-4" />
      </div>
      <span className="text-xs font-medium text-zinc-500">No hook execution data available</span>
      <p className="max-w-xs text-[10px] text-zinc-600">
        Hook execution tracking will be added when the Hook & Event Foundation (scope 079) is implemented.
        This panel will show real-time hook firing events with timestamps, results, and durations.
      </p>
    </div>
  );
}
