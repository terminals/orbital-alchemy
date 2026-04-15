import { describe, it, expect, beforeAll, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createSprintRoutes } from '../routes/sprint-routes.js';

describe('sprint-routes', () => {
  let app: express.Express;

  const mockSprintService = {
    create: vi.fn().mockReturnValue({ id: 1, name: 'Sprint 1', status: 'assembling', scope_ids: [], scopes: [], layers: null, progress: { pending: 0, in_progress: 0, completed: 0, failed: 0, skipped: 0 } }),
    getAll: vi.fn().mockReturnValue([]),
    getById: vi.fn((id: number) => id === 1 ? { id: 1, name: 'Sprint 1', status: 'assembling', scope_ids: [], scopes: [] } : null),
    rename: vi.fn().mockReturnValue(true),
    delete: vi.fn().mockReturnValue(true),
    addScopes: vi.fn().mockReturnValue({ added: [1, 2], unmet_dependencies: [] }),
    removeScopes: vi.fn().mockReturnValue(true),
  };

  const mockSprintOrchestrator = {
    startSprint: vi.fn().mockReturnValue({ ok: true, layers: [[1], [2]] }),
    cancelSprint: vi.fn().mockReturnValue({ ok: true }),
    getExecutionGraph: vi.fn().mockReturnValue({ nodes: [], edges: [] }),
  };

  const mockBatchOrchestrator = {
    dispatch: vi.fn().mockReturnValue({ ok: true }),
  };

  beforeAll(() => {
    const router = createSprintRoutes({
      sprintService: mockSprintService as any,
      sprintOrchestrator: mockSprintOrchestrator as any,
      batchOrchestrator: mockBatchOrchestrator as any,
    });

    app = express();
    app.use(express.json());
    app.use('/api/orbital', router);
  });

  describe('POST /sprints', () => {
    it('creates sprint with name (201)', async () => {
      const res = await request(app)
        .post('/api/orbital/sprints')
        .send({ name: 'New Sprint' });
      expect(res.status).toBe(201);
      expect(mockSprintService.create).toHaveBeenCalledWith('New Sprint', expect.anything());
    });

    it('rejects empty name (400)', async () => {
      const res = await request(app)
        .post('/api/orbital/sprints')
        .send({ name: '  ' });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /sprints', () => {
    it('returns sprint list', async () => {
      const res = await request(app).get('/api/orbital/sprints');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('passes status filter', async () => {
      await request(app).get('/api/orbital/sprints?status=assembling');
      expect(mockSprintService.getAll).toHaveBeenCalledWith('assembling', undefined);
    });
  });

  describe('PATCH /sprints/:id', () => {
    it('renames sprint', async () => {
      const res = await request(app)
        .patch('/api/orbital/sprints/1')
        .send({ name: 'Renamed' });
      expect(res.status).toBe(200);
    });

    it('rejects missing name (400)', async () => {
      const res = await request(app)
        .patch('/api/orbital/sprints/1')
        .send({});
      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /sprints/:id', () => {
    it('deletes sprint', async () => {
      const res = await request(app).delete('/api/orbital/sprints/1');
      expect(res.status).toBe(200);
    });
  });

  describe('POST /sprints/:id/scopes', () => {
    it('adds scopes to sprint', async () => {
      const res = await request(app)
        .post('/api/orbital/sprints/1/scopes')
        .send({ scope_ids: [1, 2] });
      expect(res.status).toBe(200);
    });

    it('rejects empty scope_ids (400)', async () => {
      const res = await request(app)
        .post('/api/orbital/sprints/1/scopes')
        .send({ scope_ids: [] });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /sprints/:id/dispatch', () => {
    it('dispatches sprint', async () => {
      const res = await request(app)
        .post('/api/orbital/sprints/1/dispatch')
        .send({});
      expect(res.status).toBe(200);
    });
  });

  describe('GET /sprints/:id/graph', () => {
    it('returns execution graph', async () => {
      const res = await request(app).get('/api/orbital/sprints/1/graph');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ nodes: [], edges: [] });
      expect(mockSprintOrchestrator.getExecutionGraph).toHaveBeenCalledWith(1);
    });

    it('returns 404 for unknown sprint', async () => {
      mockSprintOrchestrator.getExecutionGraph.mockReturnValueOnce(null);

      const res = await request(app).get('/api/orbital/sprints/999/graph');
      expect(res.status).toBe(404);
      expect(res.body.error).toContain('Sprint not found');
    });
  });

  describe('POST /sprints/:id/cancel', () => {
    it('cancels a sprint', async () => {
      const res = await request(app).post('/api/orbital/sprints/1/cancel');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(mockSprintOrchestrator.cancelSprint).toHaveBeenCalledWith(1);
    });

    it('returns 400 when sprint cannot be cancelled', async () => {
      mockSprintOrchestrator.cancelSprint.mockReturnValueOnce(false);

      const res = await request(app).post('/api/orbital/sprints/999/cancel');
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('cannot be cancelled');
    });
  });
});
