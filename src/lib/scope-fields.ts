import type { Scope, FilterField } from '@/types';

// ─── Effort bucketing ──────────────────────────────────────

export function bucketEffort(raw: string | null): string {
  if (!raw) return 'TBD';
  const s = raw.toLowerCase().trim();

  const hrMatch = s.match(/(\d+(?:\.\d+)?)\s*(?:-\s*\d+(?:\.\d+)?)?\s*hour/);
  if (hrMatch) {
    const hrs = parseFloat(hrMatch[1]);
    if (hrs < 1) return '<1H';
    if (hrs <= 4) return '1-4H';
    return '4H+';
  }

  const minMatch = s.match(/(\d+)\s*(?:-\s*\d+)?\s*min/);
  if (minMatch) return '<1H';

  const parenMatch = s.match(/\((\d+(?:\.\d+)?)\s*(?:-\s*\d+(?:\.\d+)?)?\s*(hour|min)/);
  if (parenMatch) {
    const val = parseFloat(parenMatch[1]);
    if (parenMatch[2].startsWith('min')) return '<1H';
    if (val < 1) return '<1H';
    if (val <= 4) return '1-4H';
    return '4H+';
  }

  if (s.includes('large') || s.includes('multi')) return '4H+';
  if (s.includes('medium') || s.includes('half')) return '1-4H';
  if (s.includes('small')) return '<1H';

  return 'TBD';
}

// ─── Dependency classification ─────────────────────────────

export function classifyDeps(scope: Scope): string[] {
  const labels: string[] = [];
  if (scope.blocked_by.length > 0) labels.push('has-blockers');
  if (scope.blocks.length > 0) labels.push('blocks-others');
  if (scope.blocked_by.length === 0 && scope.blocks.length === 0) labels.push('no-deps');
  return labels;
}

// ─── Field value extraction ────────────────────────────────

export function getScopeFieldValues(scope: Scope, field: FilterField): string[] {
  switch (field) {
    case 'priority':
      return scope.priority ? [scope.priority] : [];
    case 'category':
      return scope.category ? [scope.category] : [];
    case 'tags':
      return scope.tags;
    case 'effort':
      return [bucketEffort(scope.effort_estimate)];
    case 'dependencies':
      return classifyDeps(scope);
  }
}
