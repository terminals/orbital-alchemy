import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createTestDb } from '../__tests__/helpers/db.js';
import { createMockEmitter } from '../__tests__/helpers/mock-emitter.js';
import type Database from 'better-sqlite3';
import type { Emitter } from '../project-emitter.js';
import { SprintService } from './sprint-service.js';
import type { BatchOrchestrator } from './batch-orchestrator.js';
import type { ScopeService } from './scope-service.js';
import type { WorkflowEngine } from '../../shared/workflow-engine.js';
import type { OrbitalConfig } from '../config.js';
import type { ParsedScope } from '../parsers/scope-parser.js';

// Mock terminal-launcher to prevent actual terminal launches
vi.mock('../utils/terminal-launcher.js', () => ({
  launchInCategorizedTerminal: vi.fn().mockResolvedValue(undefined),
  escapeForAnsiC: vi.fn((s: string) => s),
  shellQuote: vi.fn((s: string) => s),
  snapshotSessionPids: vi.fn().mockReturnValue([]),
  discoverNewSession: vi.fn().mockResolvedValue(null),
  isSessionPidAlive: vi.fn().mockReturnValue(false),
  renameSession: vi.fn(),
}));

// Mock dispatch-utils
vi.mock('../utils/dispatch-utils.js', () => ({
  linkPidToDispatch: vi.fn(),
  resolveDispatchEvent: vi.fn(),
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
    getBatchTargetStatus: vi.fn().mockReturnValue('dev'),
    isTerminalStatus: vi.fn().mockReturnValue(false),
    getStatusOrder: vi.fn().mockReturnValue(0),
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

describe('BatchOrchestrator', () => {
  let db: Database.Database;
  let cleanup: () => void;
  let emitter: Emitter & { emit: ReturnType<typeof vi.fn> };
  let sprintService: SprintService;
  let orchestrator: BatchOrchestrator;
  const testScopes = [
    makeScope(1),
    makeScope(2),
    makeScope(3, { blocked_by: [1] }),
  ];

  beforeEach(async () => {
    ({ db, cleanup } = createTestDb());
    // Add migration columns
    try { db.prepare("ALTER TABLE sprints ADD COLUMN target_column TEXT DEFAULT 'backlog'").run(); } catch { /* */ }
    try { db.prepare("ALTER TABLE sprints ADD COLUMN group_type TEXT DEFAULT 'sprint'").run(); } catch { /* */ }
    try { db.prepare("ALTER TABLE sprints ADD COLUMN dispatch_result TEXT DEFAULT '{}'").run(); } catch { /* */ }

    emitter = createMockEmitter();
    const mockScopeService = createMockScopeService(testScopes) as unknown as ConstructorParameters<typeof SprintService>[2];
    sprintService = new SprintService(db, emitter, mockScopeService);

    // Dynamically import BatchOrchestrator after mocks are set up
    const { BatchOrchestrator: BO } = await import('./batch-orchestrator.js');
    orchestrator = new BO(
      db,
      emitter,
      sprintService,
      createMockScopeService(testScopes),
      createMockWorkflowEngine(),
      '/test/project',
      createMockConfig(),
    );
  });

  afterEach(() => {
    cleanup?.();
    vi.restoreAllMocks();
  });

  // ─── dispatch() validation ────────────────────────────────

  describe('dispatch() validation', () => {
    it('returns error for non-existent batch', async () => {
      const result = await orchestrator.dispatch(999);
      expect(result.ok).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('returns error for non-batch group', async () => {
      const sprint = sprintService.create('Sprint', { group_type: 'sprint' });
      const result = await orchestrator.dispatch(sprint.id);
      expect(result.ok).toBe(false);
      expect(result.error).toContain('Not a batch');
    });

    it('returns error for already dispatched batch', async () => {
      const batch = sprintService.create('Batch', { group_type: 'batch' });
      sprintService.addScopes(batch.id, [1]);
      sprintService.updateStatus(batch.id, 'dispatched');

      const result = await orchestrator.dispatch(batch.id);
      expect(result.ok).toBe(false);
      expect(result.error).toContain('assembling');
    });

    it('returns error for batch with no scopes', async () => {
      const batch = sprintService.create('Batch', { group_type: 'batch' });
      const result = await orchestrator.dispatch(batch.id);
      expect(result.ok).toBe(false);
      expect(result.error).toContain('no scopes');
    });
  });

  // ─── dispatch() mergeMode validation ─────────────────────

  describe('dispatch() mergeMode', () => {
    it('defaults invalid mergeMode to push', async () => {
      const batch = sprintService.create('Batch', { group_type: 'batch', target_column: 'backlog' });
      sprintService.addScopes(batch.id, [1]);

      const result = await orchestrator.dispatch(batch.id, 'invalid-mode');
      // Dispatch succeeds (mergeMode defaults to 'push')
      expect(result.ok).toBe(true);
    });

    it('accepts pr as a valid mergeMode', async () => {
      const batch = sprintService.create('Batch', { group_type: 'batch', target_column: 'backlog' });
      sprintService.addScopes(batch.id, [1]);

      const result = await orchestrator.dispatch(batch.id, 'pr');
      expect(result.ok).toBe(true);
    });

    it('accepts push as a valid mergeMode', async () => {
      const batch = sprintService.create('Batch', { group_type: 'batch', target_column: 'backlog' });
      sprintService.addScopes(batch.id, [1]);

      const result = await orchestrator.dispatch(batch.id, 'push');
      expect(result.ok).toBe(true);
    });
  });

  // ─── onScopeStatusChanged() ───────────────────────────────

  describe('onScopeStatusChanged()', () => {
    it('marks scope as completed when it reaches target status', () => {
      const batch = sprintService.create('Batch', { group_type: 'batch' });
      sprintService.addScopes(batch.id, [1]);
      sprintService.updateStatus(batch.id, 'dispatched');

      orchestrator.onScopeStatusChanged(1, 'dev');

      const updated = sprintService.getById(batch.id)!;
      const scope = updated.scopes.find(s => s.scope_id === 1);
      expect(scope?.dispatch_status).toBe('completed');
    });

    it('does nothing when scope is not in any active batch', () => {
      // Should not throw
      expect(() => orchestrator.onScopeStatusChanged(999, 'dev')).not.toThrow();
    });
  });

  // ─── onSessionPidDied() ───────────────────────────────────

  describe('onSessionPidDied()', () => {
    it('marks batch as failed when session never started', () => {
      const batch = sprintService.create('Batch', { group_type: 'batch' });
      sprintService.addScopes(batch.id, [1]);
      sprintService.updateStatus(batch.id, 'dispatched');

      orchestrator.onSessionPidDied(batch.id);

      const updated = sprintService.getById(batch.id)!;
      expect(updated.status).toBe('failed');
    });

    it('marks batch as completed when all scopes transitioned', () => {
      const batch = sprintService.create('Batch', { group_type: 'batch' });
      sprintService.addScopes(batch.id, [1]);
      sprintService.updateStatus(batch.id, 'dispatched');
      sprintService.updateStatus(batch.id, 'in_progress');
      sprintService.updateScopeStatus(batch.id, 1, 'completed');

      orchestrator.onSessionPidDied(batch.id);

      const updated = sprintService.getById(batch.id)!;
      expect(updated.status).toBe('completed');
    });

    it('does nothing for non-active batch', () => {
      const batch = sprintService.create('Batch', { group_type: 'batch' });
      // batch is 'assembling', not dispatched
      expect(() => orchestrator.onSessionPidDied(batch.id)).not.toThrow();
    });
  });

  // ─── resolveStaleBatches() ────────────────────────────────

  describe('resolveStaleBatches()', () => {
    it('returns 0 when no active batches', () => {
      const count = orchestrator.resolveStaleBatches();
      expect(count).toBe(0);
    });

    it('resolves batches with no dispatch event as stale after threshold', () => {
      const batch = sprintService.create('Batch', { group_type: 'batch' });
      sprintService.addScopes(batch.id, [1]);
      sprintService.updateStatus(batch.id, 'dispatched');

      // Set dispatched_at to far in the past
      db.prepare('UPDATE sprints SET dispatched_at = ? WHERE id = ?')
        .run(new Date(Date.now() - 60 * 60 * 1000).toISOString(), batch.id);

      const count = orchestrator.resolveStaleBatches();
      expect(count).toBeGreaterThanOrEqual(1);
    });
  });
});
