import { describe, it, expect } from 'vitest';
import type { ConfigFileNode } from '../types';
import type { WorkflowHook } from '../../shared/workflow-config';
import {
  collectTreePaths,
  buildPathMap,
  extractCommandName,
  resolveHook,
  resolveAgent,
  buildHookPathMap,
  countHookAppearances,
  findGlobalHookIds,
  scanSkillFrontmatter,
  collectAgents,
  buildCanonicalNameByPath,
  resolveOrchestrationPaths,
  visitSkills,
  CATEGORY_ORDER,
  TEAM_HEX,
  EXCLUDED_FOLDERS,
} from './pipeline-data-utils';

// ─── Test Helpers ───────────────────────────────────────────

function makeFileNode(name: string, path: string, frontmatter?: Record<string, unknown>): ConfigFileNode {
  return { name, path, type: 'file', frontmatter };
}

function makeFolderNode(name: string, path: string, children: ConfigFileNode[]): ConfigFileNode {
  return { name, path, type: 'folder', children };
}

function makeHook(id: string, overrides?: Partial<WorkflowHook>): WorkflowHook {
  return {
    id,
    label: id,
    timing: 'before',
    type: 'shell',
    target: `.claude/hooks/${id}.sh`,
    category: 'guard',
    ...overrides,
  };
}

// ─── collectTreePaths ───────────────────────────────────────

describe('collectTreePaths', () => {
  it('returns empty set for empty nodes', () => {
    expect(collectTreePaths([])).toEqual(new Set());
  });

  it('collects file paths from flat list', () => {
    const nodes: ConfigFileNode[] = [
      makeFileNode('a.sh', 'hooks/a.sh'),
      makeFileNode('b.sh', 'hooks/b.sh'),
    ];
    expect(collectTreePaths(nodes)).toEqual(new Set(['hooks/a.sh', 'hooks/b.sh']));
  });

  it('collects paths recursively from nested folders', () => {
    const nodes: ConfigFileNode[] = [
      makeFolderNode('hooks', 'hooks', [
        makeFileNode('a.sh', 'hooks/a.sh'),
        makeFolderNode('sub', 'hooks/sub', [
          makeFileNode('b.sh', 'hooks/sub/b.sh'),
        ]),
      ]),
    ];
    expect(collectTreePaths(nodes)).toEqual(new Set(['hooks/a.sh', 'hooks/sub/b.sh']));
  });

  it('ignores folder nodes in result set', () => {
    const nodes: ConfigFileNode[] = [
      makeFolderNode('dir', 'dir', []),
    ];
    expect(collectTreePaths(nodes)).toEqual(new Set());
  });
});

// ─── buildPathMap ───────────────────────────────────────────

describe('buildPathMap', () => {
  it('returns empty map for empty nodes', () => {
    expect(buildPathMap([])).toEqual(new Map());
  });

  it('keys by folder name for nested files', () => {
    const nodes: ConfigFileNode[] = [
      makeFolderNode('scope-create', 'scope-create', [
        makeFileNode('SKILL.md', 'scope-create/SKILL.md'),
      ]),
    ];
    const map = buildPathMap(nodes);
    expect(map.get('scope-create')).toBe('scope-create/SKILL.md');
    expect(map.get('skill')).toBe('scope-create/SKILL.md');
  });

  it('keys by filename without extension for flat files', () => {
    const nodes: ConfigFileNode[] = [
      makeFileNode('pre-commit.sh', 'pre-commit.sh'),
    ];
    const map = buildPathMap(nodes);
    expect(map.get('pre-commit')).toBe('pre-commit.sh');
  });

  it('first match wins for duplicate keys', () => {
    const nodes: ConfigFileNode[] = [
      makeFolderNode('scope-create', 'scope-create', [
        makeFileNode('SKILL.md', 'scope-create/SKILL.md'),
      ]),
      makeFolderNode('scope-create', 'other/scope-create', [
        makeFileNode('SKILL.md', 'other/scope-create/SKILL.md'),
      ]),
    ];
    const map = buildPathMap(nodes);
    expect(map.get('scope-create')).toBe('scope-create/SKILL.md');
  });

  it('handles .md and .sh extensions', () => {
    const nodes: ConfigFileNode[] = [
      makeFileNode('guard.sh', 'hooks/guard.sh'),
      makeFileNode('readme.md', 'docs/readme.md'),
    ];
    const map = buildPathMap(nodes);
    expect(map.get('guard')).toBe('hooks/guard.sh');
    expect(map.get('readme')).toBe('docs/readme.md');
  });

  it('lowercases all keys', () => {
    const nodes: ConfigFileNode[] = [
      makeFolderNode('MySkill', 'MySkill', [
        makeFileNode('SKILL.md', 'MySkill/SKILL.md'),
      ]),
    ];
    const map = buildPathMap(nodes);
    expect(map.get('myskill')).toBe('MySkill/SKILL.md');
  });
});

// ─── extractCommandName ─────────────────────────────────────

describe('extractCommandName', () => {
  it('returns null for null input', () => {
    expect(extractCommandName(null)).toBeNull();
  });

  it('strips leading slash', () => {
    expect(extractCommandName('/scope-create')).toBe('scope-create');
  });

  it('strips trailing {id} placeholder', () => {
    expect(extractCommandName('/scope-create {id}')).toBe('scope-create');
  });

  it('handles command without slash', () => {
    expect(extractCommandName('scope-create')).toBe('scope-create');
  });

  it('handles command without placeholder', () => {
    expect(extractCommandName('/deploy')).toBe('deploy');
  });

  it('lowercases the result', () => {
    expect(extractCommandName('/Scope-Create {id}')).toBe('scope-create');
  });

  it('handles complex placeholders', () => {
    expect(extractCommandName('/scope-review {scope_id}')).toBe('scope-review');
  });

  it('returns empty string for empty command', () => {
    expect(extractCommandName('')).toBeNull();
  });
});

// ─── resolveHook ────────────────────────────────────────────

describe('resolveHook', () => {
  it('resolves a hook with file path from hookPathMap', () => {
    const hook = makeHook('pre-commit', { label: 'Pre-Commit', category: 'guard', description: 'Run checks' });
    const hookPathMap = new Map([['pre-commit', 'hooks/pre-commit.sh']]);
    const resolved = resolveHook(hook, hookPathMap);
    expect(resolved.id).toBe('pre-commit');
    expect(resolved.label).toBe('Pre-Commit');
    expect(resolved.category).toBe('guard');
    expect(resolved.enforcement).toBe('blocker');
    expect(resolved.filePath).toBe('hooks/pre-commit.sh');
    expect(resolved.timing).toBe('before');
    expect(resolved.blocking).toBe(false);
    expect(resolved.description).toBe('Run checks');
  });

  it('returns null filePath when not in hookPathMap', () => {
    const hook = makeHook('unknown');
    const resolved = resolveHook(hook, new Map());
    expect(resolved.filePath).toBeNull();
  });

  it('maps category to correct enforcement level', () => {
    const categories: Array<[WorkflowHook['category'], string]> = [
      ['guard', 'blocker'],
      ['gate', 'advisor'],
      ['lifecycle', 'operator'],
      ['observer', 'silent'],
    ];
    for (const [category, enforcement] of categories) {
      const hook = makeHook('test', { category });
      const resolved = resolveHook(hook, new Map());
      expect(resolved.enforcement).toBe(enforcement);
    }
  });

  it('uses blocking flag from hook definition', () => {
    const hook = makeHook('blocker', { blocking: true });
    const resolved = resolveHook(hook, new Map());
    expect(resolved.blocking).toBe(true);
  });
});

// ─── resolveAgent ───────────────────────────────────────────

describe('resolveAgent', () => {
  it('builds label from hyphenated agent ID', () => {
    const agent = resolveAgent('frontend-designer', new Map());
    expect(agent.label).toBe('Frontend Designer');
  });

  it('uses name from frontmatter when node is provided', () => {
    const node = makeFileNode('designer.md', 'agents/blue-team/designer.md', { name: 'UI Designer' });
    const agent = resolveAgent('designer', new Map(), node);
    expect(agent.label).toBe('UI Designer');
  });

  it('uses file path from node when provided', () => {
    const node = makeFileNode('a.md', 'agents/a.md');
    const agent = resolveAgent('a', new Map(), node);
    expect(agent.filePath).toBe('agents/a.md');
  });

  it('falls back to agentPathMap when no node', () => {
    const pathMap = new Map([['architect', 'agents/architect.md']]);
    const agent = resolveAgent('Architect', pathMap);
    expect(agent.filePath).toBe('agents/architect.md');
  });

  it('returns null filePath when no match', () => {
    const agent = resolveAgent('unknown', new Map());
    expect(agent.filePath).toBeNull();
  });
});

// ─── buildHookPathMap ───────────────────────────────────────

describe('buildHookPathMap', () => {
  it('returns empty map when no hooks match tree paths', () => {
    const hooks = [makeHook('h1', { target: '.claude/hooks/h1.sh' })];
    const treePaths = new Set<string>();
    expect(buildHookPathMap(hooks, treePaths)).toEqual(new Map());
  });

  it('maps hook IDs to tree-relative paths', () => {
    const hooks = [makeHook('h1', { target: '.claude/hooks/h1.sh' })];
    const treePaths = new Set(['h1.sh']);
    const result = buildHookPathMap(hooks, treePaths);
    expect(result.get('h1')).toBe('h1.sh');
  });

  it('strips the hooks prefix from target paths', () => {
    const hooks = [makeHook('guard', { target: '.claude/hooks/sub/guard.sh' })];
    const treePaths = new Set(['sub/guard.sh']);
    const result = buildHookPathMap(hooks, treePaths);
    expect(result.get('guard')).toBe('sub/guard.sh');
  });

  it('handles targets that do not start with the prefix', () => {
    const hooks = [makeHook('ext', { target: 'custom/ext.sh' })];
    const treePaths = new Set(['custom/ext.sh']);
    const result = buildHookPathMap(hooks, treePaths);
    expect(result.get('ext')).toBe('custom/ext.sh');
  });

  it('uses custom prefix', () => {
    const hooks = [makeHook('x', { target: 'custom/x.sh' })];
    const treePaths = new Set(['x.sh']);
    const result = buildHookPathMap(hooks, treePaths, 'custom/');
    expect(result.get('x')).toBe('x.sh');
  });
});

// ─── countHookAppearances ───────────────────────────────────

describe('countHookAppearances', () => {
  it('returns empty map with no lists or edges', () => {
    expect(countHookAppearances([], [])).toEqual(new Map());
  });

  it('counts hooks from list activeHooks', () => {
    const lists = [
      { id: 'backlog', activeHooks: ['h1', 'h2'] },
      { id: 'doing', activeHooks: ['h1'] },
    ];
    const result = countHookAppearances(lists, []);
    expect(result.get('h1')).toBe(2);
    expect(result.get('h2')).toBe(1);
  });

  it('counts hooks from edges', () => {
    const lists = [{ id: 'a' }, { id: 'b' }];
    const edges = [{ from: 'a', to: 'b', hooks: ['h1'] }];
    const result = countHookAppearances(lists, edges);
    // h1 appears on edge a->b, counted for stage a and stage b
    expect(result.get('h1')).toBe(2);
  });

  it('accumulates counts from both sources', () => {
    const lists = [
      { id: 'a', activeHooks: ['h1'] },
      { id: 'b', activeHooks: ['h1'] },
    ];
    const edges = [{ from: 'a', to: 'b', hooks: ['h1'] }];
    const result = countHookAppearances(lists, edges);
    // 2 from activeHooks + 2 from edges (a and b)
    expect(result.get('h1')).toBe(4);
  });
});

// ─── findGlobalHookIds ──────────────────────────────────────

describe('findGlobalHookIds', () => {
  it('returns empty set when no hooks meet threshold', () => {
    const counts = new Map([['h1', 1]]);
    expect(findGlobalHookIds(counts, 5)).toEqual(new Set());
  });

  it('includes hooks at or above threshold (listCount - 1)', () => {
    const counts = new Map([['h1', 4], ['h2', 2]]);
    // With 5 lists, threshold is 4
    const result = findGlobalHookIds(counts, 5);
    expect(result.has('h1')).toBe(true);
    expect(result.has('h2')).toBe(false);
  });

  it('uses minimum threshold of 1', () => {
    const counts = new Map([['h1', 1]]);
    // With 1 list, max(1, 1-1) = max(1, 0) = 1
    const result = findGlobalHookIds(counts, 1);
    expect(result.has('h1')).toBe(true);
  });

  it('handles empty counts map', () => {
    expect(findGlobalHookIds(new Map(), 3)).toEqual(new Set());
  });
});

// ─── scanSkillFrontmatter ───────────────────────────────────

describe('scanSkillFrontmatter', () => {
  it('returns empty maps for empty nodes', () => {
    const result = scanSkillFrontmatter([]);
    expect(result.agentModeByPath.size).toBe(0);
    expect(result.orchestratesByPath.size).toBe(0);
  });

  it('extracts agent-mode frontmatter', () => {
    const nodes: ConfigFileNode[] = [
      makeFileNode('SKILL.md', 'review/SKILL.md', { 'agent-mode': 'team-review' }),
    ];
    const result = scanSkillFrontmatter(nodes);
    expect(result.agentModeByPath.get('review/SKILL.md')).toBe('team-review');
  });

  it('extracts orchestrates frontmatter', () => {
    const nodes: ConfigFileNode[] = [
      makeFileNode('SKILL.md', 'deploy/SKILL.md', { orchestrates: ['build', 'test'] }),
    ];
    const result = scanSkillFrontmatter(nodes);
    expect(result.orchestratesByPath.get('deploy/SKILL.md')).toEqual(['build', 'test']);
  });

  it('filters non-string values from orchestrates', () => {
    const nodes: ConfigFileNode[] = [
      makeFileNode('SKILL.md', 's/SKILL.md', { orchestrates: ['build', 42, null, 'test'] }),
    ];
    const result = scanSkillFrontmatter(nodes);
    expect(result.orchestratesByPath.get('s/SKILL.md')).toEqual(['build', 'test']);
  });

  it('ignores empty orchestrates arrays', () => {
    const nodes: ConfigFileNode[] = [
      makeFileNode('SKILL.md', 's/SKILL.md', { orchestrates: [] }),
    ];
    const result = scanSkillFrontmatter(nodes);
    expect(result.orchestratesByPath.size).toBe(0);
  });

  it('recurses into children', () => {
    const nodes: ConfigFileNode[] = [
      makeFolderNode('skills', 'skills', [
        makeFileNode('SKILL.md', 'skills/review/SKILL.md', { 'agent-mode': 'solo' }),
      ]),
    ];
    const result = scanSkillFrontmatter(nodes);
    expect(result.agentModeByPath.get('skills/review/SKILL.md')).toBe('solo');
  });
});

// ─── collectAgents ──────────────────────────────────────────

describe('collectAgents', () => {
  it('returns empty array for empty tree', () => {
    expect(collectAgents([], new Map())).toEqual([]);
  });

  it('collects agents from team subfolders', () => {
    const tree: ConfigFileNode[] = [
      makeFolderNode('blue-team', 'blue-team', [
        makeFileNode('attacker.md', 'blue-team/attacker.md', { name: 'Attacker' }),
      ]),
    ];
    const agents = collectAgents(tree, new Map());
    expect(agents).toHaveLength(1);
    expect(agents[0].id).toBe('attacker');
    expect(agents[0].label).toBe('Attacker');
    expect(agents[0].team).toBe('blue-team');
    expect(agents[0].color).toBe('#3b82f6');
  });

  it('skips root-level files', () => {
    const tree: ConfigFileNode[] = [
      makeFileNode('readme.md', 'readme.md', { name: 'README' }),
    ];
    expect(collectAgents(tree, new Map())).toEqual([]);
  });

  it('skips excluded folders', () => {
    const tree: ConfigFileNode[] = [
      makeFolderNode('reference', 'reference', [
        makeFileNode('agent.md', 'reference/agent.md', { name: 'Ref' }),
      ]),
      makeFolderNode('workflows', 'workflows', [
        makeFileNode('agent.md', 'workflows/agent.md', { name: 'WF' }),
      ]),
    ];
    expect(collectAgents(tree, new Map())).toEqual([]);
  });

  it('skips files without frontmatter name', () => {
    const tree: ConfigFileNode[] = [
      makeFolderNode('red-team', 'red-team', [
        makeFileNode('agent.md', 'red-team/agent.md'),
      ]),
    ];
    expect(collectAgents(tree, new Map())).toEqual([]);
  });

  it('sorts agents by team then label', () => {
    const tree: ConfigFileNode[] = [
      makeFolderNode('red-team', 'red-team', [
        makeFileNode('b.md', 'red-team/b.md', { name: 'Zulu' }),
        makeFileNode('a.md', 'red-team/a.md', { name: 'Alpha' }),
      ]),
      makeFolderNode('blue-team', 'blue-team', [
        makeFileNode('c.md', 'blue-team/c.md', { name: 'Charlie' }),
      ]),
    ];
    const agents = collectAgents(tree, new Map());
    expect(agents.map(a => a.label)).toEqual(['Charlie', 'Alpha', 'Zulu']);
  });

  it('uses TEAM_HEX for known teams and fallback for unknown', () => {
    const tree: ConfigFileNode[] = [
      makeFolderNode('green-team', 'green-team', [
        makeFileNode('a.md', 'green-team/a.md', { name: 'A' }),
      ]),
      makeFolderNode('custom-team', 'custom-team', [
        makeFileNode('b.md', 'custom-team/b.md', { name: 'B' }),
      ]),
    ];
    const agents = collectAgents(tree, new Map());
    const green = agents.find(a => a.team === 'green-team');
    const custom = agents.find(a => a.team === 'custom-team');
    expect(green?.color).toBe('#22c55e');
    expect(custom?.color).toBe('#8B5CF6');
  });
});

// ─── buildCanonicalNameByPath ───────────────────────────────

describe('buildCanonicalNameByPath', () => {
  it('returns empty map for empty input', () => {
    expect(buildCanonicalNameByPath(new Map())).toEqual(new Map());
  });

  it('maps path to first non-skill name', () => {
    const skillPathMap = new Map([
      ['scope-create', 'scope-create/SKILL.md'],
      ['skill', 'scope-create/SKILL.md'],
    ]);
    const result = buildCanonicalNameByPath(skillPathMap);
    expect(result.get('scope-create/SKILL.md')).toBe('scope-create');
  });

  it('skips entries keyed by "skill"', () => {
    const skillPathMap = new Map([
      ['skill', 'only/SKILL.md'],
    ]);
    const result = buildCanonicalNameByPath(skillPathMap);
    expect(result.has('only/SKILL.md')).toBe(false);
  });

  it('first match wins for same path', () => {
    const skillPathMap = new Map([
      ['first-name', 'shared/SKILL.md'],
      ['second-name', 'shared/SKILL.md'],
    ]);
    const result = buildCanonicalNameByPath(skillPathMap);
    expect(result.get('shared/SKILL.md')).toBe('first-name');
  });
});

// ─── resolveOrchestrationPaths ──────────────────────────────

describe('resolveOrchestrationPaths', () => {
  it('returns empty map for empty input', () => {
    expect(resolveOrchestrationPaths(new Map(), new Map())).toEqual(new Map());
  });

  it('resolves sub-names to paths via skillPathMap', () => {
    const orchestratesByPath = new Map([
      ['parent/SKILL.md', ['build', 'test']],
    ]);
    const skillPathMap = new Map([
      ['build', 'build/SKILL.md'],
      ['test', 'test/SKILL.md'],
    ]);
    const result = resolveOrchestrationPaths(orchestratesByPath, skillPathMap);
    expect(result.get('parent/SKILL.md')).toEqual(['build/SKILL.md', 'test/SKILL.md']);
  });

  it('skips unresolvable sub-names', () => {
    const orchestratesByPath = new Map([
      ['parent/SKILL.md', ['known', 'unknown']],
    ]);
    const skillPathMap = new Map([['known', 'known/SKILL.md']]);
    const result = resolveOrchestrationPaths(orchestratesByPath, skillPathMap);
    expect(result.get('parent/SKILL.md')).toEqual(['known/SKILL.md']);
  });

  it('omits parents with no resolvable subs', () => {
    const orchestratesByPath = new Map([
      ['parent/SKILL.md', ['missing']],
    ]);
    const result = resolveOrchestrationPaths(orchestratesByPath, new Map());
    expect(result.has('parent/SKILL.md')).toBe(false);
  });
});

// ─── visitSkills ────────────────────────────────────────────

describe('visitSkills', () => {
  it('returns empty results for no edge skill paths', () => {
    const result = visitSkills([], new Map(), new Map());
    expect(result.activeSkills).toEqual([]);
    expect(result.activeSkillPaths.size).toBe(0);
  });

  it('visits root-level skills', () => {
    const edgePaths = ['a/SKILL.md', 'b/SKILL.md'];
    const names = new Map([['a/SKILL.md', 'alpha'], ['b/SKILL.md', 'beta']]);
    const result = visitSkills(edgePaths, new Map(), names);
    expect(result.activeSkills).toHaveLength(2);
    expect(result.activeSkills[0]).toEqual({ path: 'a/SKILL.md', name: 'alpha', parentPath: null, depth: 0 });
    expect(result.activeSkills[1]).toEqual({ path: 'b/SKILL.md', name: 'beta', parentPath: null, depth: 0 });
  });

  it('visits orchestrated sub-skills depth-first', () => {
    const edgePaths = ['parent/SKILL.md'];
    const orchMap = new Map([['parent/SKILL.md', ['child/SKILL.md']]]);
    const names = new Map([['parent/SKILL.md', 'parent'], ['child/SKILL.md', 'child']]);
    const result = visitSkills(edgePaths, orchMap, names);
    expect(result.activeSkills).toHaveLength(2);
    expect(result.activeSkills[0].name).toBe('parent');
    expect(result.activeSkills[0].depth).toBe(0);
    expect(result.activeSkills[1].name).toBe('child');
    expect(result.activeSkills[1].depth).toBe(1);
    expect(result.activeSkills[1].parentPath).toBe('parent/SKILL.md');
  });

  it('avoids visiting the same skill twice (cycle protection)', () => {
    const edgePaths = ['a/SKILL.md'];
    const orchMap = new Map([
      ['a/SKILL.md', ['b/SKILL.md']],
      ['b/SKILL.md', ['a/SKILL.md']],
    ]);
    const names = new Map([['a/SKILL.md', 'a'], ['b/SKILL.md', 'b']]);
    const result = visitSkills(edgePaths, orchMap, names);
    expect(result.activeSkills).toHaveLength(2);
  });

  it('falls back to path as name when canonical name missing', () => {
    const edgePaths = ['x/SKILL.md'];
    const result = visitSkills(edgePaths, new Map(), new Map());
    expect(result.activeSkills[0].name).toBe('x/SKILL.md');
  });

  it('tracks all visited paths in activeSkillPaths set', () => {
    const edgePaths = ['a.md'];
    const orchMap = new Map([['a.md', ['b.md', 'c.md']]]);
    const names = new Map();
    const result = visitSkills(edgePaths, orchMap, names);
    expect(result.activeSkillPaths).toEqual(new Set(['a.md', 'b.md', 'c.md']));
  });
});

// ─── Constants ──────────────────────────────────────────────

describe('CATEGORY_ORDER', () => {
  it('has guard < gate < lifecycle < observer', () => {
    expect(CATEGORY_ORDER.guard).toBeLessThan(CATEGORY_ORDER.gate);
    expect(CATEGORY_ORDER.gate).toBeLessThan(CATEGORY_ORDER.lifecycle);
    expect(CATEGORY_ORDER.lifecycle).toBeLessThan(CATEGORY_ORDER.observer);
  });
});

describe('TEAM_HEX', () => {
  it('has colors for red, blue, green teams', () => {
    expect(TEAM_HEX['red-team']).toBe('#ef4444');
    expect(TEAM_HEX['blue-team']).toBe('#3b82f6');
    expect(TEAM_HEX['green-team']).toBe('#22c55e');
  });
});

describe('EXCLUDED_FOLDERS', () => {
  it('excludes reference and workflows', () => {
    expect(EXCLUDED_FOLDERS.has('reference')).toBe(true);
    expect(EXCLUDED_FOLDERS.has('workflows')).toBe(true);
    expect(EXCLUDED_FOLDERS.has('blue-team')).toBe(false);
  });
});
