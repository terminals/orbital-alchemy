import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createDispatchRoutes } from '../routes/dispatch-routes.js';
import { WorkflowEngine } from '../../shared/workflow-engine.js';
import { DEFAULT_CONFIG } from '../../shared/__fixtures__/workflow-configs.js';
import { createTestDb } from './helpers/db.js';
import { createMockEmitter } from './helpers/mock-emitter.js';
import type Database from 'better-sqlite3';

// Mock iterm2-adapter
vi.mock('../adapters/iterm2-adapter.js', () => ({
  isITerm2Available: vi.fn().mockReturnValue(true),
}));

// Mock terminal-launcher to avoid real terminal launches
vi.mock('../utils/terminal-launcher.js', () => ({
  launchInCategorizedTerminal: vi.fn().mockResolvedValue(undefined),
  launchInTerminal: vi.fn().mockResolvedValue(undefined),
  escapeForAnsiC: vi.fn((s: string) => s),
  shellQuote: vi.fn((s: string) => s),
  buildSessionName: vi.fn(() => 'test-session'),
  snapshotSessionPids: vi.fn(() => []),
  discoverNewSession: vi.fn().mockResolvedValue(null),
  renameSession: vi.fn(),
}));

// Mock flag-builder
vi.mock('../utils/flag-builder.js', () => ({
  buildClaudeFlags: vi.fn(() => ''),
  buildEnvVarPrefix: vi.fn(() => ''),
}));

import { isITerm2Available } from '../adapters/iterm2-adapter.js';
import { launchInTerminal } from '../utils/terminal-launcher.js';

const mockIsITerm2Available = isITerm2Available as ReturnType<typeof vi.fn>;
const mockLaunchInTerminal = launchInTerminal as ReturnType<typeof vi.fn>;

describe('dispatch-routes', () => {
  let app: express.Express;
  let db: Database.Database;
  let cleanup: () => void;

  const mockScopeService = {
    getAll: vi.fn().mockReturnValue([]),
    getById: vi.fn((id: number) => id === 1 ? { id: 1, title: 'Test Scope' } : undefined),
    updateStatus: vi.fn().mockReturnValue({ ok: true }),
  };

  beforeAll(() => {
    ({ db, cleanup } = createTestDb());
    const emitter = createMockEmitter();
    const engine = new WorkflowEngine(DEFAULT_CONFIG);

    const router = createDispatchRoutes({
      db,
      io: emitter,
      scopeService: mockScopeService as any,
      projectRoot: '/tmp/test-project',
      engine,
      config: {
        claude: { dispatchFlags: { permissionMode: 'bypass', verbose: false, noMarkdown: false, printMode: false, outputFormat: null, allowedTools: [], disallowedTools: [], appendSystemPrompt: '' } },
        dispatch: { envVars: {}, maxConcurrent: 5, maxBatchSize: 20, staleTimeoutMinutes: 10 },
      } as any,
    });

    app = express();
    app.use(express.json());
    app.use('/api/orbital', router);
  });

  afterAll(() => cleanup?.());

  // ─── GET /dispatch/active-scopes ──────────────────────────

  describe('GET /dispatch/active-scopes', () => {
    it('returns scope_ids and abandoned_scopes arrays', async () => {
      const res = await request(app).get('/api/orbital/dispatch/active-scopes');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('scope_ids');
      expect(res.body).toHaveProperty('abandoned_scopes');
      expect(Array.isArray(res.body.scope_ids)).toBe(true);
    });
  });

  // ─── GET /dispatch/active ─────────────────────────────────

  describe('GET /dispatch/active', () => {
    it('returns 400 without scope_id', async () => {
      const res = await request(app).get('/api/orbital/dispatch/active');
      expect(res.status).toBe(400);
    });

    it('returns 400 for invalid scope_id', async () => {
      const res = await request(app).get('/api/orbital/dispatch/active?scope_id=-1');
      expect(res.status).toBe(400);
    });

    it('returns null for scope with no active dispatch', async () => {
      const res = await request(app).get('/api/orbital/dispatch/active?scope_id=1');
      expect(res.status).toBe(200);
      expect(res.body.active).toBeNull();
    });
  });

  // ─── POST /dispatch ───────────────────────────────────────

  describe('POST /dispatch', () => {
    it('rejects missing command (400)', async () => {
      const res = await request(app)
        .post('/api/orbital/dispatch')
        .send({ scope_id: 1 });
      expect(res.status).toBe(400);
    });

    it('rejects disallowed command prefix (400)', async () => {
      const res = await request(app)
        .post('/api/orbital/dispatch')
        .send({ scope_id: 1, command: '/bad-command' });
      expect(res.status).toBe(400);
    });

    it('dispatches with valid command', async () => {
      const res = await request(app)
        .post('/api/orbital/dispatch')
        .send({ scope_id: 1, command: '/scope-implement' });
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.dispatch_id).toBeDefined();
    });

    it('returns 409 when scope already has active dispatch', async () => {
      // The previous test created an unresolved dispatch for scope 1
      const res = await request(app)
        .post('/api/orbital/dispatch')
        .send({ scope_id: 1, command: '/scope-implement' });
      expect(res.status).toBe(409);
      expect(res.body.error).toContain('Active dispatch exists');
    });
  });

  // ─── POST /dispatch/:id/resolve ───────────────────────────

  describe('POST /dispatch/:id/resolve', () => {
    it('returns 404 for non-existent dispatch', async () => {
      const res = await request(app)
        .post('/api/orbital/dispatch/non-existent/resolve');
      expect(res.status).toBe(404);
    });

    it('resolves an existing dispatch', async () => {
      // Get a valid dispatch ID from the database
      const row = db.prepare("SELECT id FROM events WHERE type = 'DISPATCH' LIMIT 1").get() as { id: string };
      const res = await request(app)
        .post(`/api/orbital/dispatch/${row.id}/resolve`);
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });

  // ─── POST /dispatch/recover/:scopeId ──────────────────────

  describe('POST /dispatch/recover/:scopeId', () => {
    it('returns 400 for invalid scopeId', async () => {
      const res = await request(app)
        .post('/api/orbital/dispatch/recover/abc')
        .send({ from_status: 'backlog' });
      expect(res.status).toBe(400);
    });

    it('returns 400 when missing from_status', async () => {
      const res = await request(app)
        .post('/api/orbital/dispatch/recover/1')
        .send({});
      expect(res.status).toBe(400);
    });
  });

  // ─── POST /dispatch/dismiss-abandoned/:scopeId ────────────

  describe('POST /dispatch/dismiss-abandoned/:scopeId', () => {
    it('returns 400 for invalid scopeId', async () => {
      const res = await request(app)
        .post('/api/orbital/dispatch/dismiss-abandoned/abc');
      expect(res.status).toBe(400);
    });

    it('dismisses with valid scopeId', async () => {
      const res = await request(app)
        .post('/api/orbital/dispatch/dismiss-abandoned/1');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });

  // ─── POST /dispatch/batch ─────────────────────────────────

  describe('POST /dispatch/batch', () => {
    it('rejects invalid command (400)', async () => {
      const res = await request(app)
        .post('/api/orbital/dispatch/batch')
        .send({ scope_ids: [1, 2], command: '/invalid' });
      expect(res.status).toBe(400);
    });

    it('rejects empty scope_ids (400)', async () => {
      const res = await request(app)
        .post('/api/orbital/dispatch/batch')
        .send({ scope_ids: [], command: '/scope-implement' });
      expect(res.status).toBe(400);
    });

    it('rejects non-integer scope_ids (400)', async () => {
      const res = await request(app)
        .post('/api/orbital/dispatch/batch')
        .send({ scope_ids: [1.5, 'abc'], command: '/scope-implement' });
      expect(res.status).toBe(400);
    });
  });

  // ─── GET /dispatch/iterm-status ────────────────────────────

  describe('GET /dispatch/iterm-status', () => {
    it('returns available true when iTerm2 is installed', async () => {
      mockIsITerm2Available.mockReturnValueOnce(true);

      const res = await request(app).get('/api/orbital/dispatch/iterm-status');
      expect(res.status).toBe(200);
      expect(res.body.available).toBe(true);
    });

    it('returns available false when iTerm2 is not installed', async () => {
      mockIsITerm2Available.mockReturnValueOnce(false);

      const res = await request(app).get('/api/orbital/dispatch/iterm-status');
      expect(res.status).toBe(200);
      expect(res.body.available).toBe(false);
    });
  });

  // ─── POST /dispatch/iterm-launch ───────────────────────────

  describe('POST /dispatch/iterm-launch', () => {
    it('launches command successfully', async () => {
      mockLaunchInTerminal.mockResolvedValueOnce(undefined);

      const res = await request(app)
        .post('/api/orbital/dispatch/iterm-launch')
        .send({ command: 'echo hello' });
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(mockLaunchInTerminal).toHaveBeenCalledWith('echo hello');
    });

    it('returns 400 when command is missing', async () => {
      const res = await request(app)
        .post('/api/orbital/dispatch/iterm-launch')
        .send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('command is required');
    });

    it('returns 500 when terminal launch fails', async () => {
      mockLaunchInTerminal.mockRejectedValueOnce(new Error('AppleScript failed'));

      const res = await request(app)
        .post('/api/orbital/dispatch/iterm-launch')
        .send({ command: 'echo hello' });
      expect(res.status).toBe(500);
      expect(res.body.error).toContain('Failed to launch terminal');
    });
  });
});
