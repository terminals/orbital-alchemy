import { useMemo } from 'react';
import { useWorkflow } from './useWorkflow';
import { useConfigTree } from './useConfigTree';
import type {
  ResolvedHook,
  ResolvedAgent,
  ReviewTeam,
  StageData,
  EdgeData,
  PipelineData,
} from '@/types';
import type { WorkflowConfig, WorkflowHook, WorkflowEdge, HookCategory } from '../../shared/workflow-config';
import { WorkflowEngine } from '../../shared/workflow-engine';
import {
  collectTreePaths,
  buildPathMap,
  extractCommandName,
  resolveHook,
  scanSkillFrontmatter,
  collectAgents,
  buildHookPathMap,
  countHookAppearances,
  findGlobalHookIds,
  buildCanonicalNameByPath,
  resolveOrchestrationPaths,
  visitSkills,
  CATEGORY_ORDER,
} from './pipeline-data-utils';

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
    const hookPathMap = buildHookPathMap(allHooks, hookTreePaths);

    // Build hook lookup
    const hookById = new Map(allHooks.map(h => [h.id, h]));

    // ─── Resolve hooks per list and detect globals ─────
    // A hook is "global" if it appears on all-but-one or more stages' edges
    const hookAppearanceCount = countHookAppearances(lists, allEdges);
    const globalHookIds = findGlobalHookIds(hookAppearanceCount, lists.length);

    const globalHooks: ResolvedHook[] = [];
    for (const hid of globalHookIds) {
      const hook = hookById.get(hid);
      if (hook) globalHooks.push(resolveHook(hook, hookPathMap));
    }
    // Sort: guards first, then gates, lifecycle, observer
    globalHooks.sort((a, b) => CATEGORY_ORDER[a.category] - CATEGORY_ORDER[b.category]);

    // ─── Build skill frontmatter maps keyed by tree path ───
    // Then we can look up by path (via skillPathMap) instead of by folder name.
    const { agentModeByPath, orchestratesByPath } = scanSkillFrontmatter(skillsTree);

    // Convenience: resolve a command name to skill frontmatter via skillPathMap
    function getSkillMode(cmdName: string): string | undefined {
      const p = skillPathMap.get(cmdName);
      return p ? agentModeByPath.get(p) : undefined;
    }

    // ─── Build full agent roster from agents config tree ─────
    // Only collect .md files inside team subfolders (e.g., blue-team/attacker.md).
    // Root-level files are docs, and reference/workflows are not agent specs.
    const allAgents = collectAgents(agentsTree, agentPathMap);

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
      stageHooks.sort((a, b) => CATEGORY_ORDER[a.category] - CATEGORY_ORDER[b.category]);

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

    // ─── Active primitives (skills + agents + hooks) ──
    // Single source of truth for which files show in the "Active" section
    // of the Primitives page. Skills include transitive sub-skills reached
    // via the `orchestrates` frontmatter field.

    // Hooks: global + stage + edge hooks, keyed by file path.
    const activeHookPaths = new Set<string>();
    const hookCategoryMap = new Map<string, HookCategory>();
    const allResolvedHooks = [
      ...globalHooks,
      ...stages.flatMap(s => s.stageHooks),
      ...stages.flatMap(s => s.forwardEdges.flatMap(e => e.edgeHooks)),
    ];
    for (const hook of allResolvedHooks) {
      if (hook.filePath) {
        activeHookPaths.add(hook.filePath);
        hookCategoryMap.set(hook.filePath, hook.category);
      }
    }
    // Category map for inactive hooks too, so the tree can still color them.
    for (const hook of allHooks) {
      const filePath = hookPathMap.get(hook.id);
      if (filePath && !hookCategoryMap.has(filePath)) {
        hookCategoryMap.set(filePath, hook.category);
      }
    }

    // Agents: always-on + review teams.
    const activeAgentPaths = new Set<string>();
    for (const stage of stages) {
      for (const agent of stage.alwaysOnAgents) {
        if (agent.filePath) activeAgentPaths.add(agent.filePath);
      }
      for (const team of stage.reviewTeams) {
        for (const agent of team.agents) {
          if (agent.filePath) activeAgentPaths.add(agent.filePath);
        }
      }
    }

    // Skills: directly on edges + transitively reached via `orchestrates`.
    const orchSubPathsByParentPath = resolveOrchestrationPaths(orchestratesByPath, skillPathMap);

    // Seed BFS from paths of edge commands that resolve to a skill file.
    const edgeSkillPaths: string[] = [];
    const seenEdgeSkillPaths = new Set<string>();
    for (const stage of stages) {
      for (const edge of stage.forwardEdges) {
        if (edge.skillPath && !seenEdgeSkillPaths.has(edge.skillPath)) {
          seenEdgeSkillPaths.add(edge.skillPath);
          edgeSkillPaths.push(edge.skillPath);
        }
      }
    }

    const canonicalNameByPath = buildCanonicalNameByPath(skillPathMap);
    const { activeSkills, activeSkillPaths } = visitSkills(edgeSkillPaths, orchSubPathsByParentPath, canonicalNameByPath);

    return {
      globalHooks,
      stages,
      skillPathMap,
      hookPathMap,
      agentPathMap,
      activeSkills,
      activeSkillPaths,
      activeAgentPaths,
      activeHookPaths,
      hookCategoryMap,
    };
  }, [overrideConfig, contextEngine, skillsTree, hooksTree, agentsTree]);
}
