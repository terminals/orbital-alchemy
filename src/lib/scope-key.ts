/**
 * Unique key for a scope across projects.
 *
 * In multi-project "All Projects" view, multiple projects can have scopes with
 * the same numeric ID. This utility creates a composite string key that is
 * unique across projects: `{project_id}::{id}` when project_id is present,
 * or just `{id}` for single-project mode.
 *
 * Use as: DnD draggable IDs, React keys, Map/Set keys, selected-state tracking.
 */
export function scopeKey(scope: { id: number; project_id?: string }): string {
  return scope.project_id ? `${scope.project_id}::${scope.id}` : String(scope.id);
}

/** Parse a scope key back to its parts. */
export function parseScopeKey(key: string): { scopeId: number; projectId?: string } {
  const sep = key.indexOf('::');
  if (sep >= 0) {
    return { scopeId: Number(key.slice(sep + 2)), projectId: key.slice(0, sep) };
  }
  return { scopeId: Number(key) };
}
