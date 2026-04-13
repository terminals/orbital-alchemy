import { useEffect, useState, useCallback, useRef } from 'react';
import { socket } from '../socket';
import { useReconnect } from './useReconnect';
import { useProjectUrl } from './useProjectUrl';
import { useProjects } from './useProjectContext';
import { sprintKey, sprintMatches } from '@/lib/sprint-key';
import type { Sprint, GroupType } from '../types';

export interface AddScopesResult {
  added: number[];
  unmet_dependencies: Array<{ scope_id: number; missing: Array<{ scope_id: number; title: string; status: string }> }>;
}

export function useSprints() {
  const buildUrl = useProjectUrl();
  const { activeProjectId, getApiBase, hasMultipleProjects } = useProjects();
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [loading, setLoading] = useState(true);
  // Suppresses socket handlers during moveSprintToProject to prevent duplicate flicker
  const movingRef = useRef(false);

  const fetchSprints = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch(buildUrl('/sprints'), { signal });
      if (!res.ok) return;
      const data: Sprint[] = await res.json();
      // Per-project endpoints don't include project_id — tag them so colors work
      if (activeProjectId) {
        for (const s of data) { if (!s.project_id) s.project_id = activeProjectId; }
      }
      setSprints(data);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      console.warn('[Orbital] Failed to fetch sprints:', err);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [buildUrl, activeProjectId]);

  useEffect(() => {
    const controller = new AbortController();
    fetchSprints(controller.signal);
    return () => controller.abort();
  }, [fetchSprints]);

  useReconnect(fetchSprints);

  // Real-time updates via Socket.io
  // ProjectEmitter injects project_id into all event payloads, so we use
  // composite key matching to avoid ID collisions across projects.
  useEffect(() => {
    function onCreated(sprint: Sprint) {
      if (movingRef.current) return; // Suppress during project move
      setSprints((prev) => {
        // Deduplicate by composite key (optimistic update may have added it already)
        const key = sprintKey(sprint);
        if (prev.some(s => sprintKey(s) === key)) return prev;
        return [sprint, ...prev];
      });
    }

    function onUpdated(sprint: Sprint) {
      if (movingRef.current) return;
      setSprints((prev) => {
        const idx = prev.findIndex((s) => sprintMatches(s, sprint.id, sprint.project_id));
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = sprint;
          return next;
        }
        return [sprint, ...prev];
      });
    }

    function onDeleted({ id, project_id }: { id: number; project_id?: string }) {
      if (movingRef.current) return;
      setSprints((prev) => prev.filter((s) => !sprintMatches(s, id, project_id)));
    }

    function onCompleted(sprint: Sprint) {
      if (movingRef.current) return;
      setSprints((prev) => {
        const idx = prev.findIndex((s) => sprintMatches(s, sprint.id, sprint.project_id));
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = sprint;
          return next;
        }
        return prev;
      });
    }

    socket.on('sprint:created', onCreated);
    socket.on('sprint:updated', onUpdated);
    socket.on('sprint:deleted', onDeleted);
    socket.on('sprint:completed', onCompleted);

    return () => {
      socket.off('sprint:created', onCreated);
      socket.off('sprint:updated', onUpdated);
      socket.off('sprint:deleted', onDeleted);
      socket.off('sprint:completed', onCompleted);
    };
  }, []);

  const createSprint = useCallback(async (
    name: string,
    options?: { target_column?: string; group_type?: GroupType; projectId?: string },
  ): Promise<Sprint | null> => {
    const { projectId, ...rest } = options ?? {};
    const url = projectId
      ? `${getApiBase(projectId)}/sprints`
      : buildUrl('/sprints');
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, ...rest }),
    });
    if (!res.ok) return null;
    const sprint: Sprint = await res.json();
    // Per-project endpoints don't include project_id — tag it so colors work
    if (projectId && !sprint.project_id) sprint.project_id = projectId;
    return sprint;
  }, [buildUrl, getApiBase]);

  // Route mutations to the sprint's owning project (critical for All Projects view)
  const sprintUrl = useCallback((sprintId: number, path: string): string => {
    if (hasMultipleProjects) {
      const sprint = sprints.find(s => s.id === sprintId);
      if (sprint?.project_id) return `${getApiBase(sprint.project_id)}${path}`;
    }
    return buildUrl(path);
  }, [buildUrl, getApiBase, hasMultipleProjects, sprints]);

  const renameSprint = useCallback(async (id: number, name: string): Promise<boolean> => {
    const res = await fetch(sprintUrl(id, `/sprints/${id}`), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    return res.ok;
  }, [sprintUrl]);

  const deleteSprint = useCallback(async (id: number): Promise<boolean> => {
    const res = await fetch(sprintUrl(id, `/sprints/${id}`), { method: 'DELETE' });
    return res.ok;
  }, [sprintUrl]);

  const addScopes = useCallback(async (sprintId: number, scopeIds: number[]): Promise<AddScopesResult | null> => {
    const res = await fetch(sprintUrl(sprintId, `/sprints/${sprintId}/scopes`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scope_ids: scopeIds }),
    });
    if (!res.ok) return null;
    return res.json();
  }, [sprintUrl]);

  const removeScopes = useCallback(async (sprintId: number, scopeIds: number[]): Promise<boolean> => {
    const res = await fetch(sprintUrl(sprintId, `/sprints/${sprintId}/scopes`), {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scope_ids: scopeIds }),
    });
    return res.ok;
  }, [sprintUrl]);

  const dispatchSprint = useCallback(async (id: number): Promise<{ ok: boolean; error?: string; layers?: number[][] }> => {
    const res = await fetch(sprintUrl(id, `/sprints/${id}/dispatch`), { method: 'POST' });
    return res.json();
  }, [sprintUrl]);

  const cancelSprint = useCallback(async (id: number): Promise<boolean> => {
    const res = await fetch(sprintUrl(id, `/sprints/${id}/cancel`), { method: 'POST' });
    return res.ok;
  }, [sprintUrl]);

  const getGraph = useCallback(async (id: number): Promise<{ layers: number[][]; edges: Array<{ from: number; to: number }> } | null> => {
    const res = await fetch(sprintUrl(id, `/sprints/${id}/graph`));
    if (!res.ok) return null;
    return res.json();
  }, [sprintUrl]);

  /** Move an empty assembling sprint from one project to another (delete + create).
   *  Uses in-place optimistic update so the component stays mounted and CSS transitions
   *  smoothly animate the color change — no unmount/remount flash. */
  const moveSprintToProject = useCallback(async (
    sprintId: number,
    oldProjectId: string,
    newProjectId: string,
  ): Promise<Sprint | null> => {
    const sprint = sprints.find(s => s.id === sprintId && s.project_id === oldProjectId);
    if (!sprint || sprint.scope_ids.length > 0 || sprint.status !== 'assembling') return null;

    // Suppress socket handlers for the duration of the move to prevent duplicate flicker.
    // The optimistic update + swap handle all state changes; socket events are redundant.
    movingRef.current = true;

    // Optimistic: update project_id in place (keeps element mounted, CSS transitions handle colors)
    setSprints(prev => prev.map(s =>
      sprintMatches(s, sprintId, oldProjectId) ? { ...s, project_id: newProjectId } : s,
    ));

    // Backend: delete from old project
    const deleteRes = await fetch(`${getApiBase(oldProjectId)}/sprints/${sprintId}`, { method: 'DELETE' });
    if (!deleteRes.ok) {
      movingRef.current = false;
      // Revert to old project
      setSprints(prev => prev.map(s =>
        s.id === sprintId && s.project_id === newProjectId ? { ...s, project_id: oldProjectId } : s,
      ));
      return null;
    }

    // Backend: create in new project with same properties
    const createRes = await fetch(`${getApiBase(newProjectId)}/sprints`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: sprint.name,
        target_column: sprint.target_column,
        group_type: sprint.group_type,
      }),
    });
    if (!createRes.ok) {
      movingRef.current = false;
      // Old sprint was deleted but new creation failed — remove the phantom
      setSprints(prev => prev.filter(s => !(s.id === sprintId && s.project_id === newProjectId)));
      return null;
    }

    const newSprint: Sprint = await createRes.json();
    newSprint.project_id = newProjectId;

    // Replace optimistic entry with real sprint (updates ID from new DB).
    // Also deduplicate: socket sprint:created may have added it before this runs.
    setSprints(prev => {
      const realKey = sprintKey(newSprint);
      let replaced = false;
      const mapped = prev.reduce<Sprint[]>((acc, s) => {
        // Replace the optimistic placeholder (old numeric ID, new project)
        if (!replaced && s.id === sprintId && s.project_id === newProjectId) {
          replaced = true;
          acc.push(newSprint);
          return acc;
        }
        // Drop any socket-added duplicate with the real key
        if (sprintKey(s) === realKey) return acc;
        acc.push(s);
        return acc;
      }, []);
      return mapped;
    });

    // Clear suppression after a brief delay so any queued socket events are also caught
    setTimeout(() => { movingRef.current = false; }, 500);

    return newSprint;
  }, [sprints, getApiBase]);

  return {
    sprints,
    loading,
    refetch: fetchSprints,
    createSprint,
    renameSprint,
    deleteSprint,
    addScopes,
    removeScopes,
    dispatchSprint,
    cancelSprint,
    getGraph,
    moveSprintToProject,
  };
}
