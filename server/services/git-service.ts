import { execFile as execFileCb } from 'child_process';
import { promisify } from 'util';
import { listWorktrees } from '../utils/worktree-manager.js';
import type { ScopeCache } from './scope-cache.js';

const execFile = promisify(execFileCb);

// ─── Types ──────────────────────────────────────────────────

export interface GitOverview {
  branchingMode: 'trunk' | 'worktree';
  currentBranch: string;
  dirty: boolean;
  detached: boolean;
  mainHead: { sha: string; message: string; date: string } | null;
  aheadBehind: { ahead: number; behind: number } | null;
  worktreeCount: number;
  featureBranchCount: number;
}

export interface CommitEntry {
  sha: string;
  shortSha: string;
  message: string;
  author: string;
  date: string;
  branch: string;
  scopeId: number | null;
  refs: string[];
}

export interface BranchInfo {
  name: string;
  isRemote: boolean;
  isCurrent: boolean;
  headSha: string;
  headMessage: string;
  headDate: string;
  aheadBehind: { ahead: number; behind: number } | null;
  scopeId: number | null;
  isStale: boolean;
}

export interface WorktreeDetail {
  path: string;
  branch: string;
  head: string;
  scopeId: number | null;
  scopeTitle: string | null;
  scopeStatus: string | null;
  dirty: boolean;
  aheadBehind: { ahead: number; behind: number } | null;
}

export interface DriftPair {
  from: string;
  to: string;
  count: number;
  commits: Array<{ sha: string; message: string; author: string; date: string }>;
}

// ─── Cache Utility ──────────────────────────────────────────

interface CacheEntry<T> { data: T; ts: number }

const CACHE_TTL = 60_000; // 60 seconds

function cached<T>(cache: Map<string, CacheEntry<T>>, key: string): T | null {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.ts < CACHE_TTL) return entry.data;
  return null;
}

function setCache<T>(cache: Map<string, CacheEntry<T>>, key: string, data: T): void {
  cache.set(key, { data, ts: Date.now() });
}

// ─── Service ────────────────────────────────────────────────

const SCOPE_BRANCH_RE = /(?:feat|fix|scope)[/-](?:scope-)?(\d+)/;

export class GitService {
  private cache = new Map<string, CacheEntry<unknown>>();

  constructor(
    private projectRoot: string,
    private scopeCache: ScopeCache,
  ) {}

  private async git(args: string[], cwd?: string): Promise<string> {
    // Uses execFile (not exec) — safe against shell injection
    const { stdout } = await execFile('git', args, {
      cwd: cwd ?? this.projectRoot,
      maxBuffer: 10 * 1024 * 1024,
    });
    return stdout;
  }

  // ─── Overview ──────────────────────────────────────────────

  async getOverview(branchingMode: 'trunk' | 'worktree'): Promise<GitOverview> {
    const cacheKey = `overview:${branchingMode}`;
    const hit = cached<GitOverview>(this.cache as Map<string, CacheEntry<GitOverview>>, cacheKey);
    if (hit) return hit;

    const [branchRaw, statusRaw] = await Promise.all([
      this.git(['branch', '--show-current']).catch(() => ''),
      this.git(['status', '--porcelain']).catch(() => ''),
    ]);

    const currentBranch = branchRaw.trim() || '(detached)';
    const dirty = statusRaw.trim().length > 0;
    const detached = !branchRaw.trim();

    // Main HEAD
    let mainHead: GitOverview['mainHead'] = null;
    try {
      const raw = await this.git(['log', 'HEAD', '-1', '--format=%H|%aI|%s']);
      const [sha, date, ...msgParts] = raw.trim().split('|');
      if (sha) mainHead = { sha, message: msgParts.join('|'), date };
    } catch { /* no commits yet */ }

    // Ahead/behind relative to origin/main (or origin/master)
    let aheadBehind: GitOverview['aheadBehind'] = null;
    if (!detached) {
      try {
        const raw = await this.git(['rev-list', '--left-right', '--count', `origin/main...${currentBranch}`]);
        const [behind, ahead] = raw.trim().split('\t').map(Number);
        aheadBehind = { ahead: ahead ?? 0, behind: behind ?? 0 };
      } catch {
        try {
          const raw = await this.git(['rev-list', '--left-right', '--count', `origin/master...${currentBranch}`]);
          const [behind, ahead] = raw.trim().split('\t').map(Number);
          aheadBehind = { ahead: ahead ?? 0, behind: behind ?? 0 };
        } catch { /* no remote tracking */ }
      }
    }

    // Worktree and feature branch counts
    let worktreeCount = 0;
    let featureBranchCount = 0;
    try {
      const wts = await listWorktrees(this.projectRoot);
      worktreeCount = wts.length;
    } catch { /* ok */ }
    try {
      const raw = await this.git(['branch', '--format=%(refname:short)']);
      const branches = raw.trim().split('\n').filter(Boolean);
      featureBranchCount = branches.filter(b => SCOPE_BRANCH_RE.test(b) || b.startsWith('feat/')).length;
    } catch { /* ok */ }

    const result: GitOverview = {
      branchingMode,
      currentBranch,
      dirty,
      detached,
      mainHead,
      aheadBehind,
      worktreeCount,
      featureBranchCount,
    };
    setCache(this.cache as Map<string, CacheEntry<GitOverview>>, cacheKey, result);
    return result;
  }

  // ─── Commits ──────────────────────────────────────────────

  async getCommits(opts: { branch?: string; limit?: number; offset?: number } = {}): Promise<CommitEntry[]> {
    const { branch, limit = 50, offset = 0 } = opts;
    const cacheKey = `commits:${branch ?? 'all'}:${limit}:${offset}`;
    const hit = cached<CommitEntry[]>(this.cache as Map<string, CacheEntry<CommitEntry[]>>, cacheKey);
    if (hit) return hit;

    const args = ['log', '--format=%H|%h|%aI|%an|%s|%D'];
    if (branch && branch !== 'all') {
      args.push(branch);
    } else {
      args.push('--all');
    }
    args.push(`--skip=${offset}`, `-${limit}`);

    let raw: string;
    try {
      raw = await this.git(args);
    } catch {
      return [];
    }

    const commits: CommitEntry[] = [];
    for (const line of raw.trim().split('\n')) {
      if (!line) continue;
      const parts = line.split('|');
      const sha = parts[0];
      const shortSha = parts[1];
      const date = parts[2];
      const author = parts[3];
      const message = parts[4];
      const refStr = parts.slice(5).join('|');

      const refs = refStr
        ? refStr.split(',').map(r => r.trim()).filter(Boolean)
        : [];

      // Extract scope ID from refs or message
      let scopeId: number | null = null;
      for (const ref of refs) {
        const m = SCOPE_BRANCH_RE.exec(ref);
        if (m) { scopeId = parseInt(m[1]); break; }
      }
      if (!scopeId) {
        const m = SCOPE_BRANCH_RE.exec(message);
        if (m) scopeId = parseInt(m[1]);
      }

      // Derive branch from first ref that looks like a branch
      let branchName = '';
      for (const ref of refs) {
        const cleaned = ref.replace(/^HEAD -> /, '').replace(/^origin\//, '');
        if (cleaned && !cleaned.startsWith('tag:')) {
          branchName = cleaned;
          break;
        }
      }

      commits.push({ sha, shortSha, message, author, date, branch: branchName, scopeId, refs });
    }

    setCache(this.cache as Map<string, CacheEntry<CommitEntry[]>>, cacheKey, commits);
    return commits;
  }

  // ─── Branches ──────────────────────────────────────────────

  async getBranches(): Promise<BranchInfo[]> {
    const hit = cached<BranchInfo[]>(this.cache as Map<string, CacheEntry<BranchInfo[]>>, 'branches');
    if (hit) return hit;

    let raw: string;
    try {
      raw = await this.git([
        'branch', '-a',
        '--format=%(HEAD)|%(refname:short)|%(objectname:short)|%(committerdate:iso-strict)|%(subject)',
      ]);
    } catch {
      return [];
    }

    const now = Date.now();
    const STALE_MS = 7 * 24 * 60 * 60 * 1000;
    const branches: BranchInfo[] = [];

    for (const line of raw.trim().split('\n')) {
      if (!line) continue;
      const [headMarker, name, headSha, headDate, ...msgParts] = line.split('|');
      if (!name || name.includes('HEAD')) continue;

      const isCurrent = headMarker === '*';
      const isRemote = name.startsWith('remotes/') || name.startsWith('origin/');
      const cleanName = name.replace(/^remotes\//, '');

      // Skip remote duplicates of local branches
      if (isRemote) {
        const localName = cleanName.replace(/^origin\//, '');
        if (branches.some(b => !b.isRemote && b.name === localName)) continue;
      }

      const scopeMatch = SCOPE_BRANCH_RE.exec(cleanName);
      const scopeId = scopeMatch ? parseInt(scopeMatch[1]) : null;
      const isStale = headDate ? (now - new Date(headDate).getTime() > STALE_MS) : false;

      // Ahead/behind relative to origin/main
      let aheadBehind: BranchInfo['aheadBehind'] = null;
      if (!isRemote) {
        try {
          const countRaw = await this.git(['rev-list', '--left-right', '--count', `origin/main...${name}`]);
          const [behind, ahead] = countRaw.trim().split('\t').map(Number);
          aheadBehind = { ahead: ahead ?? 0, behind: behind ?? 0 };
        } catch { /* no remote */ }
      }

      branches.push({
        name: cleanName,
        isRemote,
        isCurrent,
        headSha: headSha ?? '',
        headMessage: msgParts.join('|'),
        headDate: headDate ?? '',
        aheadBehind,
        scopeId,
        isStale,
      });
    }

    setCache(this.cache as Map<string, CacheEntry<BranchInfo[]>>, 'branches', branches);
    return branches;
  }

  // ─── Enhanced Worktrees ────────────────────────────────────

  async getEnhancedWorktrees(): Promise<WorktreeDetail[]> {
    const hit = cached<WorktreeDetail[]>(this.cache as Map<string, CacheEntry<WorktreeDetail[]>>, 'worktrees-enhanced');
    if (hit) return hit;

    let wts: Array<{ path: string; branch: string; scopeId: number }>;
    try {
      wts = await listWorktrees(this.projectRoot);
    } catch {
      return [];
    }

    const results: WorktreeDetail[] = [];
    for (const wt of wts) {
      let head = '';
      try {
        head = (await this.git(['rev-parse', '--short', 'HEAD'], wt.path)).trim();
      } catch { /* ok */ }

      let dirty = false;
      try {
        const status = (await this.git(['status', '--porcelain'], wt.path)).trim();
        dirty = status.length > 0;
      } catch { /* ok */ }

      let aheadBehind: WorktreeDetail['aheadBehind'] = null;
      try {
        const branchName = wt.branch.replace(/^refs\/heads\//, '');
        const countRaw = await this.git(['rev-list', '--left-right', '--count', `origin/main...${branchName}`], wt.path);
        const [behind, ahead] = countRaw.trim().split('\t').map(Number);
        aheadBehind = { ahead: ahead ?? 0, behind: behind ?? 0 };
      } catch { /* ok */ }

      const scope = wt.scopeId ? this.scopeCache.getById(wt.scopeId) : null;

      results.push({
        path: wt.path,
        branch: wt.branch.replace(/^refs\/heads\//, ''),
        head,
        scopeId: wt.scopeId,
        scopeTitle: scope?.title ?? null,
        scopeStatus: scope?.status ?? null,
        dirty,
        aheadBehind,
      });
    }

    setCache(this.cache as Map<string, CacheEntry<WorktreeDetail[]>>, 'worktrees-enhanced', results);
    return results;
  }

  // ─── Dynamic Drift ─────────────────────────────────────────

  async getDrift(gitBranches: Array<{ from: string; to: string }>): Promise<DriftPair[]> {
    const cacheKey = `drift:${gitBranches.map(b => `${b.from}-${b.to}`).join(',')}`;
    const hit = cached<DriftPair[]>(this.cache as Map<string, CacheEntry<DriftPair[]>>, cacheKey);
    if (hit) return hit;

    const pairs: DriftPair[] = [];
    for (const { from, to } of gitBranches) {
      try {
        const raw = await this.git([
          'log', `origin/${from}`, '--not', `origin/${to}`,
          '--reverse', '--format=%H|%aI|%s|%an',
        ]);
        const commits = raw.trim().split('\n').filter(Boolean).map(line => {
          const [sha, date, ...rest] = line.split('|');
          return { sha, date, message: rest.slice(0, -1).join('|'), author: rest[rest.length - 1] };
        });
        pairs.push({ from, to, count: commits.length, commits });
      } catch {
        pairs.push({ from, to, count: 0, commits: [] });
      }
    }

    setCache(this.cache as Map<string, CacheEntry<DriftPair[]>>, cacheKey, pairs);
    return pairs;
  }

  // ─── Activity Series ────────────────────────────────────────

  async getActivitySeries(days: number = 30): Promise<Array<{ date: string; count: number }>> {
    const cacheKey = `activity:${days}`;
    const hit = cached<Array<{ date: string; count: number }>>(this.cache as Map<string, CacheEntry<Array<{ date: string; count: number }>>>, cacheKey);
    if (hit) return hit;

    try {
      const raw = await this.git(['log', `--since=${days}.days.ago`, '--format=%aI', '--all']);
      const counts = new Map<string, number>();

      // Initialize all days to 0
      const now = new Date();
      for (let i = 0; i < days; i++) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        counts.set(d.toISOString().slice(0, 10), 0);
      }

      for (const line of raw.trim().split('\n')) {
        if (!line) continue;
        const dateKey = line.slice(0, 10);
        counts.set(dateKey, (counts.get(dateKey) ?? 0) + 1);
      }

      const series = [...counts.entries()]
        .map(([date, count]) => ({ date, count }))
        .sort((a, b) => a.date.localeCompare(b.date));

      setCache(this.cache as Map<string, CacheEntry<Array<{ date: string; count: number }>>>, cacheKey, series);
      return series;
    } catch {
      return [];
    }
  }

  // ─── Health Metrics ────────────────────────────────────────

  async getHealthMetrics(githubPrAges?: number[]): Promise<{
    commitsPerWeek: number;
    avgPrAgeDays: number;
    staleBranchCount: number;
    driftSeverity: 'clean' | 'low' | 'moderate' | 'high';
    grade: 'A' | 'B' | 'C' | 'D' | 'F';
  }> {
    // Commits per week
    let commitsPerWeek = 0;
    try {
      const raw = await this.git(['log', '--since=7.days.ago', '--oneline', '--all']);
      commitsPerWeek = raw.trim().split('\n').filter(Boolean).length;
    } catch { /* ok */ }

    // Stale branches
    const branches = await this.getBranches();
    const staleBranchCount = branches.filter(b => b.isStale && !b.isRemote).length;

    // Avg PR age
    let avgPrAgeDays = 0;
    if (githubPrAges && githubPrAges.length > 0) {
      avgPrAgeDays = Math.round(githubPrAges.reduce((a, b) => a + b, 0) / githubPrAges.length);
    }

    // Drift severity (reuse cached data if available)
    const driftSeverity: 'clean' | 'low' | 'moderate' | 'high' = 'clean';

    // Grade computation: start at 100
    let score = 100;
    score -= Math.min(30, staleBranchCount * 5);
    if (commitsPerWeek < 5) score -= 10;
    if (avgPrAgeDays > 3) score -= Math.min(25, (avgPrAgeDays - 3) * 5);

    const grade = score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'F';

    return { commitsPerWeek, avgPrAgeDays, staleBranchCount, driftSeverity, grade };
  }

  // ─── Git Status Polling ────────────────────────────────────

  async getStatusHash(): Promise<string> {
    const [head, dirty] = await Promise.all([
      this.git(['rev-parse', 'HEAD']).catch(() => 'none'),
      this.git(['status', '--porcelain']).catch(() => ''),
    ]);
    return `${head.trim()}:${dirty.trim().length > 0 ? 'dirty' : 'clean'}`;
  }

  clearCache(): void {
    this.cache.clear();
  }
}
