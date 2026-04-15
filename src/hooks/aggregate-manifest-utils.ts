import type { ManifestFileEntry } from '../types';

// ─── Loading Key Formatting ─────────────────────────────────

/**
 * Format an action loading key for different manifest operations.
 * Matches the pattern used in useAggregateManifest for `actionLoading` state.
 */
export function formatActionKey(action: string, target?: string): string {
  if (!target) return action;
  return `${action}:${target}`;
}

/**
 * Parse an action loading key back into its components.
 */
export function parseActionKey(key: string): { action: string; target: string | null } {
  const colonIdx = key.indexOf(':');
  if (colonIdx < 0) return { action: key, target: null };
  return { action: key.slice(0, colonIdx), target: key.slice(colonIdx + 1) };
}

// ─── Action State Checking ──────────────────────────────────

/**
 * Check if a specific action is currently loading.
 */
export function isActionLoading(
  actionLoading: string | null,
  action: string,
  target?: string,
): boolean {
  if (!actionLoading) return false;
  const expected = target ? `${action}:${target}` : action;
  return actionLoading === expected;
}

/**
 * Check if any action targeting a specific project is loading.
 */
export function isProjectActionLoading(
  actionLoading: string | null,
  projectId: string,
): boolean {
  if (!actionLoading) return false;
  return actionLoading.endsWith(`:${projectId}`);
}

/**
 * Check if any file-level action is loading for a specific file.
 */
export function isFileActionLoading(
  actionLoading: string | null,
  file: string,
): boolean {
  if (!actionLoading) return false;
  return actionLoading.endsWith(`:${file}`);
}

// ─── File Status Helpers ────────────────────────────────────

/**
 * Determine the display label for a manifest file status.
 */
export function getFileStatusLabel(status: ManifestFileEntry['status']): string {
  const labels: Record<ManifestFileEntry['status'], string> = {
    'synced': 'Synced',
    'outdated': 'Outdated',
    'modified': 'Modified',
    'pinned': 'Pinned',
    'missing': 'Missing',
    'user-owned': 'User Owned',
  };
  return labels[status];
}

/**
 * Determine if a file status indicates the file needs attention.
 */
export function fileNeedsAttention(status: ManifestFileEntry['status']): boolean {
  return status === 'outdated' || status === 'missing';
}

/**
 * Determine if a file can be reverted (has a previous version available).
 */
export function canRevertFile(entry: ManifestFileEntry): boolean {
  return entry.hasPrev && entry.status === 'modified';
}
