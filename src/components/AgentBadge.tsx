import { cn } from '@/lib/utils';
import type { AgentName } from '@/types';

const AGENT_CONFIG: Record<string, { emoji: string; label: string; color: string; glow: string }> = {
  'attacker': { emoji: '\u{1F5E1}\u{FE0F}', label: 'Attacker', color: 'bg-agent-attacker/20 text-agent-attacker', glow: 'agent-glow-attacker' },
  'chaos': { emoji: '\u{1F4A5}', label: 'Chaos', color: 'bg-agent-chaos/20 text-agent-chaos', glow: 'agent-glow-chaos' },
  'funding-expert': { emoji: '\u{1F4B0}', label: 'Funding', color: 'bg-agent-funding/20 text-agent-funding', glow: 'agent-glow-funding' },
  'trading-expert': { emoji: '\u{1F4C8}', label: 'Trading', color: 'bg-agent-trading/20 text-agent-trading', glow: 'agent-glow-trading' },
  'solana-expert': { emoji: '\u{26D3}\u{FE0F}', label: 'Solana', color: 'bg-agent-solana/20 text-agent-solana', glow: 'agent-glow-solana' },
  'frontend-designer': { emoji: '\u{1F3A8}', label: 'Frontend', color: 'bg-agent-frontend/20 text-agent-frontend', glow: 'agent-glow-frontend' },
  'architect': { emoji: '\u{1F3D7}\u{FE0F}', label: 'Architect', color: 'bg-agent-architect/20 text-agent-architect', glow: 'agent-glow-architect' },
  'devops-expert': { emoji: '\u{1F680}', label: 'DevOps', color: 'bg-agent-devops/20 text-agent-devops', glow: 'agent-glow-devops' },
  'rules-enforcer': { emoji: '\u{1F4CB}', label: 'Rules', color: 'bg-agent-rules/20 text-agent-rules', glow: 'agent-glow-rules' },
};

interface AgentBadgeProps {
  agent: string;
  showLabel?: boolean;
  className?: string;
}

export function AgentBadge({ agent, showLabel = true, className }: AgentBadgeProps) {
  const config = AGENT_CONFIG[agent as AgentName] ?? {
    emoji: '\u{1F916}',
    label: agent,
    color: 'bg-muted text-muted-foreground',
    glow: '',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xxs font-normal',
        config.color,
        config.glow,
        className
      )}
    >
      <span>{config.emoji}</span>
      {showLabel && <span>{config.label}</span>}
    </span>
  );
}
