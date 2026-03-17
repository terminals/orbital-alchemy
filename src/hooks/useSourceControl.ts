import { useEffect, useState, useCallback, useRef } from 'react';
import { socket } from '../socket';
import type {
  GitOverview,
  CommitEntry,
  BranchInfoData,
  WorktreeDetail,
  GitHubStatus,
  DriftPair,
} from '../types';

interface SourceControlState {
  overview: GitOverview | null;
  commits: CommitEntry[];
  branches: BranchInfoData[];
  worktrees: WorktreeDetail[];
  github: GitHubStatus | null;
  drift: DriftPair[];
  loading: boolean;
  refetch: () => void;
  loadMoreCommits: () => void;
  hasMoreCommits: boolean;
}

const COMMIT_PAGE_SIZE = 50;

export function useSourceControl(): SourceControlState {
  const [overview, setOverview] = useState<GitOverview | null>(null);
  const [commits, setCommits] = useState<CommitEntry[]>([]);
  const [branches, setBranches] = useState<BranchInfoData[]>([]);
  const [worktrees, setWorktrees] = useState<WorktreeDetail[]>([]);
  const [github, setGitHub] = useState<GitHubStatus | null>(null);
  const [drift, setDrift] = useState<DriftPair[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMoreCommits, setHasMoreCommits] = useState(true);
  const offsetRef = useRef(0);

  const fetchCore = useCallback(async () => {
    try {
      const [overviewRes, commitsRes, branchesRes, worktreesRes, driftRes] = await Promise.all([
        fetch('/api/orbital/git/overview'),
        fetch(`/api/orbital/git/commits?limit=${COMMIT_PAGE_SIZE}&offset=0`),
        fetch('/api/orbital/git/branches'),
        fetch('/api/orbital/git/worktrees'),
        fetch('/api/orbital/git/drift'),
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
    } catch {
      // Non-critical — dashboard degrades gracefully
    } finally {
      setLoading(false);
    }
  }, []);

  // GitHub status fetched separately (can be slow)
  const fetchGitHub = useCallback(async () => {
    try {
      const res = await fetch('/api/orbital/github/status');
      if (res.ok) setGitHub(await res.json());
    } catch { /* ok */ }
  }, []);

  const refetch = useCallback(() => {
    fetchCore();
    fetchGitHub();
  }, [fetchCore, fetchGitHub]);

  const loadMoreCommits = useCallback(async () => {
    try {
      const res = await fetch(`/api/orbital/git/commits?limit=${COMMIT_PAGE_SIZE}&offset=${offsetRef.current}`);
      if (res.ok) {
        const data: CommitEntry[] = await res.json();
        setCommits(prev => [...prev, ...data]);
        offsetRef.current += data.length;
        setHasMoreCommits(data.length >= COMMIT_PAGE_SIZE);
      }
    } catch { /* ok */ }
  }, []);

  useEffect(() => {
    fetchCore();
    fetchGitHub();
  }, [fetchCore, fetchGitHub]);

  // Real-time: refetch on git status change
  useEffect(() => {
    function onGitChange() {
      fetchCore();
    }
    socket.on('git:status:changed', onGitChange);
    return () => { socket.off('git:status:changed', onGitChange); };
  }, [fetchCore]);

  return { overview, commits, branches, worktrees, github, drift, loading, refetch, loadMoreCommits, hasMoreCommits };
}
