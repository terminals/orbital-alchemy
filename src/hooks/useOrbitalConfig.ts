import { useState, useCallback } from 'react';
import type { AgentConfig } from '../types/index.js';
import { useProjects } from './useProjectContext';
import { useProjectUrl } from './useProjectUrl';
import { useFetch } from './useFetch';

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
    { id: 'rules-enforcer', label: 'Rules Enforcer', emoji: '\u{1F4CB}', color: '#6B7280' },
  ],
  serverPort: 4444,
  clientPort: 4445,
};

/** Per-project config cache to avoid redundant fetches within a session */
const configCache = new Map<string, OrbitalConfig>();

/**
 * Fetch project config from the server and inject CSS variables
 * for category and agent colors. Returns the config for rendering.
 */
export function useOrbitalConfig(): OrbitalConfig {
  const [config, setConfig] = useState<OrbitalConfig>(DEFAULT_CONFIG);
  const { activeProjectId } = useProjects();
  const buildUrl = useProjectUrl();

  const fetchConfig = useCallback(async () => {
    const cacheKey = activeProjectId ?? '__default__';
    const cached = configCache.get(cacheKey);
    if (cached) {
      setConfig(cached);
      return;
    }

    const res = await fetch(buildUrl('/config'));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data: OrbitalConfig = await res.json();
    configCache.set(cacheKey, data);
    setConfig(data);

    // Inject CSS variables for agent colors
    const root = document.documentElement;
    for (const agent of data.agents) {
      root.style.setProperty(`--agent-${agent.id}`, agent.color);
    }
  }, [buildUrl, activeProjectId]);

  useFetch(fetchConfig);

  return config;
}
