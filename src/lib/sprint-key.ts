/**
 * Unique key for a sprint across projects.
 *
 * In multi-project "All Projects" view, multiple projects can have sprints with
 * the same numeric ID (each project has its own SQLite DB with autoincrement).
 * This utility creates a composite string key that is unique across projects:
 * `{project_id}::{id}` when project_id is present, or just `{id}` for
 * single-project mode.
 */
export function sprintKey(sprint: { id: number; project_id?: string }): string {
  return sprint.project_id ? `${sprint.project_id}::${sprint.id}` : String(sprint.id);
}

/** Match a sprint against an id + optional project_id pair. */
export function sprintMatches(
  sprint: { id: number; project_id?: string },
  id: number,
  projectId?: string,
): boolean {
  if (sprint.id !== id) return false;
  if (!projectId) return true;
  return !sprint.project_id || sprint.project_id === projectId;
}
