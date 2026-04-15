import { describe, it, expect, beforeAll, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createConfigRoutes } from '../routes/config-routes.js';

// Hoisted mock for createFolder so tests can assert on it
const { mockCreateFolder } = vi.hoisted(() => ({
  mockCreateFolder: vi.fn(),
}));

// Mock ConfigService to avoid filesystem access
vi.mock('../services/config-service.js', () => {
  class MockConfigService {
    getBasePath(type: string) { return `/tmp/test-project/.claude/${type}`; }
    scanDirectory() { return [{ name: 'test.md', path: 'test.md', type: 'file' }]; }
    readFile() { return '# Test file content'; }
    writeFile() {}
    createFile() {}
    deleteFile() {}
    renameFile() {}
    createFolder = mockCreateFolder;
  }

  return {
    ConfigService: MockConfigService,
    isValidPrimitiveType: (type: string) => ['agents', 'skills', 'hooks'].includes(type),
  };
});

describe('config-routes', () => {
  let app: express.Express;

  const mockWorkflowService = {
    getActive: vi.fn().mockReturnValue({}),
  };

  beforeAll(() => {
    const router = createConfigRoutes({
      projectRoot: '/tmp/test-project',
      workflowService: mockWorkflowService as any,
      io: { emit: vi.fn() } as any,
    });

    app = express();
    app.use(express.json());
    app.use('/api/orbital', router);
  });

  // ─── GET /config/:type/tree ───────────────────────────────

  describe('GET /config/:type/tree', () => {
    it('returns directory tree for agents', async () => {
      const res = await request(app).get('/api/orbital/config/agents/tree');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('rejects invalid type (400)', async () => {
      const res = await request(app).get('/api/orbital/config/invalid/tree');
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Invalid type');
    });
  });

  // ─── GET /config/:type/file ───────────────────────────────

  describe('GET /config/:type/file', () => {
    it('returns file content with path param', async () => {
      const res = await request(app).get('/api/orbital/config/skills/file?path=test.md');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.content).toBe('# Test file content');
    });

    it('returns 400 without path param', async () => {
      const res = await request(app).get('/api/orbital/config/hooks/file');
      expect(res.status).toBe(400);
    });
  });

  // ─── PUT /config/:type/file ───────────────────────────────

  describe('PUT /config/:type/file', () => {
    it('saves file with valid body', async () => {
      const res = await request(app)
        .put('/api/orbital/config/agents/file')
        .send({ path: 'test.md', content: 'updated content' });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('rejects missing path (400)', async () => {
      const res = await request(app)
        .put('/api/orbital/config/agents/file')
        .send({ content: 'content' });
      expect(res.status).toBe(400);
    });

    it('rejects missing content (400)', async () => {
      const res = await request(app)
        .put('/api/orbital/config/agents/file')
        .send({ path: 'test.md' });
      expect(res.status).toBe(400);
    });
  });

  // ─── DELETE /config/:type/file ────────────────────────────

  describe('DELETE /config/:type/file', () => {
    it('deletes file with path', async () => {
      const res = await request(app).delete('/api/orbital/config/hooks/file?path=test.md');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('returns 400 without path param', async () => {
      const res = await request(app).delete('/api/orbital/config/hooks/file');
      expect(res.status).toBe(400);
    });
  });

  // ─── POST /config/:type/file (create) ─────────────────────

  describe('POST /config/:type/file', () => {
    it('creates file (201)', async () => {
      const res = await request(app)
        .post('/api/orbital/config/skills/file')
        .send({ path: 'new.md', content: 'new content' });
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
    });
  });

  // ─── POST /config/:type/rename ────────────────────────────

  describe('POST /config/:type/rename', () => {
    it('renames file with valid params', async () => {
      const res = await request(app)
        .post('/api/orbital/config/agents/rename')
        .send({ oldPath: 'old.md', newPath: 'new.md' });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('rejects missing oldPath (400)', async () => {
      const res = await request(app)
        .post('/api/orbital/config/agents/rename')
        .send({ newPath: 'new.md' });
      expect(res.status).toBe(400);
    });
  });

  // ─── POST /config/:type/folder ─────────────────────────────

  describe('POST /config/:type/folder', () => {
    it('creates folder (201)', async () => {
      const res = await request(app)
        .post('/api/orbital/config/skills/folder')
        .send({ path: 'new-folder' });
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(mockCreateFolder).toHaveBeenCalledWith(
        '/tmp/test-project/.claude/skills',
        'new-folder',
      );
    });

    it('rejects missing path (400)', async () => {
      const res = await request(app)
        .post('/api/orbital/config/skills/folder')
        .send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('path is required');
    });

    it('rejects invalid type (400)', async () => {
      const res = await request(app)
        .post('/api/orbital/config/invalid/folder')
        .send({ path: 'some-folder' });
      expect(res.status).toBe(400);
    });

    it('returns 500 when createFolder throws', async () => {
      mockCreateFolder.mockImplementationOnce(() => { throw new Error('Permission denied'); });

      const res = await request(app)
        .post('/api/orbital/config/hooks/folder')
        .send({ path: 'locked-folder' });
      expect(res.status).toBe(500);
    });
  });
});
