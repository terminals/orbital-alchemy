import { Router } from 'express';
import type { GitService } from '../services/git-service.js';
import type { GitHubService } from '../services/github-service.js';
import type { WorkflowEngine } from '../../shared/workflow-engine.js';

interface GitRoutesDeps {
  gitService: GitService;
  githubService: GitHubService;
  engine: WorkflowEngine;
}

export function createGitRoutes({ gitService, githubService, engine }: GitRoutesDeps): Router {
  const router = Router();

  // ─── Git Overview ──────────────────────────────────────────

  router.get('/git/overview', async (_req, res) => {
    try {
      const config = engine.getConfig();
      const branchingMode = config.branchingMode ?? 'trunk';
      const overview = await gitService.getOverview(branchingMode);
      res.json(overview);
    } catch (err) {
      res.status(500).json({ error: 'Failed to get git overview', details: String(err) });
    }
  });

  // ─── Commits ──────────────────────────────────────────────

  router.get('/git/commits', async (req, res) => {
    try {
      const branch = (req.query.branch as string) || undefined;
      const limit = Number(req.query.limit) || 50;
      const offset = Number(req.query.offset) || 0;
      const commits = await gitService.getCommits({ branch, limit, offset });
      res.json(commits);
    } catch (err) {
      res.status(500).json({ error: 'Failed to get commits', details: String(err) });
    }
  });

  // ─── Branches ──────────────────────────────────────────────

  router.get('/git/branches', async (_req, res) => {
    try {
      const branches = await gitService.getBranches();
      res.json(branches);
    } catch (err) {
      res.status(500).json({ error: 'Failed to get branches', details: String(err) });
    }
  });

  // ─── Enhanced Worktrees ────────────────────────────────────

  router.get('/git/worktrees', async (_req, res) => {
    try {
      const worktrees = await gitService.getEnhancedWorktrees();
      res.json(worktrees);
    } catch (err) {
      res.status(500).json({ error: 'Failed to get worktrees', details: String(err) });
    }
  });

  // ─── Dynamic Drift ─────────────────────────────────────────

  router.get('/git/drift', async (_req, res) => {
    try {
      // Build drift pairs from workflow lists that have gitBranch set
      const config = engine.getConfig();
      const listsWithBranch = config.lists
        .filter(l => l.gitBranch)
        .sort((a, b) => a.order - b.order);

      const pairs: Array<{ from: string; to: string }> = [];
      for (let i = 0; i < listsWithBranch.length - 1; i++) {
        pairs.push({
          from: listsWithBranch[i].gitBranch!,
          to: listsWithBranch[i + 1].gitBranch!,
        });
      }

      const drift = await gitService.getDrift(pairs);
      res.json(drift);
    } catch (err) {
      res.status(500).json({ error: 'Failed to compute drift', details: String(err) });
    }
  });

  // ─── GitHub Status ─────────────────────────────────────────

  router.get('/github/status', async (_req, res) => {
    try {
      const status = await githubService.getStatus();
      res.json(status);
    } catch (err) {
      res.status(500).json({ error: 'Failed to get GitHub status', details: String(err) });
    }
  });

  // ─── GitHub PRs ────────────────────────────────────────────

  router.get('/github/prs', async (_req, res) => {
    try {
      const prs = await githubService.getOpenPRs();
      res.json(prs);
    } catch (err) {
      res.status(500).json({ error: 'Failed to get PRs', details: String(err) });
    }
  });

  // ─── GitHub Auth Flow ──────────────────────────────────────

  router.post('/github/connect', async (req, res) => {
    try {
      const { method, token } = req.body as { method?: string; token?: string };
      if (method === 'pat' && token) {
        const result = await githubService.connectWithToken(token);
        res.json(result);
      } else {
        const result = await githubService.connectOAuth();
        res.json(result);
      }
    } catch (err) {
      res.status(500).json({ error: 'Failed to connect', details: String(err) });
    }
  });

  router.get('/github/auth-status', async (_req, res) => {
    try {
      const status = await githubService.getAuthStatus();
      res.json(status);
    } catch (err) {
      res.status(500).json({ error: 'Failed to check auth', details: String(err) });
    }
  });

  router.post('/github/disconnect', async (_req, res) => {
    try {
      const result = await githubService.disconnect();
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: 'Failed to disconnect', details: String(err) });
    }
  });

  // ─── GitHub CI Checks ──────────────────────────────────────

  router.get('/github/checks/:ref', async (req, res) => {
    try {
      const checks = await githubService.getCheckRuns(req.params.ref);
      res.json(checks);
    } catch (err) {
      res.status(500).json({ error: 'Failed to get checks', details: String(err) });
    }
  });

  // ─── Git Health Metrics ────────────────────────────────────

  router.get('/git/health', async (_req, res) => {
    try {
      // Get PR ages for health calculation
      let prAges: number[] = [];
      try {
        const prs = await githubService.getOpenPRs();
        const now = Date.now();
        prAges = prs.map(pr => Math.round((now - new Date(pr.createdAt).getTime()) / (1000 * 60 * 60 * 24)));
      } catch { /* ok — GitHub may not be connected */ }

      const health = await gitService.getHealthMetrics(prAges);
      res.json(health);
    } catch (err) {
      res.status(500).json({ error: 'Failed to get health metrics', details: String(err) });
    }
  });

  // ─── Git Activity Series ───────────────────────────────────

  router.get('/git/activity', async (req, res) => {
    try {
      const days = Number(req.query.days) || 30;
      const activity = await gitService.getActivitySeries(days);
      res.json(activity);
    } catch (err) {
      res.status(500).json({ error: 'Failed to get activity', details: String(err) });
    }
  });

  return router;
}
