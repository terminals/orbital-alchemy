import { useEffect, useState, useCallback } from 'react';
import { socket } from '../socket';
import type {
  ProjectGitOverview,
  CommitEntry,
  PullRequestInfo,
  ProjectBranchHealth,
  ActivityDataPoint,
} from '../types';

interface AggregateSourceControlState {
  projectOverviews: ProjectGitOverview[];
  commits: CommitEntry[];
  prs: PullRequestInfo[];
  branchHealth: ProjectBranchHealth[];
  activitySeries: Map<string, ActivityDataPoint[]>;
  loading: boolean;
  refetch: () => void;
}

export function useAggregateSourceControl(enabled: boolean): AggregateSourceControlState {
  const [projectOverviews, setProjectOverviews] = useState<ProjectGitOverview[]>([]);
  const [commits, setCommits] = useState<CommitEntry[]>([]);
  const [prs, setPrs] = useState<PullRequestInfo[]>([]);
  const [branchHealth, setBranchHealth] = useState<ProjectBranchHealth[]>([]);
  const [activitySeries, setActivitySeries] = useState<Map<string, ActivityDataPoint[]>>(new Map());
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    if (!enabled) return;
    try {
      const [overviewRes, commitsRes, prsRes, healthRes, activityRes] = await Promise.all([
        fetch('/api/orbital/aggregate/git/overview'),
        fetch('/api/orbital/aggregate/git/commits?limit=50'),
        fetch('/api/orbital/aggregate/github/prs'),
        fetch('/api/orbital/aggregate/git/health'),
        fetch('/api/orbital/aggregate/git/activity?days=30'),
      ]);

      if (overviewRes.ok) setProjectOverviews(await overviewRes.json());
      if (commitsRes.ok) setCommits(await commitsRes.json());
      if (prsRes.ok) setPrs(await prsRes.json());
      if (healthRes.ok) setBranchHealth(await healthRes.json());
      if (activityRes.ok) {
        const data: Array<{ projectId: string; series: ActivityDataPoint[] }> = await activityRes.json();
        const map = new Map<string, ActivityDataPoint[]>();
        for (const entry of data) {
          map.set(entry.projectId, entry.series);
        }
        setActivitySeries(map);
      }
    } catch {
      // Non-critical
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  const refetch = useCallback(() => {
    fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    if (enabled) {
      setLoading(true);
      fetchAll();
    }
  }, [enabled, fetchAll]);

  // Real-time: refetch when git status changes in any project
  useEffect(() => {
    if (!enabled) return;
    function onGitChange() {
      fetchAll();
    }
    socket.on('git:status:changed', onGitChange);
    return () => { socket.off('git:status:changed', onGitChange); };
  }, [enabled, fetchAll]);

  return { projectOverviews, commits, prs, branchHealth, activitySeries, loading, refetch };
}
