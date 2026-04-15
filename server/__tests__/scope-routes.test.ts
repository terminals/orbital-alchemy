import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createScopeRoutes } from '../routes/scope-routes.js';
import { WorkflowEngine } from '../../shared/workflow-engine.js';
import { DEFAULT_CONFIG } from '../../shared/__fixtures__/workflow-configs.js';
import { createTestDb } from './helpers/db.js';
import { createMockEmitter } from './helpers/mock-emitter.js';
import type { ParsedScope } from '../parsers/scope-parser.js';

vi.mock('../utils/terminal-launcher.js', () => ({
  launchInTerminal: vi.fn().mockResolvedValue(undefined),
  escapeForAnsiC: vi.fn((s: string) => s),
  shellQuote: vi.fn((s: string) => s),
  buildSessionName: vi.fn().mockReturnValue('test-session'),
  snapshotSessionPids: vi.fn().mockReturnValue(new Set()),
  discoverNewSession: vi.fn().mockResolvedValue(null),
  renameSession: vi.fn(),
}));

vi.mock('child_process', () => ({
  spawn: vi.fn().mockReturnValue({
    unref: vi.fn(),
    on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
      if (event === 'close') setTimeout(() => cb(0), 10);
    }),
    stdout: { on: vi.fn() },
    stderr: { on: vi.fn() },
  }),
}));

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
    raw_content: '',
    sessions: {},
    is_ghost: false,
    favourite: false,
    ...overrides,
  };
}

describe('scope-routes', () => {
  let app: express.Express;
  let cleanup: () => void;

  const testScopes = [
    makeScope({ id: 1, title: 'First Scope' }),
    makeScope({ id: 2, title: 'Second Scope' }),
  ];

  const mockScopeService = {
    getAll: vi.fn().mockReturnValue(testScopes),
    getById: vi.fn((id: number) => testScopes.find(s => s.id === id)),
    updateStatus: vi.fn().mockReturnValue({ ok: true }),
    updateFields: vi.fn().mockReturnValue({ ok: true }),
    createIdeaFile: vi.fn().mockReturnValue({ slug: 'new-idea', title: 'New Idea' }),
    updateIdeaFile: vi.fn().mockReturnValue(true),
    deleteIdeaFile: vi.fn().mockReturnValue(true),
    promoteIdea: vi.fn().mockReturnValue({ id: 10, filePath: '/scopes/planning/010-new.md', title: 'New', description: '' }),
    approveGhostIdea: vi.fn().mockReturnValue(true),
  };

  const mockReadinessService = {
    getReadiness: vi.fn((id: number) => id === 1 ? { scope_id: 1, transitions: [], blockers: [] } : null),
  };

  beforeAll(() => {
    const { db, cleanup: c } = createTestDb();
    cleanup = c;
    const emitter = createMockEmitter();
    const engine = new WorkflowEngine(DEFAULT_CONFIG);

    const router = createScopeRoutes({
      db,
      io: emitter,
      scopeService: mockScopeService as any,
      readinessService: mockReadinessService as any,
      projectRoot: '/tmp/test-project',
      projectName: 'Test',
      engine,
      config: { claude: { dispatchFlags: { permissionMode: 'bypass', verbose: false, noMarkdown: false, printMode: false, outputFormat: null, allowedTools: [], disallowedTools: [], appendSystemPrompt: '' } }, dispatch: { envVars: {}, maxConcurrent: 5, maxBatchSize: 20, staleTimeoutMinutes: 10 } } as any,
    });

    app = express();
    app.use(express.json());
    app.use('/api/orbital', router);
  });

  afterAll(() => cleanup?.());

  describe('GET /scopes', () => {
    it('returns all scopes', async () => {
      const res = await request(app).get('/api/orbital/scopes');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
    });
  });

  describe('GET /scopes/:id', () => {
    it('returns scope by ID', async () => {
      const res = await request(app).get('/api/orbital/scopes/1');
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(1);
    });

    it('returns 404 for unknown scope', async () => {
      const res = await request(app).get('/api/orbital/scopes/999');
      expect(res.status).toBe(404);
    });
  });

  describe('PATCH /scopes/:id', () => {
    it('updates scope fields', async () => {
      const res = await request(app)
        .patch('/api/orbital/scopes/1')
        .send({ title: 'Updated Title' });
      expect(res.status).toBe(200);
      expect(mockScopeService.updateFields).toHaveBeenCalled();
    });
  });

  describe('PATCH /scopes/bulk/status', () => {
    it('bulk updates scope statuses', async () => {
      const res = await request(app)
        .patch('/api/orbital/scopes/bulk/status')
        .send({ scopes: [{ id: 1, status: 'implementing' }] });
      expect(res.status).toBe(200);
    });
  });

  describe('POST /ideas', () => {
    it('creates idea with title', async () => {
      const res = await request(app)
        .post('/api/orbital/ideas')
        .send({ title: 'New Idea', description: 'A description' });
      expect(res.status).toBe(201);
      expect(res.body.slug).toBe('new-idea');
    });

    it('rejects empty title', async () => {
      const res = await request(app)
        .post('/api/orbital/ideas')
        .send({ title: '  ', description: '' });
      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /ideas/:slug', () => {
    it('deletes idea', async () => {
      const res = await request(app).delete('/api/orbital/ideas/test-idea');
      expect(res.status).toBe(200);
    });
  });

  describe('GET /scopes/:id/readiness', () => {
    it('returns readiness for known scope', async () => {
      const res = await request(app).get('/api/orbital/scopes/1/readiness');
      expect(res.status).toBe(200);
      expect(res.body.scope_id).toBe(1);
    });

    it('returns 404 for unknown scope', async () => {
      const res = await request(app).get('/api/orbital/scopes/999/readiness');
      expect(res.status).toBe(404);
    });
  });

  describe('PATCH /ideas/:slug', () => {
    it('updates idea with valid title', async () => {
      const res = await request(app)
        .patch('/api/orbital/ideas/my-idea')
        .send({ title: 'Updated Title', description: 'Updated desc' });
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(mockScopeService.updateIdeaFile).toHaveBeenCalledWith('my-idea', 'Updated Title', 'Updated desc');
    });

    it('returns 400 for missing title', async () => {
      const res = await request(app)
        .patch('/api/orbital/ideas/my-idea')
        .send({ description: 'No title' });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('title');
    });

    it('returns 400 for invalid slug', async () => {
      const res = await request(app)
        .patch('/api/orbital/ideas/INVALID_SLUG!')
        .send({ title: 'Some Title' });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Invalid slug');
    });

    it('returns 404 when idea not found', async () => {
      mockScopeService.updateIdeaFile.mockReturnValueOnce(false);
      const res = await request(app)
        .patch('/api/orbital/ideas/nonexistent')
        .send({ title: 'Some Title' });
      expect(res.status).toBe(404);
    });
  });

  describe('POST /ideas/:slug/promote', () => {
    it('promotes idea and launches terminal', async () => {
      const res = await request(app)
        .post('/api/orbital/ideas/my-idea/promote');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.id).toBe(10);
      expect(mockScopeService.promoteIdea).toHaveBeenCalledWith('my-idea', expect.any(String));
    });

    it('returns 400 for invalid slug', async () => {
      const res = await request(app)
        .post('/api/orbital/ideas/BAD SLUG/promote');
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Invalid slug');
    });

    it('returns 404 when idea not found', async () => {
      mockScopeService.promoteIdea.mockReturnValueOnce(null);
      const res = await request(app)
        .post('/api/orbital/ideas/nonexistent/promote');
      expect(res.status).toBe(404);
    });
  });

  describe('POST /ideas/surprise', () => {
    it('starts surprise generation', async () => {
      const res = await request(app)
        .post('/api/orbital/ideas/surprise');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.status).toBe('generating');
    });

    it('returns 409 when already generating', async () => {
      // First request starts generation
      await request(app).post('/api/orbital/ideas/surprise');
      // Second request should conflict
      const res = await request(app).post('/api/orbital/ideas/surprise');
      expect(res.status).toBe(409);
      expect(res.body.error).toContain('already in progress');
    });
  });

  describe('POST /ideas/:slug/approve', () => {
    it('approves a ghost idea', async () => {
      const res = await request(app)
        .post('/api/orbital/ideas/ghost-idea/approve');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(mockScopeService.approveGhostIdea).toHaveBeenCalledWith('ghost-idea');
    });

    it('returns 400 for invalid slug', async () => {
      const res = await request(app)
        .post('/api/orbital/ideas/BAD SLUG/approve');
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Invalid slug');
    });

    it('returns 404 when ghost idea not found', async () => {
      mockScopeService.approveGhostIdea.mockReturnValueOnce(false);
      const res = await request(app)
        .post('/api/orbital/ideas/missing-ghost/approve');
      expect(res.status).toBe(404);
    });
  });

  describe('GET /ideas/surprise/status', () => {
    it('returns generating status', async () => {
      const res = await request(app)
        .get('/api/orbital/ideas/surprise/status');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('generating');
      expect(typeof res.body.generating).toBe('boolean');
    });
  });
});
