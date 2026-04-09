import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createScopeRoutes } from '../routes/scope-routes.js';
import { WorkflowEngine } from '../../shared/workflow-engine.js';
import { DEFAULT_CONFIG } from '../../shared/__fixtures__/workflow-configs.js';
import { createTestDb } from './helpers/db.js';
import { createMockEmitter } from './helpers/mock-emitter.js';
import type { ParsedScope } from '../parsers/scope-parser.js';

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
});
