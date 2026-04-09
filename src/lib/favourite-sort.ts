import type { Scope } from '@/types';

/** Stable partition: favourited scopes first, preserving input order within each group. */
export function partitionByFavourites(scopes: Scope[]): Scope[] {
  if (!scopes.some(s => s.favourite)) return scopes;
  const favs: Scope[] = [];
  const rest: Scope[] = [];
  for (const s of scopes) {
    (s.favourite ? favs : rest).push(s);
  }
  return [...favs, ...rest];
}
