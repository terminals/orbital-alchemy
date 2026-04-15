import { describe, it, expect } from 'vitest';
import { formatScopeId } from './utils';

describe('formatScopeId', () => {
  it('returns empty string for 0', () => {
    expect(formatScopeId(0)).toBe('');
  });

  it('formats single-digit IDs with padding', () => {
    expect(formatScopeId(1)).toBe('#001');
    expect(formatScopeId(9)).toBe('#009');
  });

  it('formats double-digit IDs with padding', () => {
    expect(formatScopeId(10)).toBe('#010');
    expect(formatScopeId(99)).toBe('#099');
  });

  it('formats triple-digit IDs without padding', () => {
    expect(formatScopeId(100)).toBe('#100');
    expect(formatScopeId(999)).toBe('#999');
  });

  it('formats tier-1 IDs with lowercase suffix', () => {
    // 1000 + 47 = 1047 → "#047a"
    expect(formatScopeId(1047)).toBe('#047a');
    expect(formatScopeId(1001)).toBe('#001a');
  });

  it('formats tier-9 IDs with X suffix', () => {
    // 9000 + 13 = 9013 → "#013X"
    expect(formatScopeId(9013)).toBe('#013X');
  });

  it('returns empty string for negative IDs', () => {
    expect(formatScopeId(-1)).toBe('');
  });
});
