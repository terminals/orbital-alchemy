import { describe, it, expect, beforeEach, vi } from 'vitest';

// Use vi.hoisted to define mockExecFile before vi.mock is hoisted
const { mockExecFile } = vi.hoisted(() => ({
  mockExecFile: vi.fn(),
}));

// Mock the promisified execFile (the service uses execFile via promisify — safe, no shell)
vi.mock('util', () => ({
  promisify: () => mockExecFile,
}));

// Mock spawn for connectOAuth/connectWithToken — not tested here
vi.mock('child_process', () => ({
  execFile: vi.fn(),
  spawn: vi.fn(),
}));

import { GitHubService } from './github-service.js';

describe('GitHubService', () => {
  let service: GitHubService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new GitHubService('/test/project');
  });

  // ─── getStatus() ────────────────────────────────────────────

  describe('getStatus()', () => {
    it('returns not connected when gh CLI is missing', async () => {
      // which gh fails
      mockExecFile.mockRejectedValue(new Error('not found'));

      const status = await service.getStatus();
      expect(status.connected).toBe(false);
      expect(status.error).toBe('gh CLI not installed');
    });

    it('returns not connected when gh auth fails', async () => {
      // which gh succeeds, auth fails
      mockExecFile
        .mockResolvedValueOnce({ stdout: '/usr/local/bin/gh' }) // which
        .mockRejectedValueOnce(new Error('not authenticated'));  // gh api user

      const status = await service.getStatus();
      expect(status.connected).toBe(false);
      expect(status.error).toBe('gh not authenticated — run `gh auth login`');
    });

    it('returns connected with user and repo info', async () => {
      mockExecFile
        .mockResolvedValueOnce({ stdout: '/usr/local/bin/gh' }) // which
        .mockResolvedValueOnce({ stdout: 'testuser\n' })        // gh api user
        .mockResolvedValueOnce({                                 // gh repo view
          stdout: JSON.stringify({
            owner: { login: 'myorg' },
            name: 'myrepo',
            defaultBranchRef: { name: 'main' },
            visibility: 'PUBLIC',
            url: 'https://github.com/myorg/myrepo',
          }),
        })
        .mockResolvedValueOnce({ stdout: '[{"number":1},{"number":2}]' }); // gh pr list

      const status = await service.getStatus();
      expect(status.connected).toBe(true);
      expect(status.authUser).toBe('testuser');
      expect(status.repo).toEqual({
        owner: 'myorg',
        name: 'myrepo',
        fullName: 'myorg/myrepo',
        defaultBranch: 'main',
        visibility: 'public',
        url: 'https://github.com/myorg/myrepo',
      });
      expect(status.openPRs).toBe(2);
    });

    it('returns not connected when not a GitHub repo', async () => {
      mockExecFile
        .mockResolvedValueOnce({ stdout: '/usr/local/bin/gh' }) // which
        .mockResolvedValueOnce({ stdout: 'testuser\n' })        // gh api user
        .mockRejectedValueOnce(new Error('not a repo'));         // gh repo view

      const status = await service.getStatus();
      expect(status.connected).toBe(false);
      expect(status.error).toBe('Not a GitHub repository');
    });

    it('caches status result', async () => {
      mockExecFile
        .mockResolvedValueOnce({ stdout: '/usr/local/bin/gh' })
        .mockResolvedValueOnce({ stdout: 'user\n' })
        .mockResolvedValueOnce({ stdout: JSON.stringify({ owner: { login: 'o' }, name: 'r', defaultBranchRef: { name: 'main' }, visibility: 'private', url: '' }) })
        .mockResolvedValueOnce({ stdout: '[]' });

      await service.getStatus();
      const callCount = mockExecFile.mock.calls.length;

      // Second call should use cache
      await service.getStatus();
      expect(mockExecFile.mock.calls.length).toBe(callCount);
    });
  });

  // ─── getOpenPRs() ──────────────────────────────────────────

  describe('getOpenPRs()', () => {
    it('parses PR list and extracts scope IDs from titles and branches', async () => {
      mockExecFile.mockResolvedValueOnce({
        stdout: JSON.stringify([
          {
            number: 42,
            title: 'feat/scope-15: Add login',
            author: { login: 'testuser' },
            headRefName: 'feat/scope-15',
            baseRefName: 'main',
            state: 'OPEN',
            url: 'https://github.com/org/repo/pull/42',
            createdAt: '2026-01-01T00:00:00Z',
            updatedAt: '2026-01-02T00:00:00Z',
          },
        ]),
      });

      const prs = await service.getOpenPRs();
      expect(prs).toHaveLength(1);
      expect(prs[0].number).toBe(42);
      expect(prs[0].title).toBe('feat/scope-15: Add login');
      expect(prs[0].branch).toBe('feat/scope-15');
      expect(prs[0].scopeIds).toContain(15);
    });

    it('returns empty array when gh command fails', async () => {
      mockExecFile.mockRejectedValueOnce(new Error('network error'));

      const prs = await service.getOpenPRs();
      expect(prs).toEqual([]);
    });

    it('extracts multiple scope IDs from title + branch', async () => {
      mockExecFile.mockResolvedValueOnce({
        stdout: JSON.stringify([
          {
            number: 1,
            title: 'scope-10 and scope-20',
            author: { login: 'dev' },
            headRefName: 'feat-30',
            baseRefName: 'main',
            state: 'OPEN',
            url: '',
            createdAt: '',
            updatedAt: '',
          },
        ]),
      });

      const prs = await service.getOpenPRs();
      expect(prs[0].scopeIds).toContain(10);
      expect(prs[0].scopeIds).toContain(20);
      expect(prs[0].scopeIds).toContain(30);
    });
  });

  // ─── getAuthStatus() ──────────────────────────────────────

  describe('getAuthStatus()', () => {
    it('returns authenticated with user when gh succeeds', async () => {
      mockExecFile.mockResolvedValueOnce({ stdout: 'myuser\n' });

      const result = await service.getAuthStatus();
      expect(result.authenticated).toBe(true);
      expect(result.user).toBe('myuser');
    });

    it('returns not authenticated when gh fails', async () => {
      mockExecFile.mockRejectedValueOnce(new Error('auth required'));

      const result = await service.getAuthStatus();
      expect(result.authenticated).toBe(false);
    });
  });

  // ─── getCheckRuns() ────────────────────────────────────────

  describe('getCheckRuns()', () => {
    it('parses check run results', async () => {
      mockExecFile.mockResolvedValueOnce({
        stdout: JSON.stringify([
          { name: 'CI', status: 'completed', conclusion: 'success', html_url: 'https://...' },
          { name: 'Lint', status: 'completed', conclusion: 'failure', html_url: 'https://...' },
        ]),
      });

      const checks = await service.getCheckRuns('abc123');
      expect(checks).toHaveLength(2);
      expect(checks[0].name).toBe('CI');
      expect(checks[0].conclusion).toBe('success');
      expect(checks[1].conclusion).toBe('failure');
    });

    it('returns empty for invalid ref with special chars', async () => {
      // The regex /^[a-zA-Z0-9._/-]+$/ blocks chars like spaces, semicolons, etc.
      const checks = await service.getCheckRuns('ref; rm -rf /');
      expect(checks).toEqual([]);
      expect(mockExecFile).not.toHaveBeenCalled();
    });

    it('returns empty on API error', async () => {
      mockExecFile.mockRejectedValueOnce(new Error('rate limited'));

      const checks = await service.getCheckRuns('abc123');
      expect(checks).toEqual([]);
    });
  });
});
