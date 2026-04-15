import { describe, it, expect, beforeAll, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createVersionRoutes } from '../routes/version-routes.js';

// Mock child_process
vi.mock('child_process', () => ({
  execFile: vi.fn((_cmd, _args, _opts, cb) => {
    if (typeof cb === 'function') cb(null, 'mock-output\n', '');
  }),
}));

// Mock package-info
vi.mock('../utils/package-info.js', () => ({
  getOrbitalRoot: vi.fn(() => '/tmp/mock-orbital'),
}));

// Mock fs
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    default: {
      ...actual,
      readFileSync: vi.fn((p: string) => {
        if (typeof p === 'string' && p.includes('package.json')) {
          return JSON.stringify({ version: '1.2.3' });
        }
        return actual.readFileSync(p as string, 'utf-8');
      }),
      existsSync: actual.existsSync,
    },
    readFileSync: vi.fn((p: string) => {
      if (typeof p === 'string' && p.includes('package.json')) {
        return JSON.stringify({ version: '1.2.3' });
      }
      return actual.readFileSync(p as string, 'utf-8');
    }),
    existsSync: actual.existsSync,
  };
});

// Mock util.promisify to return a mock execFileAsync
vi.mock('util', async () => {
  const actual = await vi.importActual<typeof import('util')>('util');
  return {
    ...actual,
    promisify: vi.fn(() => vi.fn().mockResolvedValue({ stdout: 'abc1234\n', stderr: '' })),
  };
});

describe('version-routes', () => {
  let app: express.Express;

  beforeAll(() => {
    const mockIo = {
      emit: vi.fn(),
    };

    const router = createVersionRoutes({ io: mockIo as any });

    app = express();
    app.use(express.json());
    app.use('/api/orbital', router);
  });

  describe('GET /version', () => {
    it('returns version info', async () => {
      const res = await request(app).get('/api/orbital/version');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('version');
      expect(res.body).toHaveProperty('commitSha');
      expect(res.body).toHaveProperty('branch');
    });
  });

  describe('GET /version/check', () => {
    it('returns update check result', async () => {
      const res = await request(app).get('/api/orbital/version/check');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('updateAvailable');
      expect(res.body).toHaveProperty('localSha');
    });
  });

  describe('POST /version/update', () => {
    it('returns 403 without X-Orbital-Action header', async () => {
      const res = await request(app).post('/api/orbital/version/update');
      expect(res.status).toBe(403);
      expect(res.body.error).toContain('Missing required');
    });
  });
});
