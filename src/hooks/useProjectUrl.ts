import { useCallback } from 'react';
import { useProjects } from './useProjectContext';

/**
 * Returns a URL builder that maps relative API paths to the correct
 * project-scoped endpoint based on the current project context.
 *
 * - Project selected: `/api/orbital/projects/{id}{path}`
 * - All projects: `/api/orbital/aggregate{path}`
 */
export function useProjectUrl(): (path: string) => string {
  const { getApiBase, activeProjectId } = useProjects();

  return useCallback(
    (path: string) => {
      return `${getApiBase(activeProjectId)}${path}`;
    },
    [getApiBase, activeProjectId],
  );
}
