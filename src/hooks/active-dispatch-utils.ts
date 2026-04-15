import type { OrbitalEvent, DispatchResolvedPayload } from '../types';
import { scopeKey } from '../lib/scope-key';

export interface AbandonedInfo {
  from_status: string | null;
  abandoned_at: string;
  project_id?: string;
}

// ─── Response Parsing ───────────────────────────────────────

/**
 * Parse active scope IDs from the API response, handling both
 * old format (number[]) and new format ({scope_id, project_id}[]).
 */
export function parseActiveScopeIds(
  scopeIds: number[] | Array<{ scope_id: number; project_id: string }>,
  makeScopeKey: (id: number) => string,
): Set<string> {
  const active = new Set<string>();
  for (const item of scopeIds) {
    if (typeof item === 'number') {
      active.add(makeScopeKey(item));
    } else {
      active.add(scopeKey({ id: item.scope_id, project_id: item.project_id }));
    }
  }
  return active;
}

/**
 * Parse abandoned scopes from the API response into a Map.
 */
export function parseAbandonedScopes(
  items: Array<{ scope_id: number; project_id?: string; from_status: string | null; abandoned_at: string }>,
  makeScopeKey: (id: number) => string,
): Map<string, AbandonedInfo> {
  const map = new Map<string, AbandonedInfo>();
  for (const item of items) {
    const key = item.project_id
      ? scopeKey({ id: item.scope_id, project_id: item.project_id })
      : makeScopeKey(item.scope_id);
    map.set(key, {
      from_status: item.from_status,
      abandoned_at: item.abandoned_at,
      project_id: item.project_id,
    });
  }
  return map;
}

// ─── Event Data Extraction ──────────────────────────────────

/**
 * Extract scope IDs from a DISPATCH event.
 * Single dispatch uses event.scope_id, batch uses data.scope_ids.
 */
export function extractDispatchScopeIds(event: OrbitalEvent): number[] {
  const ids: number[] = [];
  if (event.scope_id != null) ids.push(event.scope_id);
  if (Array.isArray(event.data.scope_ids)) {
    for (const id of event.data.scope_ids as number[]) {
      if (!ids.includes(id)) ids.push(id);
    }
  }
  return ids;
}

/**
 * Extract scope IDs from a dispatch:resolved payload.
 * Handles both single (scope_id) and batch (scope_ids) formats.
 */
export function extractResolvedScopeIds(payload: DispatchResolvedPayload): number[] {
  const ids: number[] = [];
  if (payload.scope_id != null) ids.push(payload.scope_id);
  if (Array.isArray(payload.scope_ids)) ids.push(...payload.scope_ids);
  return ids;
}

// ─── State Transition Logic ─────────────────────────────────

/**
 * Build scope keys from IDs, using project ID when available.
 */
export function buildScopeKeys(
  ids: number[],
  eventProjectId: string | undefined,
  fallbackProjectId: string | undefined,
): string[] {
  return ids.map(id =>
    scopeKey({ id, project_id: eventProjectId ?? fallbackProjectId ?? undefined }),
  );
}

/**
 * Add keys to an active set, returning a new Set if changes occur.
 * Returns the original set if no changes are needed.
 */
export function addToActiveSet(prev: Set<string>, keys: string[]): Set<string> {
  const toAdd = keys.filter(k => !prev.has(k));
  if (toAdd.length === 0) return prev;
  const next = new Set(prev);
  for (const k of toAdd) next.add(k);
  return next;
}

/**
 * Remove keys from an active set, returning a new Set if changes occur.
 * Returns the original set if no changes are needed.
 */
export function removeFromActiveSet(prev: Set<string>, keys: string[]): Set<string> {
  const toRemove = keys.filter(k => prev.has(k));
  if (toRemove.length === 0) return prev;
  const next = new Set(prev);
  for (const k of toRemove) next.delete(k);
  return next;
}

/**
 * Check if a dispatch event is a new dispatch (not a resolution).
 */
export function isNewDispatchEvent(event: OrbitalEvent): boolean {
  return event.type === 'DISPATCH' && event.data.resolved == null;
}

/**
 * Extract project_id from any payload object.
 */
export function extractProjectId(payload: Record<string, unknown>): string | undefined {
  return payload.project_id as string | undefined;
}
