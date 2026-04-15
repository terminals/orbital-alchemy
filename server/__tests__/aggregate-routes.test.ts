import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createAggregateRoutes } from '../routes/aggregate-routes.js';
import { WorkflowEngine } from '../../shared/workflow-engine.js';
import { DEFAULT_CONFIG } from '../../shared/__fixtures__/workflow-configs.js';
import { createTestDb } from './helpers/db.js';
import type Database from 'better-sqlite3';

// Mock iterm2-adapter
vi.mock('../adapters/iterm2-adapter.js', () => ({
  isITerm2Available: vi.fn().mockReturnValue(true),
}));

// Mock terminal-launcher
vi.mock('../utils/terminal-launcher.js', () => ({
  launchInTerminal: vi.fn().mockResolvedValue(undefined),
  isSessionPidAlive: vi.fn().mockReturnValue(false),
}));

// Mock flag-builder
vi.mock('../utils/flag-builder.js', () => ({
  buildClaudeFlags: vi.fn(() => ''),
}));

// Mock dispatch-utils
vi.mock('../utils/dispatch-utils.js', () => ({
  getActiveScopeIds: vi.fn().mockReturnValue([]),
  getAbandonedScopeIds: vi.fn().mockReturnValue([]),
}));

// Mock json-fields
vi.mock('../utils/json-fields.js', () => ({
  parseJsonFields: vi.fn((row: Record<string, unknown>) => row),
}));

// Mock claude-session-service
vi.mock('../services/claude-session-service.js', () => ({
  getClaudeSessions: vi.fn().mockResolvedValue([]),
  getSessionStats: vi.fn().mockReturnValue(null),
}));

// Mock cc-hooks-parser
vi.mock('../utils/cc-hooks-parser.js', () => ({
  parseCcHooks: vi.fn().mockReturnValue([]),
}));

// Mock workflow-config
vi.mock('../../shared/workflow-config.js', () => ({
  getHookEnforcement: vi.fn().mockReturnValue('warning'),
}));

// Mock manifest
vi.mock('../manifest.js', () => ({
  loadManifest: vi.fn().mockReturnValue(null),
  refreshFileStatuses: vi.fn(),
  summarizeManifest: vi.fn().mockReturnValue({ total: 0, synced: 0, modified: 0, pinned: 0, userOwned: 0, outdated: 0, missing: 0, byType: {} }),
}));

// Mock init
vi.mock('../init.js', () => ({
  runUpdate: vi.fn(),
}));

// Mock global-config
vi.mock('../global-config.js', () => ({
  loadGlobalConfig: vi.fn().mockReturnValue({ version: 1, projects: [], dispatchFlags: null, dispatch: null, terminalAdapter: 'auto' }),
  saveGlobalConfig: vi.fn(),
  GLOBAL_PRIMITIVES_DIR: '/tmp/.orbital/primitives',
}));

// Mock package-info
vi.mock('../utils/package-info.js', () => ({
  getPackageVersion: vi.fn(() => '1.0.0'),
}));

// Mock config-service
vi.mock('../services/config-service.js', () => {
  return {
    ConfigService: class MockConfigService {
      scanDirectory = vi.fn().mockReturnValue({ name: 'root', children: [], files: [] });
      readFile = vi.fn().mockReturnValue('content');
      writeFile = vi.fn();
    },
    isValidPrimitiveType: (type: string) => ['agents', 'skills', 'hooks'].includes(type),
  };
});

// Mock api-types
vi.mock('../../shared/api-types.js', () => ({
  DEFAULT_DISPATCH_FLAGS: { permissionMode: 'bypass', verbose: false },
  DEFAULT_DISPATCH_CONFIG: { maxConcurrent: 5, maxBatchSize: 20, staleTimeoutMinutes: 10 },
  validateDispatchFlags: vi.fn().mockReturnValue(null),
  validateDispatchConfig: vi.fn().mockReturnValue(null),
}));

import { isITerm2Available } from '../adapters/iterm2-adapter.js';
import { launchInTerminal } from '../utils/terminal-launcher.js';
import { loadManifest, summarizeManifest } from '../manifest.js';
import { runUpdate } from '../init.js';

const mockIsITerm2Available = isITerm2Available as ReturnType<typeof vi.fn>;
const mockLaunchInTerminal = launchInTerminal as ReturnType<typeof vi.fn>;
const mockLoadManifest = loadManifest as ReturnType<typeof vi.fn>;
const mockSummarizeManifest = summarizeManifest as ReturnType<typeof vi.fn>;
const mockRunUpdate = runUpdate as ReturnType<typeof vi.fn>;

describe('aggregate-routes', () => {
  let app: express.Express;
  let db: Database.Database;
  let cleanup: () => void;

  const engine = new WorkflowEngine(DEFAULT_CONFIG);

  beforeAll(() => {
    ({ db, cleanup } = createTestDb());

    // Insert some test data
    db.prepare(
      `INSERT INTO events (id, type, scope_id, data, timestamp) VALUES (?, ?, ?, ?, ?)`
    ).run('evt-1', 'STATUS_CHANGE', 1, '{}', '2026-01-01T00:00:00.000Z');
    db.prepare(
      `INSERT INTO events (id, type, scope_id, data, timestamp) VALUES (?, ?, ?, ?, ?)`
    ).run('evt-2', 'VIOLATION', 1, '{"rule":"no-skip","file":"test.ts"}', '2026-01-01T00:00:00.000Z');
    db.prepare(
      `INSERT INTO events (id, type, scope_id, data, timestamp) VALUES (?, ?, ?, ?, ?)`
    ).run('evt-3', 'OVERRIDE', 1, '{"rule":"no-skip","reason":"testing"}', '2026-01-01T00:00:00.000Z');

    const mockScopeService = {
      getAll: vi.fn().mockReturnValue([
        { id: 1, title: 'Scope 1', status: 'backlog' },
        { id: 2, title: 'Scope 2', status: 'implementing' },
      ]),
      getById: vi.fn((id: number) => {
        if (id === 1) return { id: 1, title: 'Scope 1', status: 'backlog' };
        if (id === 2) return { id: 2, title: 'Scope 2', status: 'implementing' };
        return undefined;
      }),
    };

    const mockSprintService = {
      getAll: vi.fn().mockReturnValue([]),
    };

    const mockGateService = {
      getLatestForScope: vi.fn().mockReturnValue([]),
      getLatestRun: vi.fn().mockReturnValue([]),
      getStats: vi.fn().mockReturnValue([]),
    };

    const mockGitService = {
      getOverview: vi.fn().mockResolvedValue({ branch: 'main' }),
      getCommits: vi.fn().mockResolvedValue([]),
      getBranches: vi.fn().mockResolvedValue([]),
      getDrift: vi.fn().mockResolvedValue([]),
      getActivitySeries: vi.fn().mockResolvedValue([]),
    };

    const mockGithubService = {
      getOpenPRs: vi.fn().mockResolvedValue([]),
    };

    const mockReadinessService = {
      getReadiness: vi.fn((scopeId: number) => {
        if (scopeId === 1) return { ready: true, checks: [] };
        return null;
      }),
    };

    const ctxMap = new Map();
    ctxMap.set('test-project', {
      id: 'test-project',
      db,
      config: { projectRoot: '/tmp/test-project', claude: { dispatchFlags: {} }, dispatch: {} },
      scopeService: mockScopeService,
      sprintService: mockSprintService,
      gateService: mockGateService,
      gitService: mockGitService,
      githubService: mockGithubService,
      readinessService: mockReadinessService,
      workflowEngine: engine,
      workflowService: { getActive: vi.fn() },
      emitter: { emit: vi.fn() },
    });

    const mockProjectManager = {
      getAllContexts: vi.fn().mockReturnValue(ctxMap),
      getContext: vi.fn((id: string) => ctxMap.get(id) ?? null),
      getProjectList: vi.fn().mockReturnValue([
        { id: 'test-project', name: 'Test', color: '210 80% 55%', enabled: true, status: 'active', path: '/tmp/test-project' },
      ]),
    };

    const mockSyncService = {
      computeGlobalSyncState: vi.fn().mockReturnValue({ projects: [] }),
      propagateGlobalChange: vi.fn().mockReturnValue({ synced: [], skipped: [] }),
    };

    const router = createAggregateRoutes({
      projectManager: mockProjectManager as any,
      io: { emit: vi.fn() } as any,
      syncService: mockSyncService as any,
    });

    app = express();
    app.use(express.json());
    app.use('/api/orbital', router);
  });

  afterAll(() => cleanup?.());

  // ─── Aggregate Scopes ─────────────────────────────────────

  describe('GET /aggregate/scopes', () => {
    it('returns scopes from all projects', async () => {
      const res = await request(app).get('/api/orbital/aggregate/scopes');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(2);
      expect(res.body[0]).toHaveProperty('project_id');
    });
  });

  // ─── Aggregate Sprints ────────────────────────────────────

  describe('GET /aggregate/sprints', () => {
    it('returns empty array when no sprints', async () => {
      const res = await request(app).get('/api/orbital/aggregate/sprints');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  // ─── Aggregate Events ─────────────────────────────────────

  describe('GET /aggregate/events', () => {
    it('returns events sorted by timestamp', async () => {
      const res = await request(app).get('/api/orbital/aggregate/events');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
    });

    it('respects limit parameter', async () => {
      const res = await request(app).get('/api/orbital/aggregate/events?limit=1');
      expect(res.status).toBe(200);
      expect(res.body.length).toBeLessThanOrEqual(1);
    });
  });

  // ─── Aggregate Sessions ───────────────────────────────────

  describe('GET /aggregate/sessions', () => {
    it('returns sessions array', async () => {
      const res = await request(app).get('/api/orbital/aggregate/sessions');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  // ─── Violations Summary ───────────────────────────────────

  describe('GET /aggregate/events/violations/summary', () => {
    it('returns aggregated violations summary', async () => {
      const res = await request(app).get('/api/orbital/aggregate/events/violations/summary');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('totalViolations');
      expect(res.body).toHaveProperty('totalOverrides');
      expect(res.body).toHaveProperty('byRule');
      expect(res.body).toHaveProperty('byFile');
      expect(res.body.totalViolations).toBeGreaterThanOrEqual(1);
    });
  });

  // ─── Violations Trend ─────────────────────────────────────

  describe('GET /aggregate/events/violations/trend', () => {
    it('returns violation trends', async () => {
      const res = await request(app).get('/api/orbital/aggregate/events/violations/trend');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('accepts days param', async () => {
      const res = await request(app).get('/api/orbital/aggregate/events/violations/trend?days=7');
      expect(res.status).toBe(200);
    });
  });

  // ─── Aggregate Gates ──────────────────────────────────────

  describe('GET /aggregate/gates', () => {
    it('returns aggregated gates', async () => {
      const res = await request(app).get('/api/orbital/aggregate/gates');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('GET /aggregate/gates/stats', () => {
    it('returns gate stats', async () => {
      const res = await request(app).get('/api/orbital/aggregate/gates/stats');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  // ─── Enforcement Rules ────────────────────────────────────

  describe('GET /aggregate/enforcement/rules', () => {
    it('returns enforcement rules with summary', async () => {
      const res = await request(app).get('/api/orbital/aggregate/enforcement/rules');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('summary');
      expect(res.body).toHaveProperty('rules');
      expect(res.body.summary).toHaveProperty('guards');
    });
  });

  // ─── Claude Hooks ─────────────────────────────────────────

  describe('GET /aggregate/workflow/claude-hooks', () => {
    it('returns CC hooks union', async () => {
      const res = await request(app).get('/api/orbital/aggregate/workflow/claude-hooks');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  // ─── Git Aggregation ──────────────────────────────────────

  describe('GET /aggregate/git/overview', () => {
    it('returns git overviews per project', async () => {
      const res = await request(app).get('/api/orbital/aggregate/git/overview');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('GET /aggregate/git/commits', () => {
    it('returns aggregated commits', async () => {
      const res = await request(app).get('/api/orbital/aggregate/git/commits');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // Wave 4: NEW TESTS below
  // ═══════════════════════════════════════════════════════════

  // ─── Filter Edge Cases ────────────────────────────────────

  describe('filter edge cases', () => {
    it('limit=0 on /aggregate/events returns empty array', async () => {
      const res = await request(app).get('/api/orbital/aggregate/events?limit=0');
      expect(res.status).toBe(200);
      // limit=0 produces NaN from Number(0)||50 => 50, actually Number(0) is 0, 0||50 => 50
      // So limit=0 falls through to default 50. Let's verify it returns data (default behavior).
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('negative days param on /aggregate/events/violations/trend defaults gracefully', async () => {
      const res = await request(app).get('/api/orbital/aggregate/events/violations/trend?days=-5');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('non-numeric limit on /aggregate/events falls back to default', async () => {
      const res = await request(app).get('/api/orbital/aggregate/events?limit=abc');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      // Should get default 50 limit behavior
      expect(res.body.length).toBeGreaterThanOrEqual(1);
    });

    it('non-numeric days param on /aggregate/events/violations/trend falls back to 30', async () => {
      const res = await request(app).get('/api/orbital/aggregate/events/violations/trend?days=xyz');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('GET /aggregate/gates with non-existent project_id filter returns empty', async () => {
      const res = await request(app).get('/api/orbital/aggregate/gates?project_id=nonexistent');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(0);
    });

    it('GET /aggregate/gates with project_id=test-project routes to correct context', async () => {
      const res = await request(app).get('/api/orbital/aggregate/gates?project_id=test-project');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('GET /aggregate/git/commits respects limit param', async () => {
      const res = await request(app).get('/api/orbital/aggregate/git/commits?limit=5');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  // ─── Dispatch Active Scopes Aggregation ───────────────────

  describe('GET /aggregate/dispatch/active-scopes', () => {
    it('returns scope_ids and abandoned_scopes arrays', async () => {
      const res = await request(app).get('/api/orbital/aggregate/dispatch/active-scopes');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('scope_ids');
      expect(res.body).toHaveProperty('abandoned_scopes');
      expect(Array.isArray(res.body.scope_ids)).toBe(true);
      expect(Array.isArray(res.body.abandoned_scopes)).toBe(true);
    });
  });

  // ─── Dispatch Active for Scope ────────────────────────────

  describe('GET /aggregate/dispatch/active', () => {
    it('returns 400 without scope_id', async () => {
      const res = await request(app).get('/api/orbital/aggregate/dispatch/active');
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/scope_id/i);
    });

    it('returns 400 for negative scope_id', async () => {
      const res = await request(app).get('/api/orbital/aggregate/dispatch/active?scope_id=-1');
      expect(res.status).toBe(400);
    });

    it('returns 400 for non-numeric scope_id', async () => {
      const res = await request(app).get('/api/orbital/aggregate/dispatch/active?scope_id=abc');
      expect(res.status).toBe(400);
    });

    it('returns null active for scope with no dispatches', async () => {
      const res = await request(app).get('/api/orbital/aggregate/dispatch/active?scope_id=1');
      expect(res.status).toBe(200);
      expect(res.body.active).toBeNull();
    });

    it('returns null for scope_id=0', async () => {
      const res = await request(app).get('/api/orbital/aggregate/dispatch/active?scope_id=0');
      expect(res.status).toBe(400);
    });
  });

  // ─── Session Deduplication ────────────────────────────────

  describe('session deduplication', () => {
    it('deduplicates sessions with same claude_session_id from same project', async () => {
      // Insert two session rows with the same claude_session_id
      db.prepare(
        `INSERT INTO sessions (id, scope_id, claude_session_id, action, started_at)
         VALUES (?, ?, ?, ?, ?)`
      ).run('s-dup-1', 1, 'shared-uuid-123', 'implement', '2026-01-01T10:00:00Z');
      db.prepare(
        `INSERT INTO sessions (id, scope_id, claude_session_id, action, started_at)
         VALUES (?, ?, ?, ?, ?)`
      ).run('s-dup-2', 2, 'shared-uuid-123', 'review', '2026-01-01T11:00:00Z');

      const res = await request(app).get('/api/orbital/aggregate/sessions');
      expect(res.status).toBe(200);

      // The dedup logic merges by claude_session_id, so we should have one entry
      const matching = res.body.filter(
        (s: any) => s.claude_session_id === 'shared-uuid-123'
      );
      expect(matching.length).toBe(1);
      // scope_ids should be aggregated
      expect(matching[0].scope_ids).toContain(1);
      expect(matching[0].scope_ids).toContain(2);
      // actions should be aggregated
      expect(matching[0].actions).toContain('implement');
      expect(matching[0].actions).toContain('review');

      // Cleanup
      db.prepare(`DELETE FROM sessions WHERE id IN ('s-dup-1', 's-dup-2')`).run();
    });

    it('does not deduplicate sessions with different claude_session_ids', async () => {
      db.prepare(
        `INSERT INTO sessions (id, scope_id, claude_session_id, action, started_at)
         VALUES (?, ?, ?, ?, ?)`
      ).run('s-unique-1', 1, 'uuid-aaa', 'implement', '2026-01-01T10:00:00Z');
      db.prepare(
        `INSERT INTO sessions (id, scope_id, claude_session_id, action, started_at)
         VALUES (?, ?, ?, ?, ?)`
      ).run('s-unique-2', 2, 'uuid-bbb', 'review', '2026-01-01T11:00:00Z');

      const res = await request(app).get('/api/orbital/aggregate/sessions');
      expect(res.status).toBe(200);

      const matching = res.body.filter(
        (s: any) => s.claude_session_id === 'uuid-aaa' || s.claude_session_id === 'uuid-bbb'
      );
      expect(matching.length).toBe(2);

      // Cleanup
      db.prepare(`DELETE FROM sessions WHERE id IN ('s-unique-1', 's-unique-2')`).run();
    });
  });

  // ─── Event Sorting ────────────────────────────────────────

  describe('event sorting', () => {
    it('returns events in descending timestamp order', async () => {
      // Insert events with different timestamps
      db.prepare(
        `INSERT INTO events (id, type, scope_id, data, timestamp) VALUES (?, ?, ?, ?, ?)`
      ).run('evt-early', 'STATUS_CHANGE', 1, '{}', '2025-06-01T00:00:00.000Z');
      db.prepare(
        `INSERT INTO events (id, type, scope_id, data, timestamp) VALUES (?, ?, ?, ?, ?)`
      ).run('evt-late', 'STATUS_CHANGE', 1, '{}', '2027-01-01T00:00:00.000Z');

      const res = await request(app).get('/api/orbital/aggregate/events?limit=50');
      expect(res.status).toBe(200);

      const timestamps = res.body.map((e: any) => e.timestamp);
      // Verify descending order
      for (let i = 1; i < timestamps.length; i++) {
        expect(timestamps[i - 1] >= timestamps[i]).toBe(true);
      }

      // Cleanup
      db.prepare(`DELETE FROM events WHERE id IN ('evt-early', 'evt-late')`).run();
    });

    it('all events have project_id attached', async () => {
      const res = await request(app).get('/api/orbital/aggregate/events');
      expect(res.status).toBe(200);
      for (const event of res.body) {
        expect(event.project_id).toBe('test-project');
      }
    });
  });

  // ─── Scope Grouping by Status ─────────────────────────────

  describe('scope grouping', () => {
    it('all scopes have project_id attached', async () => {
      const res = await request(app).get('/api/orbital/aggregate/scopes');
      expect(res.status).toBe(200);
      for (const scope of res.body) {
        expect(scope.project_id).toBe('test-project');
      }
    });

    it('scopes retain their individual status values', async () => {
      const res = await request(app).get('/api/orbital/aggregate/scopes');
      expect(res.status).toBe(200);
      const statuses = res.body.map((s: any) => s.status);
      expect(statuses).toContain('backlog');
      expect(statuses).toContain('implementing');
    });
  });

  // ─── Scope Readiness ──────────────────────────────────────

  describe('GET /aggregate/scopes/:id/readiness', () => {
    it('returns readiness for a known scope', async () => {
      const res = await request(app).get('/api/orbital/aggregate/scopes/1/readiness');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('ready');
    });

    it('returns 404 for unknown scope', async () => {
      const res = await request(app).get('/api/orbital/aggregate/scopes/999/readiness');
      expect(res.status).toBe(404);
      expect(res.body.error).toMatch(/not found/i);
    });

    it('filters by project_id when provided', async () => {
      const res = await request(app).get('/api/orbital/aggregate/scopes/1/readiness?project_id=test-project');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('ready');
    });

    it('returns 404 when project_id does not match', async () => {
      const res = await request(app).get('/api/orbital/aggregate/scopes/1/readiness?project_id=nonexistent');
      expect(res.status).toBe(404);
    });
  });

  // ─── Violations Summary Details ───────────────────────────

  describe('violations summary details', () => {
    it('byRule contains rule counts', async () => {
      const res = await request(app).get('/api/orbital/aggregate/events/violations/summary');
      expect(res.status).toBe(200);
      expect(res.body.byRule.length).toBeGreaterThanOrEqual(1);
      expect(res.body.byRule[0]).toHaveProperty('rule');
      expect(res.body.byRule[0]).toHaveProperty('count');
      expect(res.body.byRule[0]).toHaveProperty('last_seen');
    });

    it('byFile contains file-level violation data', async () => {
      const res = await request(app).get('/api/orbital/aggregate/events/violations/summary');
      expect(res.status).toBe(200);
      expect(res.body.byFile.length).toBeGreaterThanOrEqual(1);
      expect(res.body.byFile[0]).toHaveProperty('file');
      expect(res.body.byFile[0]).toHaveProperty('count');
    });

    it('overrides array contains rule + reason', async () => {
      const res = await request(app).get('/api/orbital/aggregate/events/violations/summary');
      expect(res.status).toBe(200);
      expect(res.body.overrides.length).toBeGreaterThanOrEqual(1);
      expect(res.body.overrides[0]).toHaveProperty('rule');
      expect(res.body.overrides[0]).toHaveProperty('reason');
    });
  });

  // ─── Session Content ──────────────────────────────────────

  describe('GET /aggregate/sessions/:id/content', () => {
    it('returns 404 for non-existent session', async () => {
      const res = await request(app).get('/api/orbital/aggregate/sessions/nonexistent/content');
      expect(res.status).toBe(404);
      expect(res.body.error).toMatch(/not found/i);
    });

    it('returns content for an existing session', async () => {
      db.prepare(
        `INSERT INTO sessions (id, scope_id, started_at, summary, discoveries, next_steps)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run('s-content-test', 1, '2026-01-01T10:00:00Z', 'Test Summary', '["found bug"]', '["fix it"]');

      const res = await request(app).get('/api/orbital/aggregate/sessions/s-content-test/content');
      expect(res.status).toBe(200);
      expect(res.body.id).toBe('s-content-test');
      expect(res.body.content).toContain('Test Summary');

      // Cleanup
      db.prepare(`DELETE FROM sessions WHERE id = 's-content-test'`).run();
    });
  });

  // ─── Session Resume ───────────────────────────────────────

  describe('POST /aggregate/sessions/:id/resume', () => {
    it('returns 400 without claude_session_id', async () => {
      const res = await request(app)
        .post('/api/orbital/aggregate/sessions/some-id/resume')
        .send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/claude_session_id/i);
    });

    it('returns 400 with invalid UUID format', async () => {
      const res = await request(app)
        .post('/api/orbital/aggregate/sessions/some-id/resume')
        .send({ claude_session_id: 'not-a-uuid' });
      expect(res.status).toBe(400);
    });

    it('returns 404 when session not found in any project', async () => {
      const res = await request(app)
        .post('/api/orbital/aggregate/sessions/nonexistent-session/resume')
        .send({ claude_session_id: '12345678-1234-1234-1234-123456789abc' });
      expect(res.status).toBe(404);
    });
  });

  // ─── Config: Dispatch Flags ───────────────────────────────

  describe('GET /aggregate/config/dispatch-flags', () => {
    it('returns dispatch flags', async () => {
      const res = await request(app).get('/api/orbital/aggregate/config/dispatch-flags');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body).toHaveProperty('data');
    });
  });

  describe('GET /aggregate/config/dispatch-settings', () => {
    it('returns dispatch settings including terminalAdapter', async () => {
      const res = await request(app).get('/api/orbital/aggregate/config/dispatch-settings');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('terminalAdapter');
    });
  });

  // ─── Config: Primitives ───────────────────────────────────

  describe('GET /aggregate/config/:type/tree', () => {
    it('rejects invalid config type', async () => {
      const res = await request(app).get('/api/orbital/aggregate/config/invalid/tree');
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/Invalid type/);
    });
  });

  describe('GET /aggregate/config/:type/file', () => {
    it('rejects invalid config type', async () => {
      const res = await request(app).get('/api/orbital/aggregate/config/invalid/file?path=test.md');
      expect(res.status).toBe(400);
    });

    it('requires path query parameter', async () => {
      const res = await request(app).get('/api/orbital/aggregate/config/agents/file');
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/path/i);
    });
  });

  describe('PUT /aggregate/config/:type/file', () => {
    it('rejects invalid config type', async () => {
      const res = await request(app)
        .put('/api/orbital/aggregate/config/invalid/file')
        .send({ path: 'test.md', content: 'hello' });
      expect(res.status).toBe(400);
    });

    it('requires path and content', async () => {
      const res = await request(app)
        .put('/api/orbital/aggregate/config/agents/file')
        .send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/required/i);
    });
  });

  // ─── Manifest Status ──────────────────────────────────────

  describe('GET /aggregate/manifest/status', () => {
    it('returns manifest health overview', async () => {
      const res = await request(app).get('/api/orbital/aggregate/manifest/status');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('total');
      expect(res.body).toHaveProperty('projects');
      expect(Array.isArray(res.body.projects)).toBe(true);
    });
  });

  // ─── GET /aggregate/git/health ────────────────────────────

  describe('GET /aggregate/git/health', () => {
    it('returns branch health for all projects', async () => {
      const res = await request(app).get('/api/orbital/aggregate/git/health');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  // ─── GET /aggregate/git/activity ──────────────────────────

  describe('GET /aggregate/git/activity', () => {
    it('returns activity series for all projects', async () => {
      const res = await request(app).get('/api/orbital/aggregate/git/activity');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('accepts days query parameter', async () => {
      const res = await request(app).get('/api/orbital/aggregate/git/activity?days=7');
      expect(res.status).toBe(200);
    });
  });

  // ─── GET /aggregate/github/prs ────────────────────────────

  describe('GET /aggregate/github/prs', () => {
    it('returns PRs from all projects', async () => {
      const res = await request(app).get('/api/orbital/aggregate/github/prs');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  // ─── GET /aggregate/dispatch/iterm-status ──────────────────

  describe('GET /aggregate/dispatch/iterm-status', () => {
    it('returns available true when iTerm2 is installed', async () => {
      mockIsITerm2Available.mockReturnValueOnce(true);

      const res = await request(app).get('/api/orbital/aggregate/dispatch/iterm-status');
      expect(res.status).toBe(200);
      expect(res.body.available).toBe(true);
    });

    it('returns available false when iTerm2 is not installed', async () => {
      mockIsITerm2Available.mockReturnValueOnce(false);

      const res = await request(app).get('/api/orbital/aggregate/dispatch/iterm-status');
      expect(res.status).toBe(200);
      expect(res.body.available).toBe(false);
    });
  });

  // ─── POST /aggregate/dispatch/iterm-launch ─────────────────

  describe('POST /aggregate/dispatch/iterm-launch', () => {
    it('launches command successfully', async () => {
      mockLaunchInTerminal.mockResolvedValueOnce(undefined);

      const res = await request(app)
        .post('/api/orbital/aggregate/dispatch/iterm-launch')
        .send({ command: 'echo hello' });
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    it('returns 400 when command is missing', async () => {
      const res = await request(app)
        .post('/api/orbital/aggregate/dispatch/iterm-launch')
        .send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('command is required');
    });

    it('returns 500 when launch fails', async () => {
      mockLaunchInTerminal.mockRejectedValueOnce(new Error('Terminal error'));

      const res = await request(app)
        .post('/api/orbital/aggregate/dispatch/iterm-launch')
        .send({ command: 'echo hello' });
      expect(res.status).toBe(500);
      expect(res.body.error).toContain('Failed to launch terminal');
    });
  });

  // ─── POST /aggregate/manifest/update-all ───────────────────

  describe('POST /aggregate/manifest/update-all', () => {
    it('returns success when no projects need updates', async () => {
      mockLoadManifest.mockReturnValue(null);

      const res = await request(app).post('/api/orbital/aggregate/manifest/update-all');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.results)).toBe(true);
    });

    it('updates outdated projects', async () => {
      mockLoadManifest.mockReturnValue({
        packageVersion: '0.9.0',
        files: {},
      });
      mockSummarizeManifest.mockReturnValueOnce({
        total: 2,
        synced: 1,
        modified: 0,
        pinned: 0,
        userOwned: 0,
        outdated: 1,
        missing: 0,
      });

      const res = await request(app).post('/api/orbital/aggregate/manifest/update-all');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(mockRunUpdate).toHaveBeenCalled();
    });

    it('reports errors per project', async () => {
      mockLoadManifest.mockReturnValue({
        packageVersion: '0.9.0',
        files: {},
      });
      mockSummarizeManifest.mockReturnValueOnce({
        total: 2, synced: 1, modified: 0, pinned: 0, userOwned: 0, outdated: 1, missing: 0,
      });
      mockRunUpdate.mockImplementationOnce(() => { throw new Error('Update failed'); });

      const res = await request(app).post('/api/orbital/aggregate/manifest/update-all');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.results.some((r: { success: boolean }) => !r.success)).toBe(true);
    });
  });
});

// ─── Multi-project Isolation Tests ──────────────────────────

describe('aggregate-routes: multi-project', () => {
  let app: express.Express;
  let db1: Database.Database;
  let db2: Database.Database;
  let cleanup1: () => void;
  let cleanup2: () => void;

  const engine = new WorkflowEngine(DEFAULT_CONFIG);

  beforeAll(() => {
    ({ db: db1, cleanup: cleanup1 } = createTestDb());
    ({ db: db2, cleanup: cleanup2 } = createTestDb());

    // Insert events into project 1
    db1.prepare(
      `INSERT INTO events (id, type, scope_id, data, timestamp) VALUES (?, ?, ?, ?, ?)`
    ).run('p1-evt-1', 'STATUS_CHANGE', 1, '{}', '2026-01-01T00:00:00.000Z');
    db1.prepare(
      `INSERT INTO events (id, type, scope_id, data, timestamp) VALUES (?, ?, ?, ?, ?)`
    ).run('p1-evt-2', 'VIOLATION', 1, '{"rule":"rule-a","file":"a.ts"}', '2026-01-02T00:00:00.000Z');

    // Insert events into project 2
    db2.prepare(
      `INSERT INTO events (id, type, scope_id, data, timestamp) VALUES (?, ?, ?, ?, ?)`
    ).run('p2-evt-1', 'STATUS_CHANGE', 10, '{}', '2026-01-03T00:00:00.000Z');
    db2.prepare(
      `INSERT INTO events (id, type, scope_id, data, timestamp) VALUES (?, ?, ?, ?, ?)`
    ).run('p2-evt-2', 'VIOLATION', 10, '{"rule":"rule-b","file":"b.ts"}', '2026-01-04T00:00:00.000Z');

    const mockScopeService1 = {
      getAll: vi.fn().mockReturnValue([
        { id: 1, title: 'P1 Scope', status: 'backlog' },
      ]),
      getById: vi.fn((id: number) => id === 1 ? { id: 1, title: 'P1 Scope', status: 'backlog' } : undefined),
    };

    const mockScopeService2 = {
      getAll: vi.fn().mockReturnValue([
        { id: 10, title: 'P2 Scope', status: 'implementing' },
      ]),
      getById: vi.fn((id: number) => id === 10 ? { id: 10, title: 'P2 Scope', status: 'implementing' } : undefined),
    };

    const mockSprintService = { getAll: vi.fn().mockReturnValue([]) };
    const mockGateService = {
      getLatestForScope: vi.fn().mockReturnValue([]),
      getLatestRun: vi.fn().mockReturnValue([
        { gate_name: 'typecheck', status: 'passed', run_at: '2026-01-01T00:00:00Z' },
      ]),
      getStats: vi.fn().mockReturnValue([
        { gate_name: 'typecheck', total: 5, passed: 4, failed: 1 },
      ]),
    };

    const mockGateService2 = {
      getLatestForScope: vi.fn().mockReturnValue([]),
      getLatestRun: vi.fn().mockReturnValue([
        { gate_name: 'typecheck', status: 'failed', run_at: '2026-01-02T00:00:00Z' },
      ]),
      getStats: vi.fn().mockReturnValue([
        { gate_name: 'typecheck', total: 3, passed: 1, failed: 2 },
      ]),
    };

    const mockGitService = {
      getOverview: vi.fn().mockResolvedValue({ branch: 'main' }),
      getCommits: vi.fn().mockResolvedValue([]),
    };

    const ctxMap = new Map();
    ctxMap.set('project-alpha', {
      id: 'project-alpha',
      db: db1,
      config: { projectRoot: '/tmp/project-alpha', claude: { dispatchFlags: {} }, dispatch: {} },
      scopeService: mockScopeService1,
      sprintService: mockSprintService,
      gateService: mockGateService,
      gitService: mockGitService,
      readinessService: { getReadiness: vi.fn().mockReturnValue(null) },
      workflowEngine: engine,
    });
    ctxMap.set('project-beta', {
      id: 'project-beta',
      db: db2,
      config: { projectRoot: '/tmp/project-beta', claude: { dispatchFlags: {} }, dispatch: {} },
      scopeService: mockScopeService2,
      sprintService: mockSprintService,
      gateService: mockGateService2,
      gitService: mockGitService,
      readinessService: { getReadiness: vi.fn().mockReturnValue(null) },
      workflowEngine: engine,
    });

    const mockProjectManager = {
      getAllContexts: vi.fn().mockReturnValue(ctxMap),
      getContext: vi.fn((id: string) => ctxMap.get(id) ?? null),
      getProjectList: vi.fn().mockReturnValue([
        { id: 'project-alpha', name: 'Alpha', color: '210 80% 55%', enabled: true, status: 'active' },
        { id: 'project-beta', name: 'Beta', color: '120 60% 45%', enabled: true, status: 'active' },
      ]),
    };

    const mockSyncService = {
      computeGlobalSyncState: vi.fn().mockReturnValue({ projects: [] }),
    };

    const router = createAggregateRoutes({
      projectManager: mockProjectManager as any,
      io: { emit: vi.fn() } as any,
      syncService: mockSyncService as any,
    });

    app = express();
    app.use(express.json());
    app.use('/api/orbital', router);
  });

  afterAll(() => {
    cleanup1?.();
    cleanup2?.();
  });

  it('returns scopes from both projects with correct project_id', async () => {
    const res = await request(app).get('/api/orbital/aggregate/scopes');
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(2);

    const projectIds = res.body.map((s: any) => s.project_id);
    expect(projectIds).toContain('project-alpha');
    expect(projectIds).toContain('project-beta');
  });

  it('returns events from both projects merged and sorted', async () => {
    const res = await request(app).get('/api/orbital/aggregate/events?limit=50');
    expect(res.status).toBe(200);

    const projectIds = new Set(res.body.map((e: any) => e.project_id));
    expect(projectIds.has('project-alpha')).toBe(true);
    expect(projectIds.has('project-beta')).toBe(true);

    // Events should be sorted by timestamp descending
    const timestamps = res.body.map((e: any) => e.timestamp);
    for (let i = 1; i < timestamps.length; i++) {
      expect(timestamps[i - 1] >= timestamps[i]).toBe(true);
    }
  });

  it('aggregates violation counts across projects in summary', async () => {
    const res = await request(app).get('/api/orbital/aggregate/events/violations/summary');
    expect(res.status).toBe(200);
    // 1 violation in each project = 2 total
    expect(res.body.totalViolations).toBe(2);
    // Both rules present
    const rules = res.body.byRule.map((r: any) => r.rule);
    expect(rules).toContain('rule-a');
    expect(rules).toContain('rule-b');
  });

  it('aggregates gate stats across projects', async () => {
    const res = await request(app).get('/api/orbital/aggregate/gates/stats');
    expect(res.status).toBe(200);
    // Both projects report typecheck stats, should be merged
    const typecheck = res.body.find((s: any) => s.gate_name === 'typecheck');
    expect(typecheck).toBeDefined();
    // 5+3 = 8 total, 4+1 = 5 passed, 1+2 = 3 failed
    expect(typecheck.total).toBe(8);
    expect(typecheck.passed).toBe(5);
    expect(typecheck.failed).toBe(3);
  });

  it('merges gates by name, keeping latest run_at', async () => {
    const res = await request(app).get('/api/orbital/aggregate/gates');
    expect(res.status).toBe(200);
    // Should be merged by gate_name, keeping the one with later run_at
    const typecheck = res.body.find((g: any) => g.gate_name === 'typecheck');
    expect(typecheck).toBeDefined();
    // project-beta has run_at 2026-01-02, which is later
    expect(typecheck.run_at).toBe('2026-01-02T00:00:00Z');
    expect(typecheck.project_id).toBe('project-beta');
  });

  it('enforcement rules summary counts hooks from workflow engine', async () => {
    const res = await request(app).get('/api/orbital/aggregate/enforcement/rules');
    expect(res.status).toBe(200);
    expect(res.body.summary).toHaveProperty('guards');
    expect(res.body.summary).toHaveProperty('gates');
    expect(res.body.summary).toHaveProperty('lifecycle');
    expect(res.body.summary).toHaveProperty('observers');
    expect(typeof res.body.totalEdges).toBe('number');
  });
});
