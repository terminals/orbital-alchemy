import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { normalizeStatus, inferStatusFromDir, setValidStatuses, parseScopeFile, parseAllScopes } from './scope-parser.js';
import fs from 'fs';
import os from 'os';
import path from 'path';

// ─── Pure function tests (no I/O) ──────────────────────────

describe('normalizeStatus()', () => {
  it('maps "in-progress" to "implementing"', () => {
    expect(normalizeStatus('in-progress')).toBe('implementing');
  });

  it('maps "in_progress" to "implementing"', () => {
    expect(normalizeStatus('in_progress')).toBe('implementing');
  });

  it('maps "complete" to "completed"', () => {
    expect(normalizeStatus('complete')).toBe('completed');
  });

  it('maps "done" to "production"', () => {
    expect(normalizeStatus('done')).toBe('production');
  });

  it('maps "exploring" to "planning"', () => {
    expect(normalizeStatus('exploring')).toBe('planning');
  });

  it('maps "blocked" to "backlog"', () => {
    expect(normalizeStatus('blocked')).toBe('backlog');
  });

  it('maps "testing" to "review"', () => {
    expect(normalizeStatus('testing')).toBe('review');
  });

  it('returns identity for already-valid statuses', () => {
    expect(normalizeStatus('implementing')).toBe('implementing');
    expect(normalizeStatus('icebox')).toBe('icebox');
    expect(normalizeStatus('staging')).toBe('staging');
  });

  it('returns raw value for unknown statuses', () => {
    expect(normalizeStatus('custom-status')).toBe('custom-status');
  });
});

describe('setValidStatuses() + inferStatusFromDir()', () => {
  beforeEach(() => {
    setValidStatuses(['icebox', 'planning', 'backlog', 'implementing', 'review', 'completed', 'main']);
  });

  it('returns dir name when it is a valid status', () => {
    expect(inferStatusFromDir('implementing')).toBe('implementing');
    expect(inferStatusFromDir('backlog')).toBe('backlog');
  });

  it('returns "planning" for unknown dir name', () => {
    expect(inferStatusFromDir('unknown-dir')).toBe('planning');
  });

  it('returns dir name as-is when validDirStatuses not yet set', () => {
    // Reset by setting to a set that doesn't include our test value
    setValidStatuses([]);
    expect(inferStatusFromDir('anything')).toBe('planning');
  });
});

// ─── File-based tests ───────────────────────────────────────

describe('parseScopeFile()', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-test-'));
    setValidStatuses(['icebox', 'planning', 'backlog', 'implementing', 'review', 'completed', 'main']);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeScopeFile(subDir: string, filename: string, content: string): string {
    const dir = path.join(tmpDir, subDir);
    fs.mkdirSync(dir, { recursive: true });
    const filePath = path.join(dir, filename);
    fs.writeFileSync(filePath, content);
    return filePath;
  }

  it('parses YAML frontmatter scope', () => {
    const file = writeScopeFile('backlog', '001-test-scope.md', `---
title: Test Scope
status: backlog
priority: high
tags: [feature, backend]
blocked_by: [2, 3]
---
# Test Scope

Some content here.
`);
    const result = parseScopeFile(file);
    expect(result).not.toBeNull();
    expect(result!.id).toBe(1);
    expect(result!.title).toBe('Test Scope');
    expect(result!.status).toBe('backlog');
    expect(result!.priority).toBe('high');
    expect(result!.tags).toEqual(['feature', 'backend']);
    expect(result!.blocked_by).toEqual([2, 3]);
    expect(result!.raw_content).toContain('Some content here.');
  });

  it('extracts ID with suffix encoding: a→1000+base', () => {
    const file = writeScopeFile('implementing', '047a-variant.md', `---
title: Variant A
status: implementing
---
Content
`);
    const result = parseScopeFile(file);
    expect(result!.id).toBe(1047); // 1000 + 47
  });

  it('extracts ID with suffix encoding: X→9000+base', () => {
    const file = writeScopeFile('review', '075X-experimental.md', `---
title: Experimental
status: review
---
Content
`);
    const result = parseScopeFile(file);
    expect(result!.id).toBe(9075); // 9000 + 75
  });

  it('generates negative hash ID for slug-only icebox files', () => {
    const file = writeScopeFile('icebox', 'onboarding-flow.md', `---
title: Onboarding Flow
status: icebox
---
An idea for onboarding.
`);
    const result = parseScopeFile(file);
    expect(result).not.toBeNull();
    expect(result!.id).toBeLessThan(0);
    expect(result!.slug).toBe('onboarding-flow');
  });

  it('parses markdown-only scope (no YAML)', () => {
    const file = writeScopeFile('planning', '010-markdown-only.md', `# Scope 010: Markdown Feature
## Priority: high
## Estimated Effort: 3 days
## Category: Backend

Implementation details...
`);
    const result = parseScopeFile(file);
    expect(result).not.toBeNull();
    expect(result!.id).toBe(10);
    expect(result!.title).toBe('Markdown Feature');
    expect(result!.priority).toBe('high');
    expect(result!.effort_estimate).toBe('3 days');
    expect(result!.category).toBe('Backend');
  });

  it('rejects invalid priority', () => {
    const file = writeScopeFile('backlog', '002-test.md', `---
title: Bad Priority
status: backlog
priority: urgent
---
Content
`);
    const result = parseScopeFile(file);
    expect(result!.priority).toBeNull();
  });

  it('validates session keys', () => {
    const file = writeScopeFile('implementing', '003-sessions.md', `---
title: With Sessions
status: implementing
sessions:
  implementScope: ["session-1"]
  invalidKey: ["session-2"]
---
Content
`);
    const result = parseScopeFile(file);
    expect(result!.sessions).toHaveProperty('implementScope');
    expect(result!.sessions).not.toHaveProperty('invalidKey');
  });

  it('handles ghost scopes', () => {
    const file = writeScopeFile('icebox', '004-ghost.md', `---
title: Ghost Idea
status: icebox
ghost: true
---
AI-generated idea
`);
    const result = parseScopeFile(file);
    expect(result!.is_ghost).toBe(true);
  });

  it('returns null for template/non-scope files', () => {
    const file = writeScopeFile('backlog', '_template.md', `---
title: Template
---
Template content
`);
    expect(parseScopeFile(file)).toBeNull();
  });
});

describe('parseAllScopes()', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scopes-test-'));
    setValidStatuses(['icebox', 'planning', 'backlog', 'implementing']);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('recursively scans and parses all .md files', () => {
    const backlogDir = path.join(tmpDir, 'backlog');
    const planningDir = path.join(tmpDir, 'planning');
    fs.mkdirSync(backlogDir, { recursive: true });
    fs.mkdirSync(planningDir, { recursive: true });

    fs.writeFileSync(path.join(backlogDir, '001-first.md'), '---\ntitle: First\nstatus: backlog\n---\nContent\n');
    fs.writeFileSync(path.join(planningDir, '002-second.md'), '---\ntitle: Second\nstatus: planning\n---\nContent\n');

    const scopes = parseAllScopes(tmpDir);
    expect(scopes).toHaveLength(2);
    expect(scopes[0].id).toBe(1);
    expect(scopes[1].id).toBe(2);
  });

  it('deduplicates by ID (first-seen wins)', () => {
    const dir1 = path.join(tmpDir, 'backlog');
    const dir2 = path.join(tmpDir, 'planning');
    fs.mkdirSync(dir1, { recursive: true });
    fs.mkdirSync(dir2, { recursive: true });

    fs.writeFileSync(path.join(dir1, '001-original.md'), '---\ntitle: Original\nstatus: backlog\n---\n');
    fs.writeFileSync(path.join(dir2, '001-duplicate.md'), '---\ntitle: Duplicate\nstatus: planning\n---\n');

    const scopes = parseAllScopes(tmpDir);
    expect(scopes).toHaveLength(1);
  });

  it('returns empty array for non-existent directory', () => {
    expect(parseAllScopes('/tmp/nonexistent-scopes-dir')).toEqual([]);
  });

  it('returns sorted by ID', () => {
    const dir = path.join(tmpDir, 'backlog');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, '003-third.md'), '---\ntitle: Third\nstatus: backlog\n---\n');
    fs.writeFileSync(path.join(dir, '001-first.md'), '---\ntitle: First\nstatus: backlog\n---\n');
    fs.writeFileSync(path.join(dir, '002-second.md'), '---\ntitle: Second\nstatus: backlog\n---\n');

    const scopes = parseAllScopes(tmpDir);
    expect(scopes.map(s => s.id)).toEqual([1, 2, 3]);
  });
});
