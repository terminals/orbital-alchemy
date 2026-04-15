import type {
  ConfigFileNode,
  ResolvedHook,
  ResolvedAgent,
  ActiveSkillEntry,
} from '../types';
import { AGENT_EMOJI, AGENT_COLOR } from '../types';
import type { WorkflowHook, HookCategory } from '../../shared/workflow-config';
import { getHookEnforcement } from '../../shared/workflow-config';

// ─── Types ──────────────────────────────────────────────────

export const CATEGORY_ORDER: Record<HookCategory, number> = {
  guard: 0,
  gate: 1,
  lifecycle: 2,
  observer: 3,
};

export const TEAM_HEX: Record<string, string> = {
  'red-team': '#ef4444',
  'blue-team': '#3b82f6',
  'green-team': '#22c55e',
};

export const EXCLUDED_FOLDERS = new Set(['reference', 'workflows']);

// ─── Pure Functions ─────────────────────────────────────────

/** Collect all tree-relative file paths into a set */
export function collectTreePaths(nodes: ConfigFileNode[]): Set<string> {
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
 * Build a map from logical name -> tree-relative path for skills/agents.
 * Keys by parent folder name (preferred for SKILL.md/AGENT.md pattern) and
 * filename-without-extension. First match wins -- no silent overwrites.
 */
export function buildPathMap(nodes: ConfigFileNode[]): Map<string, string> {
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

/** Extract command name from edge command string: "/scope-create {id}" -> "scope-create" */
export function extractCommandName(command: string | null): string | null {
  if (!command) return null;
  return command.replace(/^\//, '').replace(/\s+\{.*\}$/, '').toLowerCase();
}

/** Resolve a WorkflowHook to a ResolvedHook with file path info */
export function resolveHook(hook: WorkflowHook, hookPathMap: Map<string, string>): ResolvedHook {
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

/** Resolve an agent ID (and optional config tree node) to a ResolvedAgent */
export function resolveAgent(
  agentId: string,
  agentPathMap: Map<string, string>,
  node?: ConfigFileNode,
): ResolvedAgent {
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

/** Build hook path map from hook definitions validated against actual files in the hooks tree */
export function buildHookPathMap(
  allHooks: readonly WorkflowHook[],
  hookTreePaths: Set<string>,
  hooksPrefix: string = '.claude/hooks/',
): Map<string, string> {
  const hookPathMap = new Map<string, string>();
  for (const hook of allHooks) {
    const treePath = hook.target.startsWith(hooksPrefix)
      ? hook.target.slice(hooksPrefix.length)
      : hook.target;
    if (hookTreePaths.has(treePath)) {
      hookPathMap.set(hook.id, treePath);
    }
  }
  return hookPathMap;
}

/**
 * Count how many stages reference each hook (via activeHooks and edges).
 * Returns a map from hook ID to number of stages it appears in.
 */
export function countHookAppearances(
  lists: ReadonlyArray<{ id: string; activeHooks?: string[] }>,
  allEdges: ReadonlyArray<{ from: string; to: string; hooks?: string[] }>,
): Map<string, number> {
  const hookAppearanceCount = new Map<string, number>();
  const listIds = lists.map(l => l.id);

  // Count from activeHooks on each list
  for (const list of lists) {
    const hookIds = new Set(list.activeHooks ?? []);
    for (const hid of hookIds) {
      hookAppearanceCount.set(hid, (hookAppearanceCount.get(hid) ?? 0) + 1);
    }
  }

  // Also count from edges referencing each stage
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

  return hookAppearanceCount;
}

/**
 * Determine which hooks are "global" (appear in all-but-one or more stages).
 */
export function findGlobalHookIds(
  hookAppearanceCount: Map<string, number>,
  listCount: number,
): Set<string> {
  const globalThreshold = Math.max(1, listCount - 1);
  const globalHookIds = new Set<string>();
  for (const [hid, count] of hookAppearanceCount) {
    if (count >= globalThreshold) globalHookIds.add(hid);
  }
  return globalHookIds;
}

/** Scan skill config tree nodes for agent-mode and orchestrates frontmatter */
export function scanSkillFrontmatter(nodes: ConfigFileNode[]): {
  agentModeByPath: Map<string, string>;
  orchestratesByPath: Map<string, string[]>;
} {
  const agentModeByPath = new Map<string, string>();
  const orchestratesByPath = new Map<string, string[]>();

  function visit(nodeList: ConfigFileNode[]) {
    for (const node of nodeList) {
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
      if (node.children) visit(node.children);
    }
  }

  visit(nodes);
  return { agentModeByPath, orchestratesByPath };
}

/**
 * Collect all agents from the config tree, filtering out excluded folders
 * and root-level files.
 */
export function collectAgents(
  agentsTree: ConfigFileNode[],
  agentPathMap: Map<string, string>,
): ResolvedAgent[] {
  const allAgents: ResolvedAgent[] = [];

  function visit(nodes: ConfigFileNode[], teamFolder: string | null) {
    for (const node of nodes) {
      if (node.type === 'folder') {
        if (!EXCLUDED_FOLDERS.has(node.name.toLowerCase()) && node.children) {
          visit(node.children, node.name);
        }
      } else if (teamFolder && node.name.endsWith('.md') && node.frontmatter?.['name']) {
        const id = node.name.replace(/\.md$/, '').toLowerCase();
        const agent = resolveAgent(id, agentPathMap, node);
        agent.team = teamFolder;
        agent.color = TEAM_HEX[teamFolder.toLowerCase()] ?? (agent.color || '#8B5CF6');
        allAgents.push(agent);
      }
    }
  }

  visit(agentsTree, null);
  // Sort agents by team then label
  allAgents.sort((a, b) => {
    if (a.team !== b.team) return (a.team ?? '').localeCompare(b.team ?? '');
    return a.label.localeCompare(b.label);
  });

  return allAgents;
}

/**
 * Build canonical name lookup: given a skill path, find its canonical (folder) name.
 */
export function buildCanonicalNameByPath(skillPathMap: Map<string, string>): Map<string, string> {
  const canonicalNameByPath = new Map<string, string>();
  for (const [name, path] of skillPathMap) {
    if (name === 'skill') continue;
    if (!canonicalNameByPath.has(path)) canonicalNameByPath.set(path, name);
  }
  return canonicalNameByPath;
}

/**
 * Resolve orchestrates sub-names to sub-paths, keyed by parent path.
 */
export function resolveOrchestrationPaths(
  orchestratesByPath: Map<string, string[]>,
  skillPathMap: Map<string, string>,
): Map<string, string[]> {
  const orchSubPathsByParentPath = new Map<string, string[]>();
  for (const [parentPath, subNames] of orchestratesByPath) {
    const subPaths: string[] = [];
    for (const sub of subNames) {
      const p = skillPathMap.get(sub.toLowerCase());
      if (p) subPaths.push(p);
    }
    if (subPaths.length > 0) orchSubPathsByParentPath.set(parentPath, subPaths);
  }
  return orchSubPathsByParentPath;
}

/**
 * Visit skills depth-first, emitting parents before children so the render
 * loop can stream the list directly into [parent, child, child, ...].
 */
export function visitSkills(
  edgeSkillPaths: string[],
  orchSubPathsByParentPath: Map<string, string[]>,
  canonicalNameByPath: Map<string, string>,
): { activeSkills: ActiveSkillEntry[]; activeSkillPaths: Set<string> } {
  const activeSkills: ActiveSkillEntry[] = [];
  const activeSkillPaths = new Set<string>();

  function visit(path: string, parentPath: string | null, depth: number) {
    if (activeSkillPaths.has(path)) return;
    activeSkillPaths.add(path);
    activeSkills.push({
      path,
      name: canonicalNameByPath.get(path) ?? path,
      parentPath,
      depth,
    });
    const subs = orchSubPathsByParentPath.get(path);
    if (subs) {
      for (const subPath of subs) visit(subPath, path, depth + 1);
    }
  }

  for (const path of edgeSkillPaths) visit(path, null, 0);
  return { activeSkills, activeSkillPaths };
}
