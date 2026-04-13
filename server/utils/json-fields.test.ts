import { describe, it, expect } from 'vitest';
import { parseJsonFields } from './json-fields.js';

describe('parseJsonFields', () => {
  it('parses stringified JSON arrays in known fields', () => {
    const row = { tags: '["a","b"]', blocked_by: '[1,2]', title: 'scope-1' };
    const result = parseJsonFields(row);
    expect(result.tags).toEqual(['a', 'b']);
    expect(result.blocked_by).toEqual([1, 2]);
    expect(result.title).toBe('scope-1');
  });

  it('parses stringified JSON objects in data field', () => {
    const row = { data: '{"key":"val","nested":{"a":1}}' };
    const result = parseJsonFields(row);
    expect(result.data).toEqual({ key: 'val', nested: { a: 1 } });
  });

  it('handles all 7 known JSON fields', () => {
    const row = {
      tags: '[]', blocked_by: '[]', blocks: '[]',
      data: '{}', discoveries: '[]', next_steps: '[]', details: '{}',
    };
    const result = parseJsonFields(row);
    expect(result.tags).toEqual([]);
    expect(result.blocked_by).toEqual([]);
    expect(result.blocks).toEqual([]);
    expect(result.data).toEqual({});
    expect(result.discoveries).toEqual([]);
    expect(result.next_steps).toEqual([]);
    expect(result.details).toEqual({});
  });

  it('passes through already-parsed objects untouched', () => {
    const tags = ['a', 'b'];
    const row = { tags, data: { foo: 1 } };
    const result = parseJsonFields(row);
    expect(result.tags).toBe(tags); // same reference — not re-parsed
    expect(result.data).toEqual({ foo: 1 });
  });

  it('keeps malformed JSON strings as-is without throwing', () => {
    const row = { tags: '{broken json', data: 'not json at all', blocks: '["valid"]' };
    const result = parseJsonFields(row);
    expect(result.tags).toBe('{broken json');
    expect(result.data).toBe('not json at all');
    expect(result.blocks).toEqual(['valid']);
  });

  it('returns row unchanged when no JSON fields are present', () => {
    const row = { id: 1, title: 'hello', status: 'active' };
    const result = parseJsonFields(row);
    expect(result).toEqual(row);
  });

  it('does not mutate the original row', () => {
    const row = { tags: '["x"]', title: 'scope' };
    const result = parseJsonFields(row);
    expect(row.tags).toBe('["x"]'); // original unchanged
    expect(result.tags).toEqual(['x']); // copy was parsed
    expect(result).not.toBe(row);
  });

  it('handles null and undefined field values', () => {
    const row = { tags: null, data: undefined, blocks: '["a"]' };
    const result = parseJsonFields(row);
    expect(result.tags).toBeNull();
    expect(result.data).toBeUndefined();
    expect(result.blocks).toEqual(['a']);
  });

  it('handles empty row', () => {
    const result = parseJsonFields({});
    expect(result).toEqual({});
  });

  it('ignores non-JSON-field strings', () => {
    const row = { title: '["not a json field"]', tags: '["real"]' };
    const result = parseJsonFields(row);
    expect(result.title).toBe('["not a json field"]'); // title is not in JSON_FIELDS
    expect(result.tags).toEqual(['real']);
  });
});
