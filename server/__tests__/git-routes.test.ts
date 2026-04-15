import { describe, it, expect, beforeAll, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createGitRoutes } from '../routes/git-routes.js';
import { WorkflowEngine } from '../../shared/workflow-engine.js';
import { DEFAULT_CONFIG } from '../../shared/__fixtures__/workflow-configs.js';

describe('git-routes', () => {
  let app: express.Express;

  const mockGitService = {
    getOverview: vi.fn().mockResolvedValue({
      branchingMode: 'trunk',
      currentBranch: 'main',
      dirty: false,
      detached: false,
      mainHead: { sha: 'abc123', message: 'init', date: '2026-01-01' },
      aheadBehind: { ahead: 0, behind: 0 },
      worktreeCount: 1,
      featureBranchCount: 0,
    }),
    getCommits: vi.fn().mockResolvedValue([
      { sha: 'abc123', shortSha: 'abc', message: 'init', author: 'test', date: '2026-01-01', branch: 'main', scopeId: null, refs: [] },
    ]),
    getBranches: vi.fn().mockResolvedValue([
      { name: 'main', isRemote: false, isCurrent: true, headSha: 'abc123', headMessage: 'init', headDate: '2026-01-01', aheadBehind: null, scopeId: null, isStale: false },
    ]),
    getEnhancedWorktrees: vi.fn().mockResolvedValue([]),
    getDrift: vi.fn().mockResolvedValue([]),
    getHealthMetrics: vi.fn().mockResolvedValue({ score: 100, checks: [] }),
    getActivitySeries: vi.fn().mockResolvedValue([
      { date: '2026-04-15', count: 5 },
      { date: '2026-04-14', count: 3 },
    ]),
  };

  const mockGithubService = {
    getStatus: vi.fn().mockResolvedValue({
      connected: true,
      authUser: 'testuser',
      repo: { owner: 'test', name: 'repo', fullName: 'test/repo', defaultBranch: 'main', visibility: 'private', url: 'https://github.com/test/repo' },
      openPRs: 2,
      error: null,
    }),
    getOpenPRs: vi.fn().mockResolvedValue([
      { number: 1, title: 'PR 1', author: 'test', branch: 'feat-1', baseBranch: 'main', state: 'open', url: 'https://github.com/test/repo/pull/1', createdAt: '2026-04-10', scopeIds: [] },
    ]),
    connectOAuth: vi.fn().mockResolvedValue({ success: true }),
    connectWithToken: vi.fn().mockResolvedValue({ success: true }),
    getAuthStatus: vi.fn().mockResolvedValue({ authenticated: true, user: 'testuser' }),
    disconnect: vi.fn().mockResolvedValue({ success: true }),
    getCheckRuns: vi.fn().mockResolvedValue([
      { name: 'build', status: 'completed', conclusion: 'success', url: 'https://github.com/test/repo/runs/1' },
    ]),
  };

  beforeAll(() => {
    const engine = new WorkflowEngine(DEFAULT_CONFIG);

    const router = createGitRoutes({
      gitService: mockGitService as any,
      githubService: mockGithubService as any,
      engine,
    });

    app = express();
    app.use(express.json());
    app.use('/api/orbital', router);
  });

  // ─── Existing route coverage ─────────────────────────────

  describe('GET /git/overview', () => {
    it('returns git overview', async () => {
      const res = await request(app).get('/api/orbital/git/overview');
      expect(res.status).toBe(200);
      expect(res.body.branchingMode).toBe('trunk');
      expect(res.body.currentBranch).toBe('main');
    });

    it('returns 500 on service error', async () => {
      mockGitService.getOverview.mockRejectedValueOnce(new Error('git failed'));
      const res = await request(app).get('/api/orbital/git/overview');
      expect(res.status).toBe(500);
      expect(res.body.error).toContain('Failed');
    });
  });

  describe('GET /git/commits', () => {
    it('returns commits', async () => {
      const res = await request(app).get('/api/orbital/git/commits');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('GET /git/branches', () => {
    it('returns branches', async () => {
      const res = await request(app).get('/api/orbital/git/branches');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('GET /github/status', () => {
    it('returns GitHub status', async () => {
      const res = await request(app).get('/api/orbital/github/status');
      expect(res.status).toBe(200);
      expect(res.body.connected).toBe(true);
    });
  });

  describe('GET /github/prs', () => {
    it('returns open PRs', async () => {
      const res = await request(app).get('/api/orbital/github/prs');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  // ─── New route tests (C4) ────────────────────────────────

  describe('POST /github/connect', () => {
    it('connects via OAuth when no method specified', async () => {
      const res = await request(app)
        .post('/api/orbital/github/connect')
        .send({});
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(mockGithubService.connectOAuth).toHaveBeenCalled();
    });

    it('connects via PAT when method is pat', async () => {
      const res = await request(app)
        .post('/api/orbital/github/connect')
        .send({ method: 'pat', token: 'test-token-not-a-real-pat' });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(mockGithubService.connectWithToken).toHaveBeenCalledWith('test-token-not-a-real-pat');
    });

    it('returns 500 on connection failure', async () => {
      mockGithubService.connectOAuth.mockRejectedValueOnce(new Error('OAuth failed'));
      const res = await request(app)
        .post('/api/orbital/github/connect')
        .send({});
      expect(res.status).toBe(500);
      expect(res.body.error).toContain('Failed to connect');
    });
  });

  describe('GET /github/auth-status', () => {
    it('returns authenticated status', async () => {
      const res = await request(app).get('/api/orbital/github/auth-status');
      expect(res.status).toBe(200);
      expect(res.body.authenticated).toBe(true);
      expect(res.body.user).toBe('testuser');
    });

    it('returns 500 on auth check failure', async () => {
      mockGithubService.getAuthStatus.mockRejectedValueOnce(new Error('auth check failed'));
      const res = await request(app).get('/api/orbital/github/auth-status');
      expect(res.status).toBe(500);
      expect(res.body.error).toContain('Failed to check auth');
    });
  });

  describe('POST /github/disconnect', () => {
    it('disconnects GitHub integration', async () => {
      const res = await request(app)
        .post('/api/orbital/github/disconnect');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(mockGithubService.disconnect).toHaveBeenCalled();
    });

    it('returns 500 on disconnect failure', async () => {
      mockGithubService.disconnect.mockRejectedValueOnce(new Error('disconnect failed'));
      const res = await request(app)
        .post('/api/orbital/github/disconnect');
      expect(res.status).toBe(500);
      expect(res.body.error).toContain('Failed to disconnect');
    });
  });

  describe('GET /github/checks/:ref', () => {
    it('returns check runs for a ref', async () => {
      const res = await request(app).get('/api/orbital/github/checks/abc123');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body[0].name).toBe('build');
      expect(res.body[0].conclusion).toBe('success');
      expect(mockGithubService.getCheckRuns).toHaveBeenCalledWith('abc123');
    });

    it('returns 500 on check runs failure', async () => {
      mockGithubService.getCheckRuns.mockRejectedValueOnce(new Error('API error'));
      const res = await request(app).get('/api/orbital/github/checks/abc123');
      expect(res.status).toBe(500);
      expect(res.body.error).toContain('Failed to get checks');
    });
  });

  describe('GET /git/activity', () => {
    it('returns activity series with default days', async () => {
      const res = await request(app).get('/api/orbital/git/activity');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body[0]).toHaveProperty('date');
      expect(res.body[0]).toHaveProperty('count');
      expect(mockGitService.getActivitySeries).toHaveBeenCalledWith(30);
    });

    it('accepts custom days parameter', async () => {
      const res = await request(app).get('/api/orbital/git/activity?days=7');
      expect(res.status).toBe(200);
      expect(mockGitService.getActivitySeries).toHaveBeenCalledWith(7);
    });

    it('returns 500 on service error', async () => {
      mockGitService.getActivitySeries.mockRejectedValueOnce(new Error('git log failed'));
      const res = await request(app).get('/api/orbital/git/activity');
      expect(res.status).toBe(500);
      expect(res.body.error).toContain('Failed to get activity');
    });
  });
});
