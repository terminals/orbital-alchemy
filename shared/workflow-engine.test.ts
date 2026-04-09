import { describe, it, expect } from 'vitest';
import { WorkflowEngine } from './workflow-engine.js';
import { MINIMAL_CONFIG, CONFIG_WITH_HOOKS, DEFAULT_CONFIG, INVALID_CONFIGS } from './__fixtures__/workflow-configs.js';

// ─── Constructor ──────────────────────────────────────────────

describe('WorkflowEngine', () => {
  describe('constructor', () => {
    it('creates engine from minimal config', () => {
      const engine = new WorkflowEngine(MINIMAL_CONFIG);
      expect(engine.getConfig().name).toBe('Minimal');
    });

    it('throws on empty lists', () => {
      expect(() => new WorkflowEngine(INVALID_CONFIGS.noLists)).toThrow('at least 1 list');
    });

    it('throws on empty edges', () => {
      expect(() => new WorkflowEngine(INVALID_CONFIGS.noEdges)).toThrow('at least 1 edge');
    });

    it('throws on two entry points', () => {
      expect(() => new WorkflowEngine(INVALID_CONFIGS.twoEntryPoints)).toThrow('exactly 1 entry point, found 2');
    });

    it('throws on zero entry points', () => {
      expect(() => new WorkflowEngine(INVALID_CONFIGS.zeroEntryPoints)).toThrow('exactly 1 entry point, found 0');
    });
  });

  // ─── reload() ─────────────────────────────────────────────────

  describe('reload()', () => {
    it('replaces config and rebuilds indexes', () => {
      const engine = new WorkflowEngine(MINIMAL_CONFIG);
      expect(engine.getLists()).toHaveLength(2);

      engine.reload(CONFIG_WITH_HOOKS);
      expect(engine.getLists()).toHaveLength(4);
      expect(engine.getConfig().name).toBe('With Hooks');
    });

    it('throws on invalid config during reload', () => {
      const engine = new WorkflowEngine(MINIMAL_CONFIG);
      expect(() => engine.reload(INVALID_CONFIGS.noLists)).toThrow();
    });
  });

  // ─── List Queries ─────────────────────────────────────────────

  describe('list queries', () => {
    const engine = new WorkflowEngine(DEFAULT_CONFIG);

    it('getLists() returns sorted by order', () => {
      const lists = engine.getLists();
      for (let i = 1; i < lists.length; i++) {
        expect(lists[i].order).toBeGreaterThanOrEqual(lists[i - 1].order);
      }
    });

    it('getList() returns correct list or undefined', () => {
      expect(engine.getList('icebox')?.label).toBe('Icebox');
      expect(engine.getList('nonexistent')).toBeUndefined();
    });

    it('getEntryPoint() returns the entry point', () => {
      const entry = engine.getEntryPoint();
      expect(entry.isEntryPoint).toBe(true);
      expect(entry.id).toBe('icebox');
    });

    it('getBatchLists() filters by supportsBatch', () => {
      const batch = engine.getBatchLists();
      expect(batch.length).toBeGreaterThan(0);
      expect(batch.every(l => l.supportsBatch)).toBe(true);
    });

    it('getSprintLists() filters by supportsSprint', () => {
      const sprint = engine.getSprintLists();
      expect(sprint.length).toBeGreaterThan(0);
      expect(sprint.every(l => l.supportsSprint)).toBe(true);
    });

    it('getBoardColumns() returns id, label, color tuples sorted by order', () => {
      const cols = engine.getBoardColumns();
      expect(cols[0]).toEqual({ id: 'icebox', label: 'Icebox', color: expect.any(String) });
      for (let i = 1; i < cols.length; i++) {
        const prevOrder = engine.getList(cols[i - 1].id)!.order;
        const currOrder = engine.getList(cols[i].id)!.order;
        expect(currOrder).toBeGreaterThanOrEqual(prevOrder);
      }
    });
  });

  // ─── Edge Queries ─────────────────────────────────────────────

  describe('edge queries', () => {
    const engine = new WorkflowEngine(DEFAULT_CONFIG);

    it('findEdge() returns edge or undefined', () => {
      const edge = engine.findEdge('icebox', 'planning');
      expect(edge).toBeDefined();
      expect(edge!.direction).toBe('forward');
      expect(engine.findEdge('icebox', 'main')).toBeUndefined();
    });

    it('isValidTransition() returns boolean', () => {
      expect(engine.isValidTransition('icebox', 'planning')).toBe(true);
      expect(engine.isValidTransition('icebox', 'main')).toBe(false);
    });

    it('getValidTargets() returns target IDs', () => {
      const targets = engine.getValidTargets('icebox');
      expect(targets).toContain('planning');
    });

    it('getValidTargets() returns empty for unknown status', () => {
      expect(engine.getValidTargets('nonexistent')).toEqual([]);
    });

    it('getAllEdges() returns all edges', () => {
      expect(engine.getAllEdges().length).toBe(DEFAULT_CONFIG.edges.length);
    });

    it('getEdgesByDirection() filters correctly', () => {
      const forward = engine.getEdgesByDirection('forward');
      expect(forward.every(e => e.direction === 'forward')).toBe(true);

      const backward = engine.getEdgesByDirection('backward');
      expect(backward.every(e => e.direction === 'backward')).toBe(true);
      expect(backward.length).toBeGreaterThan(0);
    });
  });

  // ─── validateTransition() ─────────────────────────────────────

  describe('validateTransition()', () => {
    const engine = new WorkflowEngine(CONFIG_WITH_HOOKS);

    it('rejects invalid target status', () => {
      const result = engine.validateTransition('backlog', 'nonexistent', 'patch');
      expect(result).toEqual({ ok: false, error: expect.stringContaining('Invalid status'), code: 'INVALID_STATUS' });
    });

    it('bulk-sync always succeeds', () => {
      expect(engine.validateTransition('shipped', 'backlog', 'bulk-sync')).toEqual({ ok: true });
    });

    it('rollback always succeeds', () => {
      expect(engine.validateTransition('shipped', 'backlog', 'rollback')).toEqual({ ok: true });
    });

    it('same status is always ok', () => {
      expect(engine.validateTransition('backlog', 'backlog', 'patch')).toEqual({ ok: true });
    });

    it('rejects non-existent edge', () => {
      const result = engine.validateTransition('backlog', 'shipped', 'patch');
      expect(result).toEqual({ ok: false, error: expect.stringContaining('not allowed'), code: 'INVALID_TRANSITION' });
    });

    it('rejects patch context on dispatchOnly edge', () => {
      const result = engine.validateTransition('backlog', 'active', 'patch');
      expect(result).toEqual({ ok: false, error: expect.stringContaining('requires dispatch'), code: 'DISPATCH_REQUIRED' });
    });

    it('allows dispatch context on dispatchOnly edge', () => {
      expect(engine.validateTransition('backlog', 'active', 'dispatch')).toEqual({ ok: true });
    });
  });

  // ─── Status Helpers ───────────────────────────────────────────

  describe('status helpers', () => {
    const engine = new WorkflowEngine(CONFIG_WITH_HOOKS);

    it('isValidStatus() returns true for known, false for unknown', () => {
      expect(engine.isValidStatus('backlog')).toBe(true);
      expect(engine.isValidStatus('nonexistent')).toBe(false);
    });

    it('isTerminalStatus() returns true for terminal statuses', () => {
      expect(engine.isTerminalStatus('shipped')).toBe(true);
      expect(engine.isTerminalStatus('backlog')).toBe(false);
    });

    it('getStatusOrder() returns numeric order or -1', () => {
      expect(engine.getStatusOrder('backlog')).toBe(0);
      expect(engine.getStatusOrder('active')).toBe(1);
      expect(engine.getStatusOrder('unknown')).toBe(-1);
    });

    it('isForwardMovement() compares orders', () => {
      expect(engine.isForwardMovement('backlog', 'active')).toBe(true);
      expect(engine.isForwardMovement('active', 'backlog')).toBe(false);
      expect(engine.isForwardMovement('active', 'active')).toBe(false);
    });
  });

  // ─── Commands ─────────────────────────────────────────────────

  describe('commands', () => {
    const engine = new WorkflowEngine(CONFIG_WITH_HOOKS);

    it('buildCommand() replaces {id} with scope ID', () => {
      const edge = engine.findEdge('backlog', 'active')!;
      expect(engine.buildCommand(edge, 42)).toBe('/scope-implement 42');
    });

    it('buildCommand() returns null when edge has no command', () => {
      const edge = engine.findEdge('active', 'backlog')!;
      expect(engine.buildCommand(edge, 1)).toBeNull();
    });

    it('isAllowedCommand() checks prefix list', () => {
      expect(engine.isAllowedCommand('/scope-implement 42')).toBe(true);
      expect(engine.isAllowedCommand('/git-main')).toBe(true);
      expect(engine.isAllowedCommand('/unknown-command')).toBe(false);
    });
  });

  // ─── Batch / Sprint ───────────────────────────────────────────

  describe('batch/sprint', () => {
    const engine = new WorkflowEngine(CONFIG_WITH_HOOKS);

    it('getBatchTargetStatus() finds first forward dispatchOnly edge target', () => {
      expect(engine.getBatchTargetStatus('backlog')).toBe('active');
    });

    it('getBatchTargetStatus() returns undefined for no match', () => {
      expect(engine.getBatchTargetStatus('shipped')).toBeUndefined();
    });

    it('getBatchCommand() strips {id} placeholder', () => {
      expect(engine.getBatchCommand('backlog')).toBe('/scope-implement');
    });

    it('getBatchCommand() returns undefined for no match', () => {
      expect(engine.getBatchCommand('shipped')).toBeUndefined();
    });
  });

  // ─── inferStatus() ────────────────────────────────────────────

  describe('inferStatus()', () => {
    const engine = new WorkflowEngine(CONFIG_WITH_HOOKS);

    it('returns null when no rules match event type', () => {
      expect(engine.inferStatus('UNKNOWN_EVENT', 'backlog', {})).toBeNull();
    });

    it('matches AGENT_STARTED to active status', () => {
      expect(engine.inferStatus('AGENT_STARTED', 'backlog', {})).toBe('active');
    });

    it('forwardOnly guard prevents backward movement', () => {
      // active (order 1) → active (order 1) — not forward, returns null
      expect(engine.inferStatus('AGENT_STARTED', 'active', {})).toBeNull();
    });

    it('handles SCOPE_STATUS_CHANGED with dataField resolution', () => {
      const result = engine.inferStatus('SCOPE_STATUS_CHANGED', 'backlog', { to: 'active' });
      expect(result).toBe('active');
    });

    it('SCOPE_STATUS_CHANGED with dataField returns null for empty value', () => {
      expect(engine.inferStatus('SCOPE_STATUS_CHANGED', 'backlog', { to: '' })).toBeNull();
    });

    it('handles dispatchResolution conditions', () => {
      const result = engine.inferStatus('AGENT_COMPLETED', 'active', { outcome: 'success' });
      expect(result).toEqual({ dispatchResolution: true, resolution: 'completed' });
    });

    it('handles dispatchResolution with failure outcome', () => {
      const result = engine.inferStatus('AGENT_COMPLETED', 'active', { outcome: 'failure' });
      expect(result).toEqual({ dispatchResolution: true, resolution: 'failed' });
    });
  });

  // ─── Generation ───────────────────────────────────────────────

  describe('generation', () => {
    const engine = new WorkflowEngine(MINIMAL_CONFIG);

    it('generateCSSVariables() produces correct format', () => {
      const css = engine.generateCSSVariables();
      expect(css).toContain('--status-todo:');
      expect(css).toContain('--status-done:');
    });

    it('generateShellManifest() produces valid bash structure', () => {
      const manifest = engine.generateShellManifest();
      expect(manifest).toContain('#!/bin/bash');
      expect(manifest).toContain('WORKFLOW_STATUSES="todo done"');
      expect(manifest).toContain('WORKFLOW_ENTRY_STATUS="todo"');
      expect(manifest).toContain('WORKFLOW_TERMINAL_STATUSES="done"');
      expect(manifest).toContain('WORKFLOW_EDGES=(');
      expect(manifest).toContain('is_valid_status()');
    });
  });

  // ─── Git / Lifecycle ──────────────────────────────────────────

  describe('git/lifecycle', () => {
    const engine = new WorkflowEngine(CONFIG_WITH_HOOKS);

    it('getListByGitBranch() finds the right list', () => {
      expect(engine.getListByGitBranch('main')?.id).toBe('shipped');
    });

    it('getListByGitBranch() returns undefined for unknown branch', () => {
      expect(engine.getListByGitBranch('feature/foo')).toBeUndefined();
    });

    it('getGitBranch() returns branch or undefined', () => {
      expect(engine.getGitBranch('shipped')).toBe('main');
      expect(engine.getGitBranch('backlog')).toBeUndefined();
    });

    it('getSessionKey() returns session key or undefined', () => {
      expect(engine.getSessionKey('active')).toBe('implementScope');
      expect(engine.getSessionKey('backlog')).toBeUndefined();
    });

    it('getActiveHooksForList() returns empty for list without activeHooks', () => {
      expect(engine.getActiveHooksForList('backlog')).toEqual([]);
    });

    it('getAgentsForEdge() returns agents array', () => {
      expect(engine.getAgentsForEdge('backlog', 'active')).toEqual(['architect']);
    });

    it('getAgentsForEdge() returns empty for edge without agents', () => {
      expect(engine.getAgentsForEdge('active', 'backlog')).toEqual([]);
    });
  });

  // ─── Hooks ────────────────────────────────────────────────────

  describe('hooks', () => {
    const engine = new WorkflowEngine(CONFIG_WITH_HOOKS);

    it('getHooksForEdge() resolves hook IDs to hook objects', () => {
      const hooks = engine.getHooksForEdge('backlog', 'active');
      expect(hooks).toHaveLength(1);
      expect(hooks[0].id).toBe('blocker-check');
    });

    it('getHooksForEdge() returns empty for edge without hooks', () => {
      const engine2 = new WorkflowEngine(MINIMAL_CONFIG);
      expect(engine2.getHooksForEdge('todo', 'done')).toEqual([]);
    });

    it('getAllHooks() returns all hooks', () => {
      expect(engine.getAllHooks()).toHaveLength(4);
    });

    it('getHookEnforcement() maps category correctly', () => {
      const guard = engine.getAllHooks().find(h => h.category === 'guard')!;
      expect(engine.getHookEnforcement(guard)).toBe('blocker');

      const gate = engine.getAllHooks().find(h => h.category === 'gate')!;
      expect(engine.getHookEnforcement(gate)).toBe('advisor');
    });

    it('getHooksByCategory() filters by category', () => {
      const guards = engine.getHooksByCategory('guard');
      expect(guards.every(h => h.category === 'guard')).toBe(true);
      expect(guards.length).toBe(1);
    });
  });

  // ─── Config Access ────────────────────────────────────────────

  describe('config access', () => {
    it('getBranchingMode() returns trunk by default', () => {
      const engine = new WorkflowEngine(MINIMAL_CONFIG);
      expect(engine.getBranchingMode()).toBe('trunk');
    });

    it('getBranchingMode() returns configured value', () => {
      const engine = new WorkflowEngine(DEFAULT_CONFIG);
      expect(engine.getBranchingMode()).toBe('trunk');
    });
  });
});
