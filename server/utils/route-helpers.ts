import path from 'path';

/** Extract a human-readable message from an unknown error value. */
export function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Validate that a relative path stays within bounds (no traversal). */
export function isValidRelativePath(p: string): boolean {
  const normalized = path.normalize(p);
  return !normalized.startsWith('..') && !path.isAbsolute(normalized) && !normalized.includes('\0');
}
