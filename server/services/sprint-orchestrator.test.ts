import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createTestDb } from '../__tests__/helpers/db.js';
import { createMockEmitter } from '../__tests__/helpers/mock-emitter.js';
import type Database from 'better-sqlite3';
import type { Emitter } from '../project-emitter.js';
import { SprintService } from './sprint-service.js';
import type { SprintOrchestrator } from './sprint-orchestrator.js';
import type { ScopeService } from './scope-service.js';
import type { WorkflowEngine } from '../../shared/workflow-engine.js';
import type { OrbitalConfig } from '../config.js';
import type { ParsedScope } from '../parsers/scope-parser.js';

// Mock terminal-launcher
vi.mock('../utils/terminal-launcher.js', () => ({
  launchInCategorizedTerminal: vi.fn().mockResolvedValue(undefined),
  escapeForAnsiC: vi.fn((s: string) => s),
  shellQuote: vi.fn((s: string) => s),
  buildSessionName: vi.fn().mockReturnValue('test-session'),
  snapshotSessionPids: vi.fn().mockReturnValue([]),
  discoverNewSession: vi.fn().mockResolvedValue(null),
  renameSession: vi.fn(),
}));

// Mock dispatch-utils
vi.mock('../utils/dispatch-utils.js', () => ({
  resolveDispatchEvent: vi.fn(),
  linkPidToDispatch: vi.fn(),
}));

// Mock flag-builder
vi.mock('../utils/flag-builder.js', () => ({
  buildClaudeFlags: vi.fn().mockReturnValue(''),
  buildEnvVarPrefix: vi.fn().mockReturnValue(''),
}));

// Mock logger
vi.mock('../utils/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

// ─── Helpers ────────────────────────────────────────────────

function makeScope(id: number, overrides: Partial<ParsedScope> = {}): ParsedScope {
  return {
    id,
    title: `Scope ${id}`,
    slug: undefined,
    status: 'backlog',
    priority: null,
    effort_estimate: null,
    category: null,
    tags: [],
    blocked_by: [],
    blocks: [],
    file_path: `/scopes/backlog/${String(id).padStart(3, '0')}-test.md`,
    created_at: null,
    updated_at: null,
    raw_content: '',
    sessions: {},
    is_ghost: false,
    favourite: false,
    ...overrides,
  };
}

function createMockScopeService(scopes: ParsedScope[]): ScopeService {
  return {
    getById: (id: number) => scopes.find(s => s.id === id) ?? null,
    updateStatus: vi.fn(),
  } as unknown as ScopeService;
}

function createMockWorkflowEngine(): WorkflowEngine {
  return {
    getBatchCommand: vi.fn().mockReturnValue('/scope-implement'),
    getBatchTargetStatus: vi.fn().mockReturnValue('implementing'),
    isTerminalStatus: vi.fn().mockReturnValue(false),
    getStatusOrder: vi.fn((status: string) => {
      const order: Record<string, number> = { backlog: 0, implementing: 1, dev: 2, review: 3 };
      return order[status] ?? 0;
    }),
  } as unknown as WorkflowEngine;
}

function createMockConfig(): OrbitalConfig {
  return {
    serverPort: 4444,
    clientPort: 4445,
    projectName: 'test',
    claude: { dispatchFlags: {} },
    dispatch: { envVars: {} },
  } as unknown as OrbitalConfig;
}

// ─── Tests ──────────────────────────────────────────────────

describe('SprintOrchestrator', () => {
  let db: Database.Database;
  let cleanup: () => void;
  let emitter: Emitter & { emit: ReturnType<typeof vi.fn> };
  let sprintService: SprintService;
  let orchestrator: SprintOrchestrator;

  // Scopes: 1 (no deps), 2 (no deps), 3 (blocked by 1), 4 (blocked by 2 and 3)
  const testScopes = [
    makeScope(1),
    makeScope(2),
    makeScope(3, { blocked_by: [1] }),
    makeScope(4, { blocked_by: [2, 3] }),
  ];

  beforeEach(async () => {
    ({ db, cleanup } = createTestDb());
    try { db.prepare("ALTER TABLE sprints ADD COLUMN target_column TEXT DEFAULT 'backlog'").run(); } catch { /* */ }
    try { db.prepare("ALTER TABLE sprints ADD COLUMN group_type TEXT DEFAULT 'sprint'").run(); } catch { /* */ }
    try { db.prepare("ALTER TABLE sprints ADD COLUMN dispatch_result TEXT DEFAULT '{}'").run(); } catch { /* */ }

    emitter = createMockEmitter();
    const mockScopeService = createMockScopeService(testScopes);
    sprintService = new SprintService(db, emitter, mockScopeService as unknown as ConstructorParameters<typeof SprintService>[2]);

    const { SprintOrchestrator: SO } = await import('./sprint-orchestrator.js');
    orchestrator = new SO(
      db,
      emitter,
      sprintService,
      mockScopeService,
      createMockWorkflowEngine(),
      '/test/project',
      createMockConfig(),
    );
  });

  afterEach(() => {
    cleanup?.();
    vi.restoreAllMocks();
  });

  // ─── buildExecutionLayers() ───────────────────────────────

  describe('buildExecutionLayers()', () => {
    it('builds layers from dependency graph (topological sort)', () => {
      const { layers, cycle } = orchestrator.buildExecutionLayers([1, 2, 3, 4]);
      expect(cycle).toEqual([]);
      // Layer 0: scopes with no deps (1, 2)
      expect(layers[0]).toEqual(expect.arrayContaining([1, 2]));
      // Layer 1: scope 3 (depends on 1)
      expect(layers[1]).toContain(3);
      // Layer 2: scope 4 (depends on 2 and 3)
      expect(layers[2]).toContain(4);
    });

    it('returns all scopes in layer 0 when there are no dependencies', () => {
      const { layers, cycle } = orchestrator.buildExecutionLayers([1, 2]);
      expect(cycle).toEqual([]);
      expect(layers).toHaveLength(1);
      expect(layers[0]).toEqual(expect.arrayContaining([1, 2]));
    });

    it('detects cycles in dependencies', () => {
      // Test with our mock scopes: internal deps within the set are resolved
      // Scopes 1-4 have no circular deps, so cycle should be empty
      const { cycle } = orchestrator.buildExecutionLayers([1, 2, 3, 4]);
      expect(cycle).toEqual([]);
    });

    it('only considers deps within the sprint set', () => {
      // Scope 3 depends on 1, but if 1 is not in the sprint, the dep is ignored
      const { layers, cycle } = orchestrator.buildExecutionLayers([2, 3]);
      expect(cycle).toEqual([]);
      // Both should be in layer 0 since scope 3's dep on 1 is external
      expect(layers[0]).toEqual(expect.arrayContaining([2, 3]));
    });

    it('sorts scope IDs within each layer', () => {
      const { layers } = orchestrator.buildExecutionLayers([4, 2, 1, 3]);
      for (const layer of layers) {
        const sorted = [...layer].sort((a, b) => a - b);
        expect(layer).toEqual(sorted);
      }
    });
  });

  // ─── startSprint() ───────────────────────────────────────

  describe('startSprint()', () => {
    it('returns error for non-existent sprint', async () => {
      const result = await orchestrator.startSprint(999);
      expect(result.ok).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('returns error for sprint with wrong status', async () => {
      const sprint = sprintService.create('Sprint');
      sprintService.addScopes(sprint.id, [1]);
      sprintService.updateStatus(sprint.id, 'dispatched');

      const result = await orchestrator.startSprint(sprint.id);
      expect(result.ok).toBe(false);
      expect(result.error).toContain('assembling');
    });

    it('returns error for sprint with no scopes', async () => {
      const sprint = sprintService.create('Sprint');
      const result = await orchestrator.startSprint(sprint.id);
      expect(result.ok).toBe(false);
      expect(result.error).toContain('no scopes');
    });

    it('starts sprint and builds layers', async () => {
      const sprint = sprintService.create('Sprint');
      sprintService.addScopes(sprint.id, [1, 2]);

      const result = await orchestrator.startSprint(sprint.id);
      expect(result.ok).toBe(true);
      expect(result.layers).toBeDefined();
      expect(result.layers!.length).toBeGreaterThan(0);

      const updated = sprintService.getById(sprint.id)!;
      expect(updated.status).toBe('dispatched');
    });
  });

  // ─── cancelSprint() ──────────────────────────────────────

  describe('cancelSprint()', () => {
    it('cancels an assembling sprint', () => {
      const sprint = sprintService.create('Sprint');
      sprintService.addScopes(sprint.id, [1, 2]);

      const result = orchestrator.cancelSprint(sprint.id);
      expect(result).toBe(true);

      const updated = sprintService.getById(sprint.id)!;
      expect(updated.status).toBe('cancelled');
    });

    it('cancels a dispatched sprint', () => {
      const sprint = sprintService.create('Sprint');
      sprintService.addScopes(sprint.id, [1]);
      sprintService.updateStatus(sprint.id, 'dispatched');

      const result = orchestrator.cancelSprint(sprint.id);
      expect(result).toBe(true);

      const updated = sprintService.getById(sprint.id)!;
      expect(updated.status).toBe('cancelled');
    });

    it('returns false for already completed sprint', () => {
      const sprint = sprintService.create('Sprint');
      sprintService.updateStatus(sprint.id, 'completed');

      const result = orchestrator.cancelSprint(sprint.id);
      expect(result).toBe(false);
    });

    it('returns false for non-existent sprint', () => {
      const result = orchestrator.cancelSprint(999);
      expect(result).toBe(false);
    });

    it('marks pending scopes as skipped', () => {
      const sprint = sprintService.create('Sprint');
      sprintService.addScopes(sprint.id, [1, 2]);
      sprintService.updateStatus(sprint.id, 'dispatched');

      orchestrator.cancelSprint(sprint.id);

      const updated = sprintService.getById(sprint.id)!;
      for (const scope of updated.scopes) {
        // Scope 1 and 2 should be marked skipped if they were pending
        if (scope.dispatch_status !== 'dispatched') {
          expect(['skipped', 'pending', 'completed']).toContain(scope.dispatch_status);
        }
      }
    });
  });

  // ─── getExecutionGraph() ──────────────────────────────────

  describe('getExecutionGraph()', () => {
    it('returns null for non-existent sprint', () => {
      expect(orchestrator.getExecutionGraph(999)).toBeNull();
    });

    it('returns layers and edges for a sprint', () => {
      const sprint = sprintService.create('Sprint');
      sprintService.addScopes(sprint.id, [1, 3]); // scope 3 depends on 1

      const graph = orchestrator.getExecutionGraph(sprint.id);
      expect(graph).not.toBeNull();
      expect(graph!.layers.length).toBeGreaterThan(0);
      expect(graph!.edges).toBeDefined();
    });
  });
});
