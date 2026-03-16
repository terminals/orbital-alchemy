import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Bot, Filter } from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { useEvents } from '@/hooks/useEvents';
import { useTheme } from '@/hooks/useTheme';
import { AgentBadge } from '@/components/AgentBadge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { cn, formatScopeId } from '@/lib/utils';
import type { OrbitalEvent } from '@/types';

// Agent-related event types
const AGENT_EVENT_TYPES = [
  'AGENT_STARTED',
  'AGENT_FINDING',
  'AGENT_COMPLETED',
  'AGENT_CONSENSUS',
];

const SEVERITY_CONFIG: Record<string, { color: string; label: string }> = {
  blocker: { color: 'text-ask-red bg-[#ff174415]', label: 'BLOCKER' },
  warning: { color: 'text-warning-amber bg-[#ffab0015]', label: 'WARNING' },
  info: { color: 'text-accent-blue bg-[#536dfe15]', label: 'INFO' },
  pass: { color: 'text-bid-green bg-[#00c85315]', label: 'PASS' },
};

const AGENTS = [
  'all',
  'attacker',
  'chaos',
  'solana-expert',
  'frontend-designer',
  'architect',
  'devops-expert',
  'rules-enforcer',
] as const;

const rowStagger = {
  show: { transition: { staggerChildren: 0.02 } },
};
const rowItem = {
  hidden: { opacity: 0, x: -8 },
  show: { opacity: 1, x: 0, transition: { type: 'spring', stiffness: 400, damping: 30 } },
};

export function AgentFeed() {
  const { events, loading } = useEvents({ limit: 200 });
  const { neonGlass } = useTheme();
  const [agentFilter, setAgentFilter] = useState<string>('all');
  const [showAllEvents, setShowAllEvents] = useState(false);

  // Filter to agent-related events or show all
  const filteredEvents = useMemo(() => {
    let filtered = events;

    if (!showAllEvents) {
      filtered = filtered.filter((e) => AGENT_EVENT_TYPES.includes(e.type));
    }

    if (agentFilter !== 'all') {
      filtered = filtered.filter((e) => e.agent === agentFilter);
    }

    return filtered;
  }, [events, agentFilter, showAllEvents]);

  return (
    <div className="flex flex-1 min-h-0 flex-col">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Bot className="h-4 w-4 text-primary" />
          <h1 className="text-xl font-light">Agent Activity</h1>
          {!loading && events.length > 0 && (
            <div className="flex items-center gap-1.5">
              <div className={cn('h-2 w-2 animate-pulse-dot rounded-full bg-bid-green', neonGlass && 'glow-green')} />
              <span className="text-xs text-bid-green">Live</span>
            </div>
          )}
        </div>
        <Button
          variant={showAllEvents ? 'default' : 'outline'}
          size="sm"
          onClick={() => setShowAllEvents(!showAllEvents)}
        >
          <Filter className="mr-1.5 h-3.5 w-3.5" />
          {showAllEvents ? 'All Events' : 'Agent Only'}
        </Button>
      </div>

      {/* Agent filter chips */}
      <div className="mb-4 flex flex-wrap gap-1.5">
        <button
          key="all"
          onClick={() => setAgentFilter('all')}
          className={cn(
            'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xxs font-normal transition-colors cursor-pointer',
            agentFilter === 'all'
              ? 'bg-accent-blue/25 text-accent-blue ring-1 ring-accent-blue/40'
              : 'bg-muted/50 text-muted-foreground hover:bg-muted',
            neonGlass && agentFilter === 'all' && 'glow-blue'
          )}
        >
          All Agents
        </button>
        {AGENTS.filter(a => a !== 'all').map((agent) => (
          <AgentFilterChip
            key={agent}
            agent={agent}
            active={agentFilter === agent}
            onClick={() => setAgentFilter(agent)}
            neonGlass={neonGlass}
          />
        ))}
      </div>

      <Separator className="mb-4" />

      {/* Event feed */}
      <ScrollArea className="flex-1">
        {loading ? (
          <div className="flex h-32 items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : filteredEvents.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Bot className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">
                No agent activity yet. Events will appear here as agents are triggered.
              </p>
              <p className="mt-1 text-xs text-muted-foreground/60">
                Edit a file matching an agent trigger pattern to see agents in action.
              </p>
            </CardContent>
          </Card>
        ) : neonGlass ? (
          <motion.div
            className="space-y-1 pr-4"
            variants={rowStagger}
            initial="hidden"
            animate="show"
          >
            {filteredEvents.map((event) => (
              <motion.div key={event.id} variants={rowItem}>
                <EventRow event={event} />
              </motion.div>
            ))}
          </motion.div>
        ) : (
          <div className="space-y-1 pr-4">
            {filteredEvents.map((event) => (
              <EventRow key={event.id} event={event} />
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

// ─── Event Row ─────────────────────────────────────────────

function EventRow({ event }: { event: OrbitalEvent }) {
  const data = event.data as Record<string, unknown>;
  const severity = data.severity as string | undefined;
  const severityConfig = severity ? SEVERITY_CONFIG[severity] : null;

  return (
    <div className="group flex items-start gap-3 rounded px-2.5 py-1.5 transition-colors hover:bg-surface-light animate-slide-up">
      {/* Timestamp */}
      <span className="mt-0.5 flex-shrink-0 font-mono text-xs text-muted-foreground/60">
        {format(new Date(event.timestamp), 'HH:mm:ss')}
      </span>

      {/* Agent badge */}
      <div className="flex-shrink-0">
        {event.agent ? (
          <AgentBadge agent={event.agent} showLabel={false} />
        ) : (
          <span className="inline-flex h-6 w-6 items-center justify-center text-xs">
            {getEventIcon(event.type)}
          </span>
        )}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-xs font-normal">
            {formatEventMessage(event)}
          </span>
          {severityConfig && (
            <Badge
              className={cn(
                'text-[10px] px-1.5 py-0',
                severityConfig.color
              )}
            >
              {severityConfig.label}
            </Badge>
          )}
        </div>

        {/* Detail message */}
        {'message' in data && data.message != null && (
          <p className="mt-0.5 text-xxs text-muted-foreground line-clamp-2">
            {String(data.message)}
          </p>
        )}

        {/* File path */}
        {'file' in data && data.file != null && (
          <span className="mt-0.5 inline-block font-mono text-[10px] text-muted-foreground/60">
            {String(data.file)}
          </span>
        )}

        {/* Scope reference */}
        {event.scope_id && (
          <span className="ml-2 font-mono text-[10px] text-muted-foreground/60">
            scope {formatScopeId(event.scope_id)}
          </span>
        )}
      </div>

      {/* Relative time */}
      <span className="flex-shrink-0 text-[10px] text-muted-foreground/40 opacity-0 transition-opacity group-hover:opacity-100">
        {formatDistanceToNow(new Date(event.timestamp), { addSuffix: true })}
      </span>
    </div>
  );
}

function formatEventMessage(event: OrbitalEvent): string {
  const data = event.data as Record<string, unknown>;

  switch (event.type) {
    case 'AGENT_STARTED':
      return `${event.agent ?? 'Agent'} started reviewing`;
    case 'AGENT_FINDING':
      return `${event.agent ?? 'Agent'} found issue`;
    case 'AGENT_COMPLETED':
      return `${event.agent ?? 'Agent'} completed (${data.status ?? 'done'})`;
    case 'AGENT_CONSENSUS':
      return `Consensus: ${data.consensus ?? 'reached'}`;
    case 'SESSION_START':
      return 'Session started';
    case 'SESSION_END':
      return 'Session ended';
    case 'SKILL_INVOKED':
      return `Skill invoked: ${data.skill ?? 'unknown'}`;
    case 'GATE_PASSED':
      return `Gate passed: ${data.gate ?? 'unknown'}`;
    case 'GATE_FAILED':
      return `Gate failed: ${data.gate ?? 'unknown'}`;
    case 'COMMIT_CREATED':
      return `Commit: ${String(data.message ?? data.sha ?? '').slice(0, 50)}`;
    case 'PR_CREATED':
      return `PR #${data.number ?? '?'} created`;
    case 'DEPLOY_STARTED':
      return `Deploying to ${data.environment ?? 'unknown'}`;
    case 'DEPLOY_HEALTHY':
      return `Deploy healthy on ${data.environment ?? 'unknown'}`;
    case 'SCOPE_STATUS_CHANGED':
      return `Scope moved: ${data.from ?? '?'} → ${data.to ?? '?'}`;
    case 'VIOLATION':
      return `Violation: ${data.rule ?? 'unknown rule'} blocked`;
    case 'OVERRIDE':
      return `Override: ${data.rule ?? 'unknown rule'} (${data.reason ?? 'no reason'})`;
    case 'COMMIT':
      return `Scope commit: ${String(data.hash ?? '').slice(0, 7)} ${String(data.message ?? '').slice(0, 40)}`;
    case 'SCOPE_TRANSITION':
      return `Scope ${data.scope_name ?? '?'}: \u2192 ${data.to ?? '?'}`;
    case 'PATTERN_DETECTED':
      return `Pattern detected: ${data.rule ?? '?'} (confidence: ${data.confidence ?? '?'})`;
    case 'RULE_PROPOSED':
      return `Rule proposed: ${String(data.rule_text ?? '').slice(0, 50)}`;
    default:
      return event.type.replace(/_/g, ' ').toLowerCase();
  }
}

// ─── Agent Filter Chip ──────────────────────────────────────

const AGENT_CHIP_CONFIG: Record<string, { emoji: string; label: string; color: string; activeColor: string; glowClass: string }> = {
  'attacker':          { emoji: '\u{1F5E1}\u{FE0F}', label: 'Attacker', color: 'text-agent-attacker', activeColor: 'bg-agent-attacker/25 ring-1 ring-agent-attacker/40', glowClass: 'glow-red' },
  'chaos':             { emoji: '\u{1F4A5}', label: 'Chaos', color: 'text-agent-chaos', activeColor: 'bg-agent-chaos/25 ring-1 ring-agent-chaos/40', glowClass: 'glow-amber' },
  'solana-expert':     { emoji: '\u{26D3}\u{FE0F}', label: 'Solana', color: 'text-agent-solana', activeColor: 'bg-agent-solana/25 ring-1 ring-agent-solana/40', glowClass: 'glow-purple' },
  'frontend-designer': { emoji: '\u{1F3A8}', label: 'Frontend', color: 'text-agent-frontend', activeColor: 'bg-agent-frontend/25 ring-1 ring-agent-frontend/40', glowClass: 'glow-red' },
  'architect':         { emoji: '\u{1F3D7}\u{FE0F}', label: 'Architect', color: 'text-agent-architect', activeColor: 'bg-agent-architect/25 ring-1 ring-agent-architect/40', glowClass: 'glow-blue' },
  'devops-expert':     { emoji: '\u{1F680}', label: 'DevOps', color: 'text-agent-devops', activeColor: 'bg-agent-devops/25 ring-1 ring-agent-devops/40', glowClass: 'glow-blue' },
  'rules-enforcer':    { emoji: '\u{1F4CB}', label: 'Rules', color: 'text-agent-rules', activeColor: 'bg-agent-rules/25 ring-1 ring-agent-rules/40', glowClass: '' },
};

function AgentFilterChip({ agent, active, onClick, neonGlass }: { agent: string; active: boolean; onClick: () => void; neonGlass: boolean }) {
  const config = AGENT_CHIP_CONFIG[agent] ?? { emoji: '\u{1F916}', label: agent, color: 'text-muted-foreground', activeColor: 'bg-muted ring-1 ring-border', glowClass: '' };
  return (
    <button
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xxs font-normal transition-colors cursor-pointer',
        active
          ? cn(config.color, config.activeColor, neonGlass && config.glowClass)
          : cn('bg-muted/50 text-muted-foreground hover:bg-muted')
      )}
    >
      <span>{config.emoji}</span>
      <span>{config.label}</span>
    </button>
  );
}

function getEventIcon(type: string): string {
  const icons: Record<string, string> = {
    SESSION_START: '\u{1F7E2}',
    SESSION_END: '\u{1F534}',
    SKILL_INVOKED: '\u{1F527}',
    GATE_PASSED: '\u2705',
    GATE_FAILED: '\u274C',
    COMMIT_CREATED: '\u{1F4BE}',
    PR_CREATED: '\u{1F517}',
    DEPLOY_STARTED: '\u{1F680}',
    DEPLOY_HEALTHY: '\u{1F49A}',
    DEPLOY_FAILED: '\u{1F4A5}',
    BUILD_COMPLETED: '\u{1F3D7}\u{FE0F}',
    TESTS_COMPLETED: '\u{1F9EA}',
    SCOPE_STATUS_CHANGED: '\u{1F504}',
    VIOLATION: '\u{1F6D1}',
    OVERRIDE: '\u{26A0}\u{FE0F}',
    COMMIT: '\u{1F4DD}',
    SCOPE_TRANSITION: '\u{1F500}',
    PATTERN_DETECTED: '\u{1F50D}',
    RULE_PROPOSED: '\u{1F4CB}',
  };
  return icons[type] ?? '\u{1F4E1}';
}
