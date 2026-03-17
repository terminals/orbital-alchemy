import { useMemo } from 'react';
import { useWorkflow } from './useWorkflow';
import { useConfigTree } from './useConfigTree';
import type {
  ConfigFileNode,
  ResolvedHook,
  ResolvedAgent,
  ReviewTeam,
  StageData,
  EdgeData,
  PipelineData,
} from '@/types';
import { AGENT_EMOJI, AGENT_COLOR } from '@/types';
import type { WorkflowConfig, WorkflowHook, WorkflowEdge, HookCategory } from '../../shared/workflow-config';
import { getHookEnforcement } from '../../shared/workflow-config';
import { WorkflowEngine } from '../../shared/workflow-engine';

// ─── Helpers ─────────────────────────────────────────────

/** Collect all tree-relative file paths into a set */
function collectTreePaths(nodes: ConfigFileNode[]): Set<string> {
  const paths = new Set<string>();
  for (const node of nodes) {
    if (node.type === 'file') paths.add(node.path);
    if (node.children) {
      for (const p of collectTreePaths(node.children)) paths.add(p);
    }
  }
  return paths;
}

/**
 * Build a map from logical name → tree-relative path for skills/agents.
 * Keys by parent folder name (preferred for SKILL.md/AGENT.md pattern) and
 * filename-without-extension. First match wins — no silent overwrites.
 */
function buildPathMap(nodes: ConfigFileNode[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const node of nodes) {
    if (node.type === 'file') {
      const parts = node.path.split('/');
      // Prefer folder name key (e.g., "scope-create" from "scope-create/SKILL.md")
      if (parts.length >= 2) {
        const folder = parts[parts.length - 2].toLowerCase();
        if (!map.has(folder)) map.set(folder, node.path);
      }
      // Also key by filename without extension
      const name = node.name.replace(/\.(md|sh)$/, '').toLowerCase();
      if (!map.has(name)) map.set(name, node.path);
    }
    if (node.children) {
      const childMap = buildPathMap(node.children);
      for (const [k, v] of childMap) {
        if (!map.has(k)) map.set(k, v);
      }
    }
  }
  return map;
}

/** Extract command name from edge command string: "/scope-create {id}" → "scope-create" */
function extractCommandName(command: string | null): string | null {
  if (!command) return null;
  return command.replace(/^\//, '').replace(/\s+\{.*\}$/, '').toLowerCase();
}

function resolveHook(hook: WorkflowHook, hookPathMap: Map<string, string>): ResolvedHook {
  return {
    id: hook.id,
    label: hook.label,
    category: hook.category,
    enforcement: getHookEnforcement(hook),
    filePath: hookPathMap.get(hook.id) ?? null,
    timing: hook.timing,
    blocking: hook.blocking ?? false,
    description: hook.description,
  };
}

// ─── Hook ────────────────────────────────────────────────

export function usePipelineData(overrideConfig?: WorkflowConfig): PipelineData {
  const { engine: contextEngine } = useWorkflow();
  const { tree: skillsTree } = useConfigTree('skills');
  const { tree: hooksTree } = useConfigTree('hooks');
  const { tree: agentsTree } = useConfigTree('agents');

  return useMemo(() => {
    const engine = overrideConfig
      ? new WorkflowEngine(overrideConfig)
      : contextEngine;
    const lists = engine.getLists();
    const allEdges = engine.getAllEdges();
    const allHooks = engine.getAllHooks();

    // Build path maps from config trees
    const skillPathMap = buildPathMap(skillsTree);
    const agentPathMap = buildPathMap(agentsTree);

    // Build hook path map from hook definitions' target fields,
    // validated against actual files in the hooks tree.
    const hookTreePaths = collectTreePaths(hooksTree);

    const hooksPrefix = '.claude/hooks/';
    const hookPathMap = new Map<string, string>();
    for (const hook of allHooks) {
      const treePath = hook.target.startsWith(hooksPrefix)
        ? hook.target.slice(hooksPrefix.length)
        : hook.target;
      if (hookTreePaths.has(treePath)) {
        hookPathMap.set(hook.id, treePath);
      }
    }

    // Build hook lookup
    const hookById = new Map(allHooks.map(h => [h.id, h]));

    // ─── Resolve hooks per list and detect globals ─────
    // A hook is "global" if it appears on all-but-one or more stages' edges
    const listIds = lists.map(l => l.id);
    const hookAppearanceCount = new Map<string, number>();

    // Count how many stages reference each hook via their activeHooks
    for (const list of lists) {
      const hookIds = new Set(list.activeHooks ?? []);
      for (const hid of hookIds) {
        hookAppearanceCount.set(hid, (hookAppearanceCount.get(hid) ?? 0) + 1);
      }
    }

    // Also count by checking which hooks appear on edges from/to each stage
    const hooksPerStage = new Map<string, Set<string>>();
    for (const listId of listIds) {
      hooksPerStage.set(listId, new Set());
    }
    for (const edge of allEdges) {
      for (const hid of edge.hooks ?? []) {
        hooksPerStage.get(edge.from)?.add(hid);
        hooksPerStage.get(edge.to)?.add(hid);
      }
    }
    for (const [, hookSet] of hooksPerStage) {
      for (const hid of hookSet) {
        hookAppearanceCount.set(hid, (hookAppearanceCount.get(hid) ?? 0) + 1);
      }
    }

    // Global threshold: appears in all-but-one or more stages
    const globalThreshold = Math.max(1, listIds.length - 1);
    const globalHookIds = new Set<string>();
    for (const [hid, count] of hookAppearanceCount) {
      if (count >= globalThreshold) globalHookIds.add(hid);
    }

    const globalHooks: ResolvedHook[] = [];
    for (const hid of globalHookIds) {
      const hook = hookById.get(hid);
      if (hook) globalHooks.push(resolveHook(hook, hookPathMap));
    }
    // Sort: guards first, then gates, lifecycle, observer
    const categoryOrder: Record<HookCategory, number> = { guard: 0, gate: 1, lifecycle: 2, observer: 3 };
    globalHooks.sort((a, b) => categoryOrder[a.category] - categoryOrder[b.category]);

    // ─── Build skill frontmatter maps keyed by tree path ───
    // Then we can look up by path (via skillPathMap) instead of by folder name.
    const agentModeByPath = new Map<string, string>();
    const orchestratesByPath = new Map<string, string[]>();
    function scanSkillFrontmatter(nodes: ConfigFileNode[]) {
      for (const node of nodes) {
        if (node.type === 'file') {
          if (node.frontmatter?.['agent-mode']) {
            agentModeByPath.set(node.path, String(node.frontmatter['agent-mode']));
          }
          if (Array.isArray(node.frontmatter?.['orchestrates'])) {
            const subs = (node.frontmatter['orchestrates'] as unknown[]).filter(
              (v): v is string => typeof v === 'string',
            );
            if (subs.length > 0) orchestratesByPath.set(node.path, subs);
          }
        }
        if (node.children) scanSkillFrontmatter(node.children);
      }
    }
    scanSkillFrontmatter(skillsTree);

    // Convenience: resolve a command name to skill frontmatter via skillPathMap
    function getSkillMode(cmdName: string): string | undefined {
      const p = skillPathMap.get(cmdName);
      return p ? agentModeByPath.get(p) : undefined;
    }

    // Build orchestratesMap keyed by command name (for external consumers)
    const orchestratesMap = new Map<string, string[]>();
    for (const [key, path] of skillPathMap) {
      const orch = orchestratesByPath.get(path);
      if (orch) orchestratesMap.set(key, orch);
    }

    // ─── Build agent resolver ──────────────────────────
    function resolveAgent(agentId: string, node?: ConfigFileNode): ResolvedAgent {
      const filePath = node ? node.path : (agentPathMap.get(agentId.toLowerCase()) ?? null);
      const label = node?.frontmatter?.['name']
        ? String(node.frontmatter['name'])
        : agentId.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      return {
        id: agentId,
        label,
        emoji: AGENT_EMOJI[agentId] ?? '',
        color: AGENT_COLOR[agentId] ?? '',
        filePath,
      };
    }

    // ─── Build full agent roster from agents config tree ─────
    // Only collect .md files inside team subfolders (e.g., blue-team/attacker.md).
    // Root-level files are docs, and reference/workflows are not agent specs.
    const TEAM_HEX: Record<string, string> = {
      'red-team': '#ef4444', 'blue-team': '#3b82f6', 'green-team': '#22c55e',
    };
    const EXCLUDED_FOLDERS = new Set(['reference', 'workflows']);
    const allAgents: ResolvedAgent[] = [];
    function collectAgents(nodes: ConfigFileNode[], teamFolder: string | null) {
      for (const node of nodes) {
        if (node.type === 'folder') {
          if (!EXCLUDED_FOLDERS.has(node.name.toLowerCase()) && node.children) {
            collectAgents(node.children, node.name);
          }
        } else if (teamFolder && node.name.endsWith('.md') && node.frontmatter?.['name']) {
          const id = node.name.replace(/\.md$/, '').toLowerCase();
          const agent = resolveAgent(id, node);
          agent.team = teamFolder;
          agent.color = TEAM_HEX[teamFolder.toLowerCase()] ?? (agent.color || '#8B5CF6');
          allAgents.push(agent);
        }
      }
    }
    collectAgents(agentsTree, null);
    // Sort agents by team then label
    allAgents.sort((a, b) => {
      if (a.team !== b.team) return (a.team ?? '').localeCompare(b.team ?? '');
      return a.label.localeCompare(b.label);
    });

    // ─── Build stages ──────────────────────────────────
    const edgesByFrom = new Map<string, WorkflowEdge[]>();
    const edgesByTo = new Map<string, WorkflowEdge[]>();
    for (const edge of allEdges) {
      if (!edgesByFrom.has(edge.from)) edgesByFrom.set(edge.from, []);
      edgesByFrom.get(edge.from)!.push(edge);
      if (!edgesByTo.has(edge.to)) edgesByTo.set(edge.to, []);
      edgesByTo.get(edge.to)!.push(edge);
    }

    const stages: StageData[] = lists.map(list => {
      // Stage-specific hooks: hooks referenced by edges from this stage that aren't global
      const stageHookIds = new Set<string>();
      for (const hid of list.activeHooks ?? []) {
        if (!globalHookIds.has(hid)) stageHookIds.add(hid);
      }
      // Also from edges originating here
      for (const edge of edgesByFrom.get(list.id) ?? []) {
        for (const hid of edge.hooks ?? []) {
          if (!globalHookIds.has(hid)) stageHookIds.add(hid);
        }
      }

      const stageHooks: ResolvedHook[] = [];
      for (const hid of stageHookIds) {
        const hook = hookById.get(hid);
        if (hook) stageHooks.push(resolveHook(hook, hookPathMap));
      }
      stageHooks.sort((a, b) => categoryOrder[a.category] - categoryOrder[b.category]);

      // Always-on agents: none currently (no source of truth for always-on)
      const alwaysOnAgents: ResolvedAgent[] = [];

      // Review teams: for edges entering this stage whose skill has agent-mode: team-review,
      // show the full agent roster as the review team
      const incomingEdges = edgesByTo.get(list.id) ?? [];
      const reviewTeamMap = new Map<string, ReviewTeam>();
      for (const edge of incomingEdges) {
        const cmdName = extractCommandName(edge.command);
        if (!cmdName) continue;

        const mode = getSkillMode(cmdName);
        if (mode !== 'team-review') continue;

        const skillCommand = edge.command ?? edge.label;
        if (!reviewTeamMap.has(skillCommand)) {
          reviewTeamMap.set(skillCommand, {
            skillCommand,
            skillPath: skillPathMap.get(cmdName) ?? null,
            agents: [...allAgents],
          });
        }
      }
      const reviewTeams = [...reviewTeamMap.values()];

      // Forward edges from this stage
      const forwardEdges: EdgeData[] = (edgesByFrom.get(list.id) ?? [])
        .filter(e => e.direction === 'forward' || e.direction === 'shortcut')
        .map(edge => {
          const cmdName = extractCommandName(edge.command);
          const edgeHookIds = (edge.hooks ?? []).filter(hid => !globalHookIds.has(hid));
          const edgeHooks: ResolvedHook[] = edgeHookIds
            .map(hid => hookById.get(hid))
            .filter((h): h is WorkflowHook => h !== undefined)
            .map(h => resolveHook(h, hookPathMap));
          return {
            edge,
            skillPath: cmdName ? (skillPathMap.get(cmdName) ?? null) : null,
            edgeHooks,
          };
        });

      // Backward edges from this stage
      const backwardEdges = (edgesByFrom.get(list.id) ?? []).filter(e => e.direction === 'backward');

      return {
        list,
        stageHooks,
        alwaysOnAgents,
        reviewTeams,
        forwardEdges,
        backwardEdges,
      };
    });

    return {
      globalHooks,
      stages,
      skillPathMap,
      hookPathMap,
      agentPathMap,
      orchestratesMap,
    };
  }, [overrideConfig, contextEngine, skillsTree, hooksTree, agentsTree]);
}
