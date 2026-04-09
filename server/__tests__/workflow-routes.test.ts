import { describe, it, expect, beforeAll, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createWorkflowRoutes } from '../routes/workflow-routes.js';
import { WorkflowEngine } from '../../shared/workflow-engine.js';
import { DEFAULT_CONFIG, MINIMAL_CONFIG } from '../../shared/__fixtures__/workflow-configs.js';

describe('workflow-routes', () => {
  let app: express.Express;
  const engine = new WorkflowEngine(DEFAULT_CONFIG);

  const mockWorkflowService = {
    getActive: vi.fn().mockReturnValue(DEFAULT_CONFIG),
    updateActive: vi.fn().mockReturnValue({ valid: true, errors: [], warnings: [] }),
    listPresets: vi.fn().mockReturnValue([{ name: 'default', createdAt: '2026-01-01', listCount: 7, edgeCount: 14 }]),
    savePreset: vi.fn(),
    getPreset: vi.fn((name: string) => name === 'default' ? DEFAULT_CONFIG : (() => { throw new Error('Not found'); })()),
    deletePreset: vi.fn((name: string) => { if (name === 'default') throw new Error('Cannot delete default'); }),
    previewMigration: vi.fn().mockReturnValue({ orphanedScopes: [], addedLists: [], removedLists: [], scopeMoves: [] }),
    applyMigration: vi.fn().mockReturnValue({ orphanedScopes: [], addedLists: [], removedLists: [], scopeMoves: [] }),
    getEngine: vi.fn().mockReturnValue(engine),
  };

  beforeAll(() => {
    const router = createWorkflowRoutes({
      workflowService: mockWorkflowService as any,
      projectRoot: '/tmp/test-project',
    });

    app = express();
    app.use(express.json());
    app.use('/api/orbital', router);
  });

  describe('GET /workflow', () => {
    it('returns active workflow config', async () => {
      const res = await request(app).get('/api/orbital/workflow');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Default Workflow');
    });
  });

  describe('PUT /workflow', () => {
    it('updates workflow config', async () => {
      const res = await request(app)
        .put('/api/orbital/workflow')
        .send(MINIMAL_CONFIG);
      expect(res.status).toBe(200);
    });

    it('returns 400 for invalid config', async () => {
      mockWorkflowService.updateActive.mockReturnValueOnce({ valid: false, errors: ['Missing lists'], warnings: [] });
      const res = await request(app)
        .put('/api/orbital/workflow')
        .send({ version: 1, name: 'Bad', lists: [], edges: [] });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /workflow/presets', () => {
    it('returns preset list', async () => {
      const res = await request(app).get('/api/orbital/workflow/presets');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  describe('POST /workflow/presets', () => {
    it('saves preset with valid name', async () => {
      const res = await request(app)
        .post('/api/orbital/workflow/presets')
        .send({ name: 'my-preset' });
      expect(res.status).toBe(200);
      expect(mockWorkflowService.savePreset).toHaveBeenCalledWith('my-preset');
    });

    it('rejects missing name (400)', async () => {
      const res = await request(app)
        .post('/api/orbital/workflow/presets')
        .send({});
      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /workflow/presets/:name', () => {
    it('rejects deleting default preset', async () => {
      const res = await request(app).delete('/api/orbital/workflow/presets/default');
      expect(res.status).toBe(400);
    });
  });

  describe('GET /workflow/hooks', () => {
    it('returns hooks with edge mapping', async () => {
      const res = await request(app).get('/api/orbital/workflow/hooks');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('GET /workflow/hooks/:id/source', () => {
    it('rejects path traversal attempts', async () => {
      // The engine has hooks with targets like '.claude/hooks/blocker-check.sh'
      // Trying to traverse out should fail
      const res = await request(app).get('/api/orbital/workflow/hooks/../../etc/passwd/source');
      expect([400, 404]).toContain(res.status);
    });
  });

  describe('POST /workflow/preview', () => {
    it('returns migration preview', async () => {
      const res = await request(app)
        .post('/api/orbital/workflow/preview')
        .send(MINIMAL_CONFIG);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });
});
