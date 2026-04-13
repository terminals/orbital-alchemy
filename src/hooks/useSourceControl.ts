import { useEffect, useState, useCallback, useRef } from 'react';
import { useProjectUrl } from './useProjectUrl';
import { useReconnect } from './useReconnect';
import { socket } from '../socket';
import type {
  GitOverview,
  CommitEntry,
  BranchInfoData,
  WorktreeDetail,
  GitHubStatus,
  DriftPair,
  RepoHealthMetrics,
  ActivityDataPoint,
} from '../types';

interface SourceControlState {
  overview: GitOverview | null;
  commits: CommitEntry[];
  branches: BranchInfoData[];
  worktrees: WorktreeDetail[];
  github: GitHubStatus | null;
  githubChecking: boolean;
  drift: DriftPair[];
  health: RepoHealthMetrics | null;
  activity: ActivityDataPoint[];
  loading: boolean;
  refetch: () => void;
  loadMoreCommits: () => void;
  hasMoreCommits: boolean;
  buildUrl: (path: string) => string;
}

const COMMIT_PAGE_SIZE = 50;

export function useSourceControl(enabled: boolean = true): SourceControlState {
  const buildUrl = useProjectUrl();
  const [overview, setOverview] = useState<GitOverview | null>(null);
  const [commits, setCommits] = useState<CommitEntry[]>([]);
  const [branches, setBranches] = useState<BranchInfoData[]>([]);
  const [worktrees, setWorktrees] = useState<WorktreeDetail[]>([]);
  const [github, setGitHub] = useState<GitHubStatus | null>(null);
  const [githubChecking, setGitHubChecking] = useState(true);
  const [drift, setDrift] = useState<DriftPair[]>([]);
  const [health, setHealth] = useState<RepoHealthMetrics | null>(null);
  const [activity, setActivity] = useState<ActivityDataPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMoreCommits, setHasMoreCommits] = useState(true);
  const offsetRef = useRef(0);

  const fetchCore = useCallback(async (signal?: AbortSignal) => {
    if (!enabled) return;
    try {
      const [overviewRes, commitsRes, branchesRes, worktreesRes, driftRes, healthRes, activityRes] = await Promise.all([
        fetch(buildUrl('/git/overview'), { signal }),
        fetch(buildUrl(`/git/commits?limit=${COMMIT_PAGE_SIZE}&offset=0`), { signal }),
        fetch(buildUrl('/git/branches'), { signal }),
        fetch(buildUrl('/git/worktrees'), { signal }),
        fetch(buildUrl('/git/drift'), { signal }),
        fetch(buildUrl('/git/health'), { signal }),
        fetch(buildUrl('/git/activity?days=30'), { signal }),
      ]);

      if (overviewRes.ok) setOverview(await overviewRes.json());
      if (commitsRes.ok) {
        const data = await commitsRes.json();
        setCommits(data);
        offsetRef.current = data.length;
        setHasMoreCommits(data.length >= COMMIT_PAGE_SIZE);
      }
      if (branchesRes.ok) setBranches(await branchesRes.json());
      if (worktreesRes.ok) setWorktrees(await worktreesRes.json());
      if (driftRes.ok) setDrift(await driftRes.json());
      if (healthRes.ok) setHealth(await healthRes.json());
      if (activityRes.ok) setActivity(await activityRes.json());
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      // Non-critical — dashboard degrades gracefully
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [buildUrl, enabled]);

  // GitHub status fetched separately (can be slow)
  const fetchGitHub = useCallback(async (signal?: AbortSignal) => {
    if (!enabled) return;
    setGitHubChecking(true);
    try {
      const res = await fetch(buildUrl('/github/status'), { signal });
      if (res.ok) setGitHub(await res.json());
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
    } finally {
      if (!signal?.aborted) setGitHubChecking(false);
    }
  }, [buildUrl, enabled]);

  const refetch = useCallback(() => {
    fetchCore();
    fetchGitHub();
  }, [fetchCore, fetchGitHub]);

  const loadMoreCommits = useCallback(async () => {
    try {
      const res = await fetch(buildUrl(`/git/commits?limit=${COMMIT_PAGE_SIZE}&offset=${offsetRef.current}`));
      if (res.ok) {
        const data: CommitEntry[] = await res.json();
        setCommits(prev => [...prev, ...data]);
        offsetRef.current += data.length;
        setHasMoreCommits(data.length >= COMMIT_PAGE_SIZE);
      }
    } catch { /* ok */ }
  }, [buildUrl]);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      setGitHubChecking(false);
      return;
    }
    const controller = new AbortController();
    fetchCore(controller.signal);
    fetchGitHub(controller.signal);
    return () => controller.abort();
  }, [enabled, fetchCore, fetchGitHub]);

  useReconnect(refetch);

  // Real-time: refetch on git status change
  useEffect(() => {
    function onGitChange() {
      fetchCore();
    }
    socket.on('git:status:changed', onGitChange);
    return () => { socket.off('git:status:changed', onGitChange); };
  }, [fetchCore]);

  return { overview, commits, branches, worktrees, github, githubChecking, drift, health, activity, loading, refetch, loadMoreCommits, hasMoreCommits, buildUrl };
}
