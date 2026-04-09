import { describe, it, expect } from 'vitest';
import { WorkflowNormalizer, PHASE_COLUMNS, allEnginesMatch } from './workflow-normalizer.js';
import { WorkflowEngine } from './workflow-engine.js';
import { DEFAULT_CONFIG, MINIMAL_CONFIG } from './__fixtures__/workflow-configs.js';

describe('PHASE_COLUMNS', () => {
  it('has 4 entries in correct order', () => {
    expect(PHASE_COLUMNS).toHaveLength(4);
    expect(PHASE_COLUMNS.map(c => c.phase)).toEqual(['queued', 'active', 'review', 'shipped']);
    expect(PHASE_COLUMNS.map(c => c.order)).toEqual([0, 1, 2, 3]);
  });
});

describe('WorkflowNormalizer', () => {
  const engine = new WorkflowEngine(DEFAULT_CONFIG);
  const normalizer = new WorkflowNormalizer(engine);

  describe('phase inference with default config', () => {
    it('entry point (icebox) maps to queued', () => {
      expect(normalizer.getPhase('icebox')).toBe('queued');
    });

    it('planning group list maps to queued', () => {
      expect(normalizer.getPhase('planning')).toBe('queued');
    });

    it('backlog (planning group with reviewScope session) maps to queued', () => {
      expect(normalizer.getPhase('backlog')).toBe('queued');
    });

    it('implementing (sessionKey includes "implement") maps to active', () => {
      expect(normalizer.getPhase('implementing')).toBe('active');
    });

    it('review (sessionKey includes "review") maps to review', () => {
      expect(normalizer.getPhase('review')).toBe('review');
    });

    it('completed (sessionKey "commit") maps to review', () => {
      expect(normalizer.getPhase('completed')).toBe('review');
    });

    it('main (terminal status with gitBranch) maps to shipped', () => {
      expect(normalizer.getPhase('main')).toBe('shipped');
    });
  });

  describe('getPhase()', () => {
    it('returns queued for unknown list ID (default)', () => {
      expect(normalizer.getPhase('nonexistent')).toBe('queued');
    });
  });

  describe('getListsForPhase()', () => {
    it('returns all lists for a given phase', () => {
      const queued = normalizer.getListsForPhase('queued');
      expect(queued.length).toBeGreaterThan(0);
      for (const list of queued) {
        expect(normalizer.getPhase(list.id)).toBe('queued');
      }
    });

    it('shipped phase includes main', () => {
      const shipped = normalizer.getListsForPhase('shipped');
      expect(shipped.some(l => l.id === 'main')).toBe(true);
    });
  });

  describe('getPhaseMap()', () => {
    it('returns a map covering all lists', () => {
      const map = normalizer.getPhaseMap();
      const lists = engine.getLists();
      for (const list of lists) {
        expect(map.has(list.id)).toBe(true);
      }
    });
  });

  describe('resolveNormalizedTransition()', () => {
    it('returns edges from a list to a target phase', () => {
      // icebox → planning is forward, planning maps to queued
      const edges = normalizer.resolveNormalizedTransition('icebox', 'queued');
      expect(edges.length).toBeGreaterThan(0);
      expect(edges[0].from).toBe('icebox');
    });

    it('returns empty when no edges match', () => {
      // icebox has no edge to any shipped-phase list
      const edges = normalizer.resolveNormalizedTransition('icebox', 'shipped');
      expect(edges).toEqual([]);
    });
  });
});

describe('allEnginesMatch()', () => {
  it('returns true for empty array', () => {
    expect(allEnginesMatch([])).toBe(true);
  });

  it('returns true for single engine', () => {
    expect(allEnginesMatch([new WorkflowEngine(DEFAULT_CONFIG)])).toBe(true);
  });

  it('returns true when all engines have same lists', () => {
    const engines = [
      new WorkflowEngine(DEFAULT_CONFIG),
      new WorkflowEngine(DEFAULT_CONFIG),
    ];
    expect(allEnginesMatch(engines)).toBe(true);
  });

  it('returns false when engines differ', () => {
    const engines = [
      new WorkflowEngine(DEFAULT_CONFIG),
      new WorkflowEngine(MINIMAL_CONFIG),
    ];
    expect(allEnginesMatch(engines)).toBe(false);
  });
});
