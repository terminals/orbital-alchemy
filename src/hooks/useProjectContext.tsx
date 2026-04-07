import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { socket } from '../socket';
import { WorkflowEngine } from '../../shared/workflow-engine';
import { isWorkflowConfig } from '../../shared/workflow-config';
import { useReconnect } from './useReconnect';
import type { Project } from '@/types';

// ─── Context ──────────────────────────────────────────────

interface ProjectContextValue {
  /** All registered projects */
  projects: Project[];
  /** Currently active project ID, or null for "All Projects" */
  activeProjectId: string | null;
  /** Switch to a project tab (null = All Projects) */
  setActiveProjectId: (id: string | null) => void;
  /** Get the color for a project */
  getProjectColor: (projectId: string) => string;
  /** Get the display name for a project */
  getProjectName: (projectId: string) => string;
  /** Whether the project list is loading */
  loading: boolean;
  /** Whether multi-project mode is active (more than 1 project) */
  isMultiProject: boolean;
  /** Get the API base URL for a project (or aggregate) */
  getApiBase: (projectId?: string | null) => string;
  /** Cached WorkflowEngine per project — needed for All Projects phase normalization */
  projectEngines: Map<string, WorkflowEngine>;
}

const ProjectContext = createContext<ProjectContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────

interface ProjectProviderProps {
  children: ReactNode;
}

export function ProjectProvider({ children }: ProjectProviderProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchParams, setSearchParams] = useSearchParams();

  // Derive activeProjectId from URL query param
  const projectParam = searchParams.get('project');
  const activeProjectId = projectParam === '__all__' ? null : (projectParam ?? null);

  const setActiveProjectId = useCallback((id: string | null) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (id === null) {
        next.set('project', '__all__');
      } else {
        next.set('project', id);
      }
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  // Fetch projects list — no dependency on projectParam to avoid refetching on every tab switch
  const fetchProjects = useCallback(async () => {
    try {
      const res = await fetch('/api/orbital/projects');
      if (!res.ok) {
        setProjects([]);
        setLoading(false);
        return;
      }
      const data = await res.json() as Project[];
      setProjects(data);
    } catch {
      setProjects([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  // Auto-select project on initial load (runs once after first fetch)
  const hasAutoSelected = useRef(false);
  useEffect(() => {
    if (hasAutoSelected.current || projectParam || projects.length === 0) return;
    hasAutoSelected.current = true;
    if (projects.length === 1) {
      setSearchParams(prev => {
        const next = new URLSearchParams(prev);
        next.set('project', projects[0].id);
        return next;
      }, { replace: true });
    }
  }, [projects, projectParam, setSearchParams]);

  // Listen for project registration/unregistration events
  useEffect(() => {
    const onRegistered = () => fetchProjects();
    const onUnregistered = () => fetchProjects();
    const onStatusChanged = () => fetchProjects();
    const onUpdated = () => fetchProjects();

    socket.on('project:registered', onRegistered);
    socket.on('project:unregistered', onUnregistered);
    socket.on('project:status:changed', onStatusChanged);
    socket.on('project:updated', onUpdated);

    return () => {
      socket.off('project:registered', onRegistered);
      socket.off('project:unregistered', onUnregistered);
      socket.off('project:status:changed', onStatusChanged);
      socket.off('project:updated', onUpdated);
    };
  }, [fetchProjects]);

  // Subscribe to appropriate socket rooms when project changes
  useEffect(() => {
    if (activeProjectId) {
      socket.emit('subscribe', { projectId: activeProjectId });
    } else {
      socket.emit('subscribe', { scope: 'all' });
    }

    return () => {
      if (activeProjectId) {
        socket.emit('unsubscribe', { projectId: activeProjectId });
      } else {
        socket.emit('unsubscribe', { scope: 'all' });
      }
    };
  }, [activeProjectId]);

  const getProjectColor = useCallback((projectId: string): string => {
    return projects.find(p => p.id === projectId)?.color ?? '210 80% 55%';
  }, [projects]);

  const getProjectName = useCallback((projectId: string): string => {
    return projects.find(p => p.id === projectId)?.name ?? projectId;
  }, [projects]);

  const getApiBase = useCallback((projectId?: string | null): string => {
    const id = projectId !== undefined ? projectId : activeProjectId;
    if (id) return `/api/orbital/projects/${id}`;
    return '/api/orbital/aggregate';
  }, [activeProjectId]);

  const isMultiProject = projects.length > 1;

  // ─── Per-Project Workflow Engines ─────────────────────────
  // Fetch and cache all project workflows so the All Projects board
  // can do phase normalization across different workflow configs.

  const [projectEngines, setProjectEngines] = useState<Map<string, WorkflowEngine>>(new Map());
  const engineFetchedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (projects.length === 0) return;

    const newEngines = new Map(projectEngines);
    let changed = false;

    for (const project of projects) {
      if (project.status !== 'active') continue;
      if (engineFetchedRef.current.has(project.id)) continue;
      engineFetchedRef.current.add(project.id);

      fetch(`/api/orbital/projects/${project.id}/workflow`)
        .then(res => {
          if (!res.ok) return;
          return res.json();
        })
        .then((json: { success: boolean; data?: unknown } | undefined) => {
          if (!json) return;
          const config: unknown = json.data ?? json;
          if (!isWorkflowConfig(config)) return;
          setProjectEngines(prev => {
            const next = new Map(prev);
            next.set(project.id, new WorkflowEngine(config));
            return next;
          });
        })
        .catch(() => {});
      changed = true;
    }

    if (changed) setProjectEngines(newEngines);
  }, [projects]); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-fetch engines on workflow:changed
  useEffect(() => {
    const handler = () => {
      engineFetchedRef.current.clear();
      setProjectEngines(new Map());
    };
    socket.on('workflow:changed', handler);
    return () => { socket.off('workflow:changed', handler); };
  }, []);

  // Re-fetch engines on socket reconnect or tab visibility change
  const refetchEngines = useCallback(() => {
    engineFetchedRef.current.clear();
    setProjectEngines(new Map());
  }, []);
  useReconnect(refetchEngines);

  const value: ProjectContextValue = {
    projects,
    activeProjectId,
    setActiveProjectId,
    getProjectColor,
    getProjectName,
    loading,
    isMultiProject,
    getApiBase,
    projectEngines,
  };

  return (
    <ProjectContext.Provider value={value}>
      {children}
    </ProjectContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────

export function useProjects(): ProjectContextValue {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error('useProjects must be used within a ProjectProvider');
  return ctx;
}
