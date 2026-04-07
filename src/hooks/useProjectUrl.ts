import { useCallback } from 'react';
import { useProjects } from './useProjectContext';

/**
 * Returns a URL builder that maps relative API paths to the correct
 * project-scoped endpoint based on the current project context.
 *
 * - Single-project mode: `/api/orbital{path}`
 * - Multi-project, project selected: `/api/orbital/projects/{id}{path}`
 * - Multi-project, all projects: `/api/orbital/aggregate{path}`
 */
export function useProjectUrl(): (path: string) => string {
  const { getApiBase, activeProjectId, isMultiProject } = useProjects();

  return useCallback(
    (path: string) => {
      if (!isMultiProject) return `/api/orbital${path}`;
      return `${getApiBase(activeProjectId)}${path}`;
    },
    [getApiBase, activeProjectId, isMultiProject],
  );
}
