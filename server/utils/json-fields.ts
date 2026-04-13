const JSON_FIELDS = ['tags', 'blocked_by', 'blocks', 'data', 'discoveries', 'next_steps', 'details'];

export type Row = Record<string, unknown>;

/** Parse stringified JSON fields in a database row back to objects. */
export function parseJsonFields(row: Row): Row {
  const parsed = { ...row };
  for (const field of JSON_FIELDS) {
    if (typeof parsed[field] === 'string') {
      try { parsed[field] = JSON.parse(parsed[field] as string); } catch { /* keep string */ }
    }
  }
  return parsed;
}
