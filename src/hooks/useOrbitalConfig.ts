import { useState, useEffect } from 'react';
import type { AgentConfig } from '../types/index.js';

export interface OrbitalConfig {
  projectName: string;
  categories: string[];
  agents: AgentConfig[];
  serverPort: number;
  clientPort: number;
}

const DEFAULT_CONFIG: OrbitalConfig = {
  projectName: 'Project',
  categories: ['feature', 'bugfix', 'refactor', 'infrastructure', 'docs'],
  agents: [
    { id: 'attacker', label: 'Attacker', emoji: '\u{1F5E1}\u{FE0F}', color: '#ff1744' },
    { id: 'chaos', label: 'Chaos', emoji: '\u{1F4A5}', color: '#F97316' },
    { id: 'frontend-designer', label: 'Frontend Designer', emoji: '\u{1F3A8}', color: '#EC4899' },
    { id: 'architect', label: 'Architect', emoji: '\u{1F3D7}\u{FE0F}', color: '#536dfe' },
    { id: 'devops-expert', label: 'DevOps Expert', emoji: '\u{1F680}', color: '#40c4ff' },
    { id: 'rules-enforcer', label: 'Rules Enforcer', emoji: '\u{1F4CB}', color: '#6B7280' },
  ],
  serverPort: 4444,
  clientPort: 4445,
};

let cachedConfig: OrbitalConfig | null = null;

/**
 * Fetch project config from the server and inject CSS variables
 * for category and agent colors. Returns the config for rendering.
 */
export function useOrbitalConfig(): OrbitalConfig {
  const [config, setConfig] = useState<OrbitalConfig>(cachedConfig ?? DEFAULT_CONFIG);

  useEffect(() => {
    if (cachedConfig) return;

    fetch('/api/orbital/config')
      .then(res => res.json())
      .then((data: OrbitalConfig) => {
        cachedConfig = data;
        setConfig(data);

        // Inject CSS variables for agent colors
        const root = document.documentElement;
        for (const agent of data.agents) {
          root.style.setProperty(`--agent-${agent.id}`, agent.color);
        }
      })
      .catch(() => {
        // Use defaults on error
      });
  }, []);

  return config;
}
