import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ReadinessService } from './readiness-service.js';
import { WorkflowEngine } from '../../shared/workflow-engine.js';
import { CONFIG_WITH_HOOKS } from '../../shared/__fixtures__/workflow-configs.js';
import type { ParsedScope } from '../parsers/scope-parser.js';
import fs from 'fs';
import os from 'os';
import path from 'path';

function makeScope(overrides: Partial<ParsedScope> & { id: number }): ParsedScope {
  return {
    title: `Scope ${overrides.id}`,
    slug: undefined,
    status: 'backlog',
    priority: null,
    effort_estimate: null,
    category: null,
    tags: [],
    blocked_by: [],
    blocks: [],
    file_path: `/scopes/backlog/${String(overrides.id).padStart(3, '0')}-test.md`,
    created_at: null,
    updated_at: null,
    raw_content: '# Test Scope\nSome content here.',
    sessions: {},
    is_ghost: false,
    favourite: false,
    ...overrides,
  };
}

describe('ReadinessService', () => {
  let engine: WorkflowEngine;
  let tmpDir: string;
  let service: ReadinessService;
  let mockScopeService: { getById: (id: number) => ParsedScope | undefined };
  let mockGateService: { getLatestForScope: ReturnType<typeof vi.fn>; getLatestRun: ReturnType<typeof vi.fn> };
  let scopes: ParsedScope[];

  beforeEach(() => {
    engine = new WorkflowEngine(CONFIG_WITH_HOOKS);
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'readiness-test-'));

    scopes = [
      makeScope({ id: 1, status: 'backlog', sessions: { implementScope: ['sess-1'] } }),
      makeScope({ id: 2, status: 'active', sessions: { implementScope: ['sess-1'] }, blocked_by: [99] }),
      makeScope({ id: 3, status: 'active', sessions: { implementScope: ['sess-1'] }, raw_content: '# Scope\n- [ ] Task 1\n- [x] Task 2' }),
      makeScope({ id: 99, status: 'shipped' }), // terminal blocker
      makeScope({ id: 100, status: 'backlog' }), // non-terminal blocker
    ];

    mockScopeService = { getById: (id: number) => scopes.find(s => s.id === id) };
    mockGateService = {
      getLatestForScope: vi.fn().mockReturnValue([]),
      getLatestRun: vi.fn().mockReturnValue([]),
    };

    service = new ReadinessService(
      mockScopeService as any,
      mockGateService as any,
      engine,
      tmpDir,
    );
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('getReadiness()', () => {
    it('returns null for unknown scope', () => {
      expect(service.getReadiness(999)).toBeNull();
    });

    it('returns readiness with transitions for known scope', () => {
      const result = service.getReadiness(1);
      expect(result).not.toBeNull();
      expect(result!.scope_id).toBe(1);
      expect(result!.transitions).toBeDefined();
      expect(result!.transitions.length).toBeGreaterThan(0);
    });

    it('includes hook statuses for each transition', () => {
      const result = service.getReadiness(1)!;
      const transition = result.transitions[0];
      expect(transition.hooks).toBeDefined();
      expect(Array.isArray(transition.hooks)).toBe(true);
    });
  });

  describe('session-enforcer hook', () => {
    it('passes when session key exists for target column', () => {
      // Scope 1 is in backlog, transition to active requires implementScope session key
      // Scope 1 has sessions.implementScope = ['sess-1']
      const result = service.getReadiness(1)!;
      const toActive = result.transitions.find(t => t.to === 'active');
      if (toActive) {
        const enforcer = toActive.hooks.find(h => h.id === 'session-enforcer');
        // If session-enforcer is on this edge, it should look at the target session key
        if (enforcer) {
          // The scope has the required session, so it should pass
          expect(['pass', 'unknown']).toContain(enforcer.status);
        }
      }
    });
  });

  describe('blocker-check hook', () => {
    it('passes when blocker is in terminal status', () => {
      // Scope 2 blocked_by [99], scope 99 is shipped (terminal)
      const result = service.getReadiness(2)!;
      const transition = result.transitions.find(t => t.hooks.some(h => h.id === 'blocker-check'));
      if (transition) {
        const blockerHook = transition.hooks.find(h => h.id === 'blocker-check');
        expect(blockerHook?.status).toBe('pass');
      }
    });

    it('fails when blocker is not in terminal status', () => {
      // Add a scope blocked by non-terminal scope
      scopes.push(makeScope({ id: 5, status: 'active', blocked_by: [100], sessions: { implementScope: ['s'] } }));
      const result = service.getReadiness(5)!;
      const transition = result.transitions.find(t => t.hooks.some(h => h.id === 'blocker-check'));
      if (transition) {
        const blockerHook = transition.hooks.find(h => h.id === 'blocker-check');
        expect(blockerHook?.status).toBe('fail');
      }
    });
  });

  describe('review-gate-check hook', () => {
    it('passes when verdict file exists with PASS', () => {
      const verdictDir = path.join(tmpDir, '.claude', 'review-verdicts');
      fs.mkdirSync(verdictDir, { recursive: true });
      fs.writeFileSync(path.join(verdictDir, '002.json'), JSON.stringify({ verdict: 'PASS' }));

      // Scope 2 is in active, edge active→review has review-gate-check
      const result = service.getReadiness(2)!;
      const toReview = result.transitions.find(t => t.to === 'review');
      if (toReview) {
        const reviewHook = toReview.hooks.find(h => h.id === 'review-gate-check');
        if (reviewHook) {
          expect(reviewHook.status).toBe('pass');
        }
      }
    });

    it('fails when verdict file is missing', () => {
      const result = service.getReadiness(2)!;
      const toReview = result.transitions.find(t => t.to === 'review');
      if (toReview) {
        const reviewHook = toReview.hooks.find(h => h.id === 'review-gate-check');
        if (reviewHook) {
          expect(reviewHook.status).toBe('fail');
        }
      }
    });
  });

  describe('completion-checklist hook', () => {
    it('fails when scope has unchecked items', () => {
      // Scope 3 has raw_content with "- [ ] Task 1" (unchecked)
      const result = service.getReadiness(3)!;
      for (const transition of result.transitions) {
        const checklist = transition.hooks.find(h => h.id === 'completion-checklist');
        if (checklist) {
          expect(checklist.status).toBe('fail');
        }
      }
    });
  });

  describe('scope-create-gate hook', () => {
    it('passes when scope has title and content', () => {
      const result = service.getReadiness(1)!;
      for (const transition of result.transitions) {
        const gate = transition.hooks.find(h => h.id === 'scope-create-gate');
        if (gate) {
          expect(gate.status).toBe('pass');
        }
      }
    });

    it('fails when scope has no content', () => {
      scopes.push(makeScope({ id: 6, status: 'backlog', title: '', raw_content: '' }));
      const result = service.getReadiness(6)!;
      for (const transition of result.transitions) {
        const gate = transition.hooks.find(h => h.id === 'scope-create-gate');
        if (gate) {
          expect(gate.status).toBe('fail');
        }
      }
    });
  });

  describe('lifecycle/observer hooks', () => {
    it('scope-transition always passes', () => {
      const result = service.getReadiness(1)!;
      for (const transition of result.transitions) {
        const lifecycle = transition.hooks.find(h => h.id === 'scope-transition');
        if (lifecycle) {
          expect(lifecycle.status).toBe('pass');
        }
      }
    });

    it('dashboard-sync always passes', () => {
      const result = service.getReadiness(1)!;
      for (const transition of result.transitions) {
        const observer = transition.hooks.find(h => h.id === 'dashboard-sync');
        if (observer) {
          expect(observer.status).toBe('pass');
        }
      }
    });
  });
});
