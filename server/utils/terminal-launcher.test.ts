import { describe, it, expect } from 'vitest';
import {
  shellQuote,
  escapeForAnsiC,
  buildSessionName,
  commandToWindowCategory,
} from './terminal-launcher.js';

// ─── shellQuote() ─────────────────────────────────────────────

describe('shellQuote', () => {
  it('returns plain strings unchanged', () => {
    expect(shellQuote('hello world')).toBe('hello world');
  });

  it('escapes single quotes', () => {
    expect(shellQuote("it's")).toBe("it'\\''s");
  });

  it('escapes multiple single quotes', () => {
    expect(shellQuote("a'b'c")).toBe("a'\\''b'\\''c");
  });

  it('handles empty string', () => {
    expect(shellQuote('')).toBe('');
  });
});

// ─── escapeForAnsiC() ────────────────────────────────────────

describe('escapeForAnsiC', () => {
  it('escapes backslash', () => {
    expect(escapeForAnsiC('a\\b')).toBe('a\\\\b');
  });

  it('escapes single quote', () => {
    expect(escapeForAnsiC("it's")).toBe("it\\'s");
  });

  it('escapes newline and carriage return', () => {
    expect(escapeForAnsiC('line1\nline2')).toBe('line1\\nline2');
    expect(escapeForAnsiC('cr\rhere')).toBe('cr\\rhere');
  });

  it('escapes tab', () => {
    expect(escapeForAnsiC('col1\tcol2')).toBe('col1\\tcol2');
  });

  it('escapes null byte', () => {
    expect(escapeForAnsiC('a\0b')).toBe('a\\0b');
  });

  it('escapes bell character', () => {
    expect(escapeForAnsiC('a\x07b')).toBe('a\\ab');
  });

  it('escapes escape character', () => {
    expect(escapeForAnsiC('a\x1Bb')).toBe('a\\eb');
  });

  it('handles plain text unchanged', () => {
    expect(escapeForAnsiC('hello world')).toBe('hello world');
  });

  it('handles multiple special chars', () => {
    expect(escapeForAnsiC("line1\nline2\ttab'quote")).toBe("line1\\nline2\\ttab\\'quote");
  });
});

// ─── buildSessionName() ──────────────────────────────────────

describe('buildSessionName', () => {
  it('builds full session name with scope ID, title, and step', () => {
    const result = buildSessionName({
      scopeId: 79,
      title: 'Hook & Event Foundation',
      command: '/scope-implement 79',
    });
    expect(result).toBe('079-Hook-Event-Foundation-Implementation');
  });

  it('pads scope ID to 3 digits', () => {
    const result = buildSessionName({
      scopeId: 1,
      title: 'Test',
      command: '/scope-implement',
    });
    expect(result).toMatch(/^001-/);
  });

  it('maps different commands to different steps', () => {
    const cases: Array<[string, string]> = [
      ['/scope-implement', 'Implementation'],
      ['/scope-post-review', 'Post-Review'],
      ['/scope-pre-review', 'Pre-Review'],
      ['/scope-verify', 'Verify'],
      ['/scope-create', 'Creation'],
      ['/git-commit', 'Commit'],
      ['/git-staging', 'PR-Staging'],
      ['/git-production', 'PR-Production'],
      ['/git-main', 'Push-Main'],
      ['/git-dev', 'Merge-Dev'],
    ];

    for (const [cmd, expectedStep] of cases) {
      const result = buildSessionName({ scopeId: 1, title: 'X', command: cmd });
      expect(result).toContain(expectedStep);
    }
  });

  it('falls back to step-only name for no scope ID with known command', () => {
    const result = buildSessionName({ command: '/git-commit' });
    expect(result).toBe('Commit');
  });

  it('returns null for unknown command without scope ID', () => {
    const result = buildSessionName({ command: '/unknown-command' });
    expect(result).toBeNull();
  });

  it('returns ID-step for scope ID without title', () => {
    const result = buildSessionName({ scopeId: 42, command: '/scope-implement' });
    expect(result).toBe('042-Implementation');
  });

  it('strips non-alphanumeric chars and title-cases words', () => {
    const result = buildSessionName({
      scopeId: 1,
      title: 'fix: the "bug" in v2.0',
      command: '/scope-implement',
    });
    // Non-alphanumeric removed, words title-cased, joined with hyphens
    expect(result).toMatch(/^001-Fix-The-Bug-In-V20-Implementation$/);
  });

  it('truncates long titles', () => {
    const longTitle = 'A'.repeat(100);
    const result = buildSessionName({
      scopeId: 1,
      title: longTitle,
      command: '/scope-implement',
    });
    // Title part should be <= 40 chars
    const parts = result!.split('-');
    // Remove first (ID) and last (step) parts
    const titlePart = parts.slice(1, -1).join('-');
    expect(titlePart.length).toBeLessThanOrEqual(40);
  });
});

// ─── commandToWindowCategory() ───────────────────────────────

describe('commandToWindowCategory', () => {
  it('maps scope-implement to Implementing', () => {
    expect(commandToWindowCategory('/scope-implement')).toBe('Implementing');
    expect(commandToWindowCategory('/scope-implement 42')).toBe('Implementing');
  });

  it('maps scope-post-review to Reviewing', () => {
    expect(commandToWindowCategory('/scope-post-review')).toBe('Reviewing');
  });

  it('maps scope-pre-review to Planning', () => {
    expect(commandToWindowCategory('/scope-pre-review')).toBe('Planning');
  });

  it('maps scope-verify to Reviewing', () => {
    expect(commandToWindowCategory('/scope-verify')).toBe('Reviewing');
  });

  it('maps git-commit to Deploying', () => {
    expect(commandToWindowCategory('/git-commit')).toBe('Deploying');
  });

  it('maps git-staging to Deploying', () => {
    expect(commandToWindowCategory('/git-staging')).toBe('Deploying');
  });

  it('returns null for unknown commands', () => {
    expect(commandToWindowCategory('/unknown')).toBeNull();
    expect(commandToWindowCategory('plain text')).toBeNull();
  });
});
