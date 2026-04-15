import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createDataRoutes } from '../routes/data-routes.js';
import { EventService } from '../services/event-service.js';
import { GateService } from '../services/gate-service.js';
import { DeployService } from '../services/deploy-service.js';
import { WorkflowEngine } from '../../shared/workflow-engine.js';
import { createTestDb } from './helpers/db.js';
import { createMockEmitter } from './helpers/mock-emitter.js';
import { DEFAULT_CONFIG } from '../../shared/__fixtures__/workflow-configs.js';
import { loadConfig } from '../config.js';
import type Database from 'better-sqlite3';

// Mock terminal-launcher to avoid real terminal launches
vi.mock('../utils/terminal-launcher.js', () => ({
  launchInTerminal: vi.fn().mockResolvedValue(undefined),
}));

// Mock claude-session-service to avoid filesystem reads
vi.mock('../services/claude-session-service.js', () => ({
  getClaudeSessions: vi.fn().mockResolvedValue([]),
  getSessionStats: vi.fn().mockReturnValue(null),
}));

// Mock child_process for git/open commands used in routes
vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>();
  const { promisify } = await import('util');

  // Helper to find the callback in execFile's overloaded signatures
  function findCallback(...fnArgs: unknown[]): ((err: Error | null, stdout?: string, stderr?: string) => void) | undefined {
    for (let i = fnArgs.length - 1; i >= 0; i--) {
      if (typeof fnArgs[i] === 'function') return fnArgs[i] as (err: Error | null, stdout?: string, stderr?: string) => void;
    }
    return undefined;
  }

  function resolve(cmd: string, args: string[]): { stdout: string; stderr: string } {
    if (cmd === 'git' && args[0] === 'branch') return { stdout: 'main\n', stderr: '' };
    if (cmd === 'git' && args[0] === 'status') return { stdout: '', stderr: '' };
    if (cmd === 'git' && args[0] === 'worktree') return { stdout: 'worktree /tmp/test-project\nHEAD abc123\nbranch refs/heads/main\n\n', stderr: '' };
    return { stdout: '', stderr: '' };
  }

  // Callback-based mock (used by open-file route and promisify)
  const mockExecFile = vi.fn((...fnArgs: unknown[]) => {
    const cmd = fnArgs[0] as string;
    const args = fnArgs[1] as string[];
    const cb = findCallback(...fnArgs);
    if (!cb) return;
    const result = resolve(cmd, args);
    cb(null, result.stdout, result.stderr);
  });

  // Custom promisify so promisify(execFile) returns { stdout, stderr }
  (mockExecFile as unknown as Record<symbol, unknown>)[promisify.custom] = vi.fn(
    (cmd: string, args: string[], _opts?: unknown) => {
      return Promise.resolve(resolve(cmd, args));
    },
  );

  return {
    ...actual,
    execFile: mockExecFile,
  };
});

describe('data-routes', () => {
  let app: express.Express;
  let db: Database.Database;
  let cleanup: () => void;

  beforeAll(() => {
    ({ db, cleanup } = createTestDb());
    const emitter = createMockEmitter();
    const engine = new WorkflowEngine(DEFAULT_CONFIG);
    const eventService = new EventService(db, emitter);
    const gateService = new GateService(db, emitter);
    const deployService = new DeployService(db, emitter);

    const mockGitService = {
      getPipelineDrift: vi.fn().mockResolvedValue({ ahead: 0, behind: 0, files: [] }),
      getStatusHash: vi.fn().mockReturnValue('abc123'),
      getWorktrees: vi.fn().mockReturnValue([]),
      getCurrentBranch: vi.fn().mockReturnValue('main'),
      isDirty: vi.fn().mockReturnValue(false),
    } as unknown;

    const router = createDataRoutes({
      db,
      io: emitter,
      eventService,
      gateService,
      deployService,
      gitService: mockGitService as Parameters<typeof createDataRoutes>[0]['gitService'],
      engine,
      projectRoot: '/tmp/test-project',
      inferScopeStatus: vi.fn(),
      config: loadConfig('/tmp/test-project'),
    });

    app = express();
    app.use(express.json());
    app.use('/api/orbital', router);
  });

  afterAll(() => {
    cleanup?.();
  });

  // ─── Event Endpoints ──────────────────────────────────────

  describe('POST /api/orbital/events', () => {
    it('creates event with valid body (201)', async () => {
      const res = await request(app)
        .post('/api/orbital/events')
        .send({ type: 'TEST_EVENT', scope_id: 1, data: { foo: 'bar' } });

      expect(res.status).toBe(201);
      expect(res.body.type).toBe('TEST_EVENT');
      expect(res.body.id).toBeDefined();
    });

    it('rejects missing type (400)', async () => {
      const res = await request(app)
        .post('/api/orbital/events')
        .send({ scope_id: 1 });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('type');
    });

    it('rejects invalid scope_id (400)', async () => {
      const res = await request(app)
        .post('/api/orbital/events')
        .send({ type: 'TEST', scope_id: -1 });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('scope_id');
    });
  });

  describe('GET /api/orbital/events', () => {
    it('returns events', async () => {
      const res = await request(app).get('/api/orbital/events');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  // ─── Gate Endpoints ───────────────────────────────────────

  describe('POST /api/orbital/gates', () => {
    it('records gate result (201)', async () => {
      const res = await request(app)
        .post('/api/orbital/gates')
        .send({ gate_name: 'type-check', status: 'pass', duration_ms: 1200 });

      expect(res.status).toBe(201);
    });
  });

  describe('GET /api/orbital/gates/stats', () => {
    it('returns stats array', async () => {
      const res = await request(app).get('/api/orbital/gates/stats');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  // ─── Deployment Endpoints ─────────────────────────────────

  describe('POST /api/orbital/deployments', () => {
    it('records deployment (201)', async () => {
      const res = await request(app)
        .post('/api/orbital/deployments')
        .send({ environment: 'staging', status: 'deploying', commit_sha: 'abc' });

      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
    });
  });

  describe('GET /api/orbital/deployments', () => {
    it('returns recent deployments', async () => {
      const res = await request(app).get('/api/orbital/deployments');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  // ─── Violation Trend ──────────────────────────────────────

  describe('GET /api/orbital/events/violations/trend', () => {
    it('returns trend data with default days', async () => {
      const res = await request(app).get('/api/orbital/events/violations/trend');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('accepts custom days param', async () => {
      const res = await request(app).get('/api/orbital/events/violations/trend?days=7');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  // ─── Enforcement Rules ────────────────────────────────────

  describe('GET /api/orbital/enforcement/rules', () => {
    it('returns rules with summary', async () => {
      const res = await request(app).get('/api/orbital/enforcement/rules');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('summary');
      expect(res.body).toHaveProperty('rules');
      expect(res.body).toHaveProperty('totalEdges');
      expect(Array.isArray(res.body.rules)).toBe(true);
    });
  });

  // ─── Gate Endpoints (additional) ──────────────────────────

  describe('GET /api/orbital/gates', () => {
    it('returns latest gate results', async () => {
      const res = await request(app).get('/api/orbital/gates');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('returns gates filtered by scope_id', async () => {
      const res = await request(app).get('/api/orbital/gates?scope_id=1');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('GET /api/orbital/gates/trend', () => {
    it('returns gate trend data', async () => {
      const res = await request(app).get('/api/orbital/gates/trend');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('accepts custom limit param', async () => {
      const res = await request(app).get('/api/orbital/gates/trend?limit=10');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  // ─── Deployment Endpoints (additional) ────────────────────

  describe('GET /api/orbital/deployments/latest', () => {
    it('returns latest deployment per environment', async () => {
      const res = await request(app).get('/api/orbital/deployments/latest');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('PATCH /api/orbital/deployments/:id', () => {
    it('updates deployment status', async () => {
      // First create a deployment to update
      const create = await request(app)
        .post('/api/orbital/deployments')
        .send({ environment: 'staging', status: 'deploying', commit_sha: 'def' });
      const id = create.body.id;

      const res = await request(app)
        .patch(`/api/orbital/deployments/${id}`)
        .send({ status: 'success', details: 'Deployed OK' });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    it('rejects missing status (400)', async () => {
      const res = await request(app)
        .patch('/api/orbital/deployments/1')
        .send({ details: 'no status' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('status');
    });
  });

  describe('GET /api/orbital/pipeline/drift', () => {
    it('returns drift data', async () => {
      const res = await request(app).get('/api/orbital/pipeline/drift');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('ahead');
      expect(res.body).toHaveProperty('behind');
    });
  });

  describe('GET /api/orbital/deployments/frequency', () => {
    it('returns deployment frequency', async () => {
      const res = await request(app).get('/api/orbital/deployments/frequency');
      expect(res.status).toBe(200);
    });
  });

  // ─── Violations Summary ───────────────────────────────────

  describe('GET /api/orbital/events/violations/summary', () => {
    it('returns summary structure', async () => {
      const res = await request(app).get('/api/orbital/events/violations/summary');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('totalViolations');
      expect(res.body).toHaveProperty('totalOverrides');
      expect(res.body).toHaveProperty('byRule');
      expect(res.body).toHaveProperty('byFile');
    });
  });

  // ─── Session Endpoints ────────────────────────────────────

  describe('GET /api/orbital/sessions', () => {
    it('returns sessions list', async () => {
      const res = await request(app).get('/api/orbital/sessions');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('GET /api/orbital/scopes/:id/sessions', () => {
    it('returns sessions for a scope', async () => {
      const res = await request(app).get('/api/orbital/scopes/1/sessions');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('GET /api/orbital/sessions/:id/content', () => {
    it('returns 404 for unknown session', async () => {
      const res = await request(app).get('/api/orbital/sessions/nonexistent/content');
      expect(res.status).toBe(404);
      expect(res.body.error).toContain('Session not found');
    });

    it('returns content for an existing session', async () => {
      // Insert a session directly into the db (schema: id, scope_id, action, started_at)
      db.prepare(
        `INSERT INTO sessions (id, scope_id, action, started_at)
         VALUES (?, ?, ?, ?)`
      ).run('test-session-1', 1, 'implement', new Date().toISOString());

      const res = await request(app).get('/api/orbital/sessions/test-session-1/content');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('id', 'test-session-1');
      expect(res.body).toHaveProperty('content');
    });
  });

  describe('POST /api/orbital/sessions/:id/resume', () => {
    it('rejects invalid claude_session_id (400)', async () => {
      const res = await request(app)
        .post('/api/orbital/sessions/1/resume')
        .send({ claude_session_id: 'not-a-uuid' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('claude_session_id');
    });

    it('resumes session with valid UUID', async () => {
      const res = await request(app)
        .post('/api/orbital/sessions/1/resume')
        .send({ claude_session_id: '550e8400-e29b-41d4-a716-446655440000' });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.session_id).toBe('550e8400-e29b-41d4-a716-446655440000');
    });
  });

  // ─── Git Status ───────────────────────────────────────────

  describe('GET /api/orbital/git/status', () => {
    it('returns git status', async () => {
      const res = await request(app).get('/api/orbital/git/status');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('branch');
      expect(res.body).toHaveProperty('dirty');
      expect(res.body).toHaveProperty('detached');
    });
  });

  // ─── Worktrees ────────────────────────────────────────────

  describe('GET /api/orbital/worktrees', () => {
    it('returns worktrees list', async () => {
      const res = await request(app).get('/api/orbital/worktrees');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
      expect(res.body[0]).toHaveProperty('path');
      expect(res.body[0]).toHaveProperty('branch');
      expect(res.body[0]).toHaveProperty('head');
    });
  });

  // ─── Open File ────────────────────────────────────────────

  describe('POST /api/orbital/open-file', () => {
    it('opens a valid file path', async () => {
      const res = await request(app)
        .post('/api/orbital/open-file?path=src/index.ts');

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    it('rejects empty path (400)', async () => {
      const res = await request(app)
        .post('/api/orbital/open-file?path=');

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Invalid path');
    });

    it('rejects path traversal (400)', async () => {
      const res = await request(app)
        .post('/api/orbital/open-file?path=../../../etc/passwd');

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Invalid path');
    });
  });
});
