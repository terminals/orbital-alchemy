import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock child_process before importing GitService
vi.mock('child_process', () => {
  const fn = vi.fn();
  return { execFile: fn, __mockExecFile: fn };
});

// Mock worktree-manager
vi.mock('../utils/worktree-manager.js', () => ({
  listWorktrees: vi.fn().mockResolvedValue([]),
}));

// Mock logger
vi.mock('../utils/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

import { GitService } from './git-service.js';
import type { ScopeCache } from './scope-cache.js';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { __mockExecFile: mockExecFile } = await import('child_process') as any;

// ─── Helpers ────────────────────────────────────────────────

function mockScopeCache(): ScopeCache {
  return {
    getById: vi.fn().mockReturnValue(null),
  } as unknown as ScopeCache;
}

function setupExecFile(stdout: string): void {
  mockExecFile.mockImplementation(
    (_cmd: string, _args: string[], _opts: unknown, cb?: (err: unknown, result: { stdout: string }) => void) => {
      if (cb) {
        cb(null, { stdout });
      }
    },
  );
}

function setupExecFileMulti(responses: Map<string, string>): void {
  mockExecFile.mockImplementation(
    (_cmd: string, args: string[], _opts: unknown, cb?: (err: unknown, result: { stdout: string }) => void) => {
      if (!cb) return;
      const key = args.join(' ');
      for (const [pattern, stdout] of responses) {
        if (key.includes(pattern)) {
          cb(null, { stdout });
          return;
        }
      }
      cb(null, { stdout: '' });
    },
  );
}

function setupExecFileError(message: string): void {
  mockExecFile.mockImplementation(
    (_cmd: string, _args: string[], _opts: unknown, cb?: (err: unknown, result: unknown) => void) => {
      if (cb) {
        cb(new Error(message), null);
      }
    },
  );
}

// ─── Tests ──────────────────────────────────────────────────

describe('GitService', () => {
  let service: GitService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new GitService('/test/project', mockScopeCache());
    service.clearCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ─── getCommits() ─────────────────────────────────────────

  describe('getCommits()', () => {
    it('parses commit log output correctly', async () => {
      const gitOutput = [
        'abc123full|abc123|2026-01-01T10:00:00Z|John Doe|feat: add feature|HEAD -> main',
        'def456full|def456|2026-01-02T10:00:00Z|Jane Doe|fix: bug fix|origin/dev',
      ].join('\n');

      setupExecFile(gitOutput);

      const commits = await service.getCommits();
      expect(commits).toHaveLength(2);
      expect(commits[0].sha).toBe('abc123full');
      expect(commits[0].shortSha).toBe('abc123');
      expect(commits[0].message).toBe('feat: add feature');
      expect(commits[0].author).toBe('John Doe');
      expect(commits[0].date).toBe('2026-01-01T10:00:00Z');
    });

    it('extracts scope ID from branch refs', async () => {
      const gitOutput = 'abc|abc|2026-01-01T10:00:00Z|Author|message|feat/scope-42\n';
      setupExecFile(gitOutput);

      const commits = await service.getCommits();
      expect(commits[0].scopeId).toBe(42);
    });

    it('extracts scope ID from commit message', async () => {
      const gitOutput = 'abc|abc|2026-01-01T10:00:00Z|Author|scope-7 fix things|\n';
      setupExecFile(gitOutput);

      const commits = await service.getCommits();
      expect(commits[0].scopeId).toBe(7);
    });

    it('returns empty array on git error', async () => {
      setupExecFileError('git not found');

      const commits = await service.getCommits();
      expect(commits).toEqual([]);
    });

    it('handles empty lines in output', async () => {
      const gitOutput = 'abc|abc|2026-01-01T10:00:00Z|Author|msg|\n\n';
      setupExecFile(gitOutput);

      const commits = await service.getCommits();
      expect(commits).toHaveLength(1);
    });

    it('parses refs correctly', async () => {
      const gitOutput = 'abc|abc|2026-01-01T10:00:00Z|Author|msg|HEAD -> main, origin/main, tag: v1.0\n';
      setupExecFile(gitOutput);

      const commits = await service.getCommits();
      expect(commits[0].refs.length).toBeGreaterThan(0);
      expect(commits[0].branch).toBe('main');
    });

    it('respects limit and offset parameters', async () => {
      setupExecFile('');

      await service.getCommits({ limit: 10, offset: 5 });
      const args = mockExecFile.mock.calls[0][1];
      expect(args).toContain('--skip=5');
      expect(args).toContain('-10');
    });

    it('filters by branch when specified', async () => {
      setupExecFile('');

      await service.getCommits({ branch: 'dev' });
      const args = mockExecFile.mock.calls[0][1];
      expect(args).toContain('dev');
      expect(args).not.toContain('--all');
    });

    it('uses --all when branch is "all"', async () => {
      setupExecFile('');

      await service.getCommits({ branch: 'all' });
      const args = mockExecFile.mock.calls[0][1];
      expect(args).toContain('--all');
    });
  });

  // ─── getBranches() ────────────────────────────────────────

  describe('getBranches()', () => {
    it('parses branch listing output', async () => {
      const gitOutput = [
        ' |main|abc123|2026-01-01T10:00:00+00:00|initial commit',
        '*|dev|def456|2026-01-02T10:00:00+00:00|dev work',
      ].join('\n');

      setupExecFile(gitOutput);

      const branches = await service.getBranches();
      expect(branches).toHaveLength(2);
      expect(branches[0].name).toBe('main');
      expect(branches[0].isCurrent).toBe(false);
      expect(branches[1].name).toBe('dev');
      expect(branches[1].isCurrent).toBe(true);
    });

    it('detects scope ID from branch name', async () => {
      const gitOutput = ' |feat/scope-15|abc|2026-01-01T10:00:00+00:00|scope work\n';
      setupExecFile(gitOutput);

      const branches = await service.getBranches();
      expect(branches[0].scopeId).toBe(15);
    });

    it('detects stale branches (>7 days old)', async () => {
      const staleDate = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
      const gitOutput = ` |old-branch|abc|${staleDate}|old work\n`;
      setupExecFile(gitOutput);

      const branches = await service.getBranches();
      expect(branches[0].isStale).toBe(true);
    });

    it('marks recent branches as not stale', async () => {
      const recentDate = new Date().toISOString();
      const gitOutput = ` |new-branch|abc|${recentDate}|new work\n`;
      setupExecFile(gitOutput);

      const branches = await service.getBranches();
      expect(branches[0].isStale).toBe(false);
    });

    it('returns empty array on git error', async () => {
      setupExecFileError('git not found');

      const branches = await service.getBranches();
      expect(branches).toEqual([]);
    });

    it('skips HEAD entries', async () => {
      const gitOutput = [
        ' |HEAD|abc|2026-01-01T10:00:00+00:00|detached',
        ' |main|def|2026-01-01T10:00:00+00:00|main',
      ].join('\n');
      setupExecFile(gitOutput);

      const branches = await service.getBranches();
      expect(branches).toHaveLength(1);
      expect(branches[0].name).toBe('main');
    });
  });

  // ─── getOverview() ────────────────────────────────────────

  describe('getOverview()', () => {
    it('parses overview data correctly', async () => {
      const responses = new Map<string, string>();
      responses.set('--show-current', 'main\n');
      responses.set('--porcelain', ' M file.ts\n');
      responses.set('log HEAD', 'abc123|2026-01-01T10:00:00Z|initial commit\n');
      responses.set('rev-list', '0\t2\n');
      responses.set('--format=%(refname:short)', 'main\nfeat/scope-1\n');

      setupExecFileMulti(responses);

      const overview = await service.getOverview('trunk');
      expect(overview.currentBranch).toBe('main');
      expect(overview.dirty).toBe(true);
      expect(overview.branchingMode).toBe('trunk');
    });

    it('handles detached HEAD', async () => {
      const responses = new Map<string, string>();
      responses.set('--show-current', '\n');
      responses.set('--porcelain', '\n');
      responses.set('log HEAD', 'abc|2026-01-01T10:00:00Z|msg\n');
      responses.set('--format=%(refname:short)', '\n');

      setupExecFileMulti(responses);

      const overview = await service.getOverview('trunk');
      expect(overview.currentBranch).toBe('(detached)');
      expect(overview.detached).toBe(true);
    });
  });

  // ─── getActivitySeries() ──────────────────────────────────

  describe('getActivitySeries()', () => {
    it('returns empty array on git error', async () => {
      setupExecFileError('git not found');

      const series = await service.getActivitySeries();
      expect(series).toEqual([]);
    });
  });

  // ─── getStatusHash() ──────────────────────────────────────

  describe('getStatusHash()', () => {
    it('returns a hash string', async () => {
      const responses = new Map<string, string>();
      responses.set('rev-parse', 'abc123\n');
      responses.set('--porcelain', '\n');

      setupExecFileMulti(responses);

      const hash = await service.getStatusHash();
      expect(typeof hash).toBe('string');
      expect(hash).toContain(':');
    });
  });

  // ─── clearCache() ─────────────────────────────────────────

  describe('clearCache()', () => {
    it('clears the internal cache', async () => {
      setupExecFile('');
      // Make a cached call
      await service.getCommits();
      // Clear
      service.clearCache();
      // Next call should hit git again
      await service.getCommits();
      expect(mockExecFile).toHaveBeenCalledTimes(2);
    });
  });

  // ─── getDrift() ───────────────────────────────────────────

  describe('getDrift()', () => {
    it('parses drift commit output', async () => {
      const gitOutput = 'abc123|2026-01-01T10:00:00Z|feat: add x|Author\n';
      setupExecFile(gitOutput);

      const drift = await service.getDrift([{ from: 'dev', to: 'main' }]);
      expect(drift).toHaveLength(1);
      expect(drift[0].from).toBe('dev');
      expect(drift[0].to).toBe('main');
      expect(drift[0].count).toBe(1);
    });

    it('handles empty drift (branches are in sync)', async () => {
      setupExecFile('');

      const drift = await service.getDrift([{ from: 'dev', to: 'main' }]);
      expect(drift).toHaveLength(1);
      expect(drift[0].count).toBe(0);
    });
  });

  // ─── getHealthMetrics() ───────────────────────────────────

  describe('getHealthMetrics()', () => {
    it('returns a health metrics object with grade', async () => {
      const responses = new Map<string, string>();
      responses.set('7.days.ago', 'abc commit 1\ndef commit 2\n');
      responses.set('--show-current', 'main\n');
      responses.set('--porcelain', '\n');
      responses.set('log HEAD', '\n');
      responses.set('rev-list', '0\t0\n');
      responses.set('branch -a', '\n');
      responses.set('--format=%(refname:short)', '\n');
      responses.set('--format=%(HEAD)', '\n');

      setupExecFileMulti(responses);

      const metrics = await service.getHealthMetrics();
      expect(metrics).toHaveProperty('grade');
      expect(['A', 'B', 'C', 'D', 'F']).toContain(metrics.grade);
      expect(typeof metrics.commitsPerWeek).toBe('number');
      expect(typeof metrics.staleBranchCount).toBe('number');
    });

    it('factors PR ages into grade', async () => {
      setupExecFile('');

      const metrics = await service.getHealthMetrics([10, 15, 20]);
      expect(metrics.avgPrAgeDays).toBeGreaterThan(0);
    });
  });
});
