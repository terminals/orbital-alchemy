import { describe, it, expect } from 'vitest';
import { parseScopeSections } from './scope-sections';
import type { ProgressMeta, ChecklistMeta, ReviewMeta } from './scope-sections';

// Helper to build a document with part delimiters
function makePart(name: string, content: string): string {
  return `
════════════════════════════════
## ${name}
════════════════════════════════
${content}`;
}

describe('parseScopeSections', () => {
  // ─── Null/empty input ─────────────────────────────────────

  it('returns null for null input', () => {
    expect(parseScopeSections(null)).toBeNull();
  });

  it('returns null for undefined input', () => {
    expect(parseScopeSections(undefined)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseScopeSections('')).toBeNull();
  });

  it('returns null for content with no delimiters', () => {
    expect(parseScopeSections('# Just a heading\nSome content')).toBeNull();
  });

  it('returns null for content with fewer than 2 delimiters', () => {
    expect(parseScopeSections('═══════════════════\n## Part 1')).toBeNull();
  });

  // ─── Section splitting ────────────────────────────────────

  it('parses a single part with sections', () => {
    const doc = makePart('PART 1: Dashboard', `
### Quick Status
Everything is on track.

### Overview
This scope covers X and Y.
`);
    const sections = parseScopeSections(doc);
    expect(sections).not.toBeNull();
    expect(sections!.length).toBeGreaterThanOrEqual(2);

    const quickStatus = sections!.find(s => s.type === 'quick-status');
    expect(quickStatus).toBeDefined();
    expect(quickStatus!.content).toContain('on track');

    const overview = sections!.find(s => s.type === 'overview');
    expect(overview).toBeDefined();
  });

  it('parses multiple parts', () => {
    const doc = makePart('PART 1: Dashboard', `
### Quick Status
Done.
`) + makePart('PART 2: Specification', `
### Requirements
- [ ] Feature A
- [x] Feature B
`);
    const sections = parseScopeSections(doc);
    expect(sections).not.toBeNull();
    expect(sections!.length).toBeGreaterThanOrEqual(2);
  });

  it('normalizes part names', () => {
    const doc = makePart('PART 1: Dashboard View', `
### Quick Status
Status update
`);
    const sections = parseScopeSections(doc);
    expect(sections).not.toBeNull();
    expect(sections![0].part).toBe('Dashboard');
  });

  // ─── Progress table parsing ───────────────────────────────

  it('extracts progress meta from table', () => {
    const doc = makePart('PART 1: Dashboard', `
### Progress

| Phase | Description | Status |
|-------|-------------|--------|
| Phase 1 | Setup | ✅ Done |
| Phase 2 | Build | In Progress |
| Phase 3 | Deploy | Pending |
`);
    const sections = parseScopeSections(doc);
    const progress = sections!.find(s => s.type === 'progress');
    expect(progress).toBeDefined();
    expect(progress!.meta).toBeDefined();

    const meta = progress!.meta as ProgressMeta;
    expect(meta.kind).toBe('progress');
    expect(meta.phases).toHaveLength(3);
    expect(meta.done).toBe(1);
    expect(meta.total).toBe(3);
    expect(meta.phases[0].done).toBe(true);
    expect(meta.phases[1].done).toBe(false);
  });

  // ─── Checklist counting ───────────────────────────────────

  it('extracts checklist meta from requirements', () => {
    const doc = makePart('PART 2: Specification', `
### Requirements
- [x] Item 1
- [ ] Item 2
- [X] Item 3
- [ ] Item 4
`);
    const sections = parseScopeSections(doc);
    const req = sections!.find(s => s.type === 'requirements');
    expect(req).toBeDefined();
    expect(req!.meta).toBeDefined();

    const meta = req!.meta as ChecklistMeta;
    expect(meta.kind).toBe('checklist');
    expect(meta.done).toBe(2);
    expect(meta.total).toBe(4);
  });

  it('extracts checklist meta from success criteria', () => {
    const doc = makePart('PART 2: Specification', `
### Success Criteria
- [x] All tests pass
- [x] No regressions
- [ ] Documentation updated
`);
    const sections = parseScopeSections(doc);
    const sc = sections!.find(s => s.type === 'success-criteria');
    expect(sc).toBeDefined();
    const meta = sc!.meta as ChecklistMeta;
    expect(meta.done).toBe(2);
    expect(meta.total).toBe(3);
  });

  // ─── Review metadata ──────────────────────────────────────

  it('extracts review meta from agent review', () => {
    const doc = makePart('AGENT REVIEW', `
### Review Status

**BLOCKERS**
- Missing tests for edge case

**WARNINGS**
- Consider retry logic
- Unused import

**SUGGESTIONS**
- Add JSDoc comments

**Verdict**: PASS
`);
    const sections = parseScopeSections(doc);
    const review = sections!.find(s => s.type === 'agent-review');
    expect(review).toBeDefined();
    const meta = review!.meta as ReviewMeta;
    expect(meta.kind).toBe('review');
    expect(meta.blockers).toBe(1);
    expect(meta.warnings).toBe(2);
    expect(meta.suggestions).toBe(1);
    expect(meta.verdict).toBe('PASS');
  });

  // ─── Details blocks in Process part ───────────────────────

  it('parses <details> blocks in Process part', () => {
    const doc = makePart('PART 3: Process', `
<details>
<summary>Exploration Log</summary>

Found that the API supports batch mode.
</details>

<details>
<summary>Decisions & Reasoning</summary>

Decided to use async pattern.
</details>
`);
    const sections = parseScopeSections(doc);
    expect(sections).not.toBeNull();
    expect(sections!.length).toBe(2);

    const exploration = sections!.find(s => s.type === 'exploration');
    expect(exploration).toBeDefined();
    expect(exploration!.defaultCollapsed).toBe(true);

    const decisions = sections!.find(s => s.type === 'decisions');
    expect(decisions).toBeDefined();
  });

  // ─── HTML comments stripped ───────────────────────────────

  it('strips HTML comments from section content', () => {
    const doc = makePart('PART 1: Dashboard', `
### Overview
<!-- This is a comment -->
Real content here
`);
    const sections = parseScopeSections(doc);
    const overview = sections!.find(s => s.type === 'overview');
    expect(overview!.content).not.toContain('<!--');
    expect(overview!.content).toContain('Real content');
  });

  // ─── Unknown heading types ────────────────────────────────

  it('marks unrecognized headings as unknown type', () => {
    const doc = makePart('PART 1: Dashboard', `
### Some Random Section
Content here.
`);
    const sections = parseScopeSections(doc);
    expect(sections).not.toBeNull();
    expect(sections![0].type).toBe('unknown');
  });

  // ─── ASCII delimiters work too ────────────────────────────

  it('accepts ASCII = delimiters', () => {
    const doc = `
==============================
## PART 1: Dashboard
==============================
### Quick Status
All good.
`;
    const sections = parseScopeSections(doc);
    expect(sections).not.toBeNull();
    expect(sections![0].type).toBe('quick-status');
  });

  // ─── Empty sections are skipped ───────────────────────────

  it('skips empty sections', () => {
    const doc = makePart('PART 1: Dashboard', `
### Quick Status

### Overview
Has content.
`);
    const sections = parseScopeSections(doc);
    // Only overview should appear since quick-status is empty
    expect(sections!.every(s => s.content.length > 0)).toBe(true);
  });
});
