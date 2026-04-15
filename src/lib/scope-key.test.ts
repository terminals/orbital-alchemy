import { describe, it, expect } from 'vitest';
import { scopeKey, parseScopeKey } from './scope-key';

describe('scopeKey', () => {
  it('returns numeric string for scope without project_id', () => {
    expect(scopeKey({ id: 42 })).toBe('42');
  });

  it('returns composite key for scope with project_id', () => {
    expect(scopeKey({ id: 7, project_id: 'my-project' })).toBe('my-project::7');
  });

  it('handles project_id as empty string like undefined', () => {
    expect(scopeKey({ id: 5, project_id: '' })).toBe('5');
  });
});

describe('parseScopeKey', () => {
  it('parses numeric-only key', () => {
    const result = parseScopeKey('42');
    expect(result.scopeId).toBe(42);
    expect(result.projectId).toBeUndefined();
  });

  it('parses composite key with project_id', () => {
    const result = parseScopeKey('my-project::7');
    expect(result.scopeId).toBe(7);
    expect(result.projectId).toBe('my-project');
  });
});

describe('round-trip', () => {
  it('round-trips scope without project', () => {
    const key = scopeKey({ id: 99 });
    const parsed = parseScopeKey(key);
    expect(parsed.scopeId).toBe(99);
    expect(parsed.projectId).toBeUndefined();
  });

  it('round-trips scope with project', () => {
    const key = scopeKey({ id: 3, project_id: 'orbital-command' });
    const parsed = parseScopeKey(key);
    expect(parsed.scopeId).toBe(3);
    expect(parsed.projectId).toBe('orbital-command');
  });
});
