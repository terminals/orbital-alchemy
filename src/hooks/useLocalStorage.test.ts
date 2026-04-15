import { describe, it, expect } from 'vitest';
import { setStorage } from './useLocalStorage';

// ─── setStorage serialization helpers ─────────────────────────
// These are exported from useLocalStorage.ts and can be tested directly.

describe('setStorage', () => {
  describe('serialize', () => {
    it('serializes a Set<string> to a JSON array string', () => {
      const result = setStorage.serialize(new Set(['a', 'b', 'c']));
      const parsed = JSON.parse(result);
      expect(parsed).toEqual(['a', 'b', 'c']);
    });

    it('serializes an empty set to empty JSON array', () => {
      const result = setStorage.serialize(new Set());
      expect(JSON.parse(result)).toEqual([]);
    });

    it('preserves insertion order', () => {
      const result = setStorage.serialize(new Set(['z', 'a', 'm']));
      expect(JSON.parse(result)).toEqual(['z', 'a', 'm']);
    });
  });

  describe('deserialize', () => {
    it('deserializes a JSON array to a Set<string>', () => {
      const result = setStorage.deserialize('["a","b","c"]');
      expect(result).toEqual(new Set(['a', 'b', 'c']));
    });

    it('deserializes an empty JSON array to empty set', () => {
      const result = setStorage.deserialize('[]');
      expect(result).toEqual(new Set());
    });

    it('returns undefined for non-array JSON', () => {
      const result = setStorage.deserialize('{"key":"value"}');
      expect(result).toBeUndefined();
    });

    it('returns undefined for JSON string', () => {
      const result = setStorage.deserialize('"hello"');
      expect(result).toBeUndefined();
    });

    it('throws on invalid JSON (matches localStorage behavior)', () => {
      expect(() => setStorage.deserialize('not-json')).toThrow();
    });
  });

  describe('round-trip', () => {
    it('round-trips through serialize/deserialize', () => {
      const original = new Set(['alpha', 'beta', 'gamma']);
      const serialized = setStorage.serialize(original);
      const deserialized = setStorage.deserialize(serialized);
      expect(deserialized).toEqual(original);
    });
  });
});
