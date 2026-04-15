import { describe, it, expect } from 'vitest';
import type { ManifestFileEntry } from '../types';
import {
  formatActionKey,
  parseActionKey,
  isActionLoading,
  isProjectActionLoading,
  isFileActionLoading,
  getFileStatusLabel,
  fileNeedsAttention,
  canRevertFile,
} from './aggregate-manifest-utils';

// ─── Test Helpers ───────────────────────────────────────────

function makeEntry(overrides: Partial<ManifestFileEntry> = {}): ManifestFileEntry {
  return {
    path: 'hooks/pre-commit.sh',
    origin: 'template',
    status: 'synced',
    installedHash: 'abc123',
    hasPrev: false,
    ...overrides,
  };
}

// ─── formatActionKey ────────────────────────────────────────

describe('formatActionKey', () => {
  it('returns action alone when no target', () => {
    expect(formatActionKey('update-all')).toBe('update-all');
  });

  it('combines action and target with colon', () => {
    expect(formatActionKey('preview', 'proj-a')).toBe('preview:proj-a');
  });

  it('handles empty target by returning action alone', () => {
    expect(formatActionKey('init', '')).toBe('init');
  });
});

// ─── parseActionKey ─────────────────────────────────────────

describe('parseActionKey', () => {
  it('parses action-only key', () => {
    expect(parseActionKey('update-all')).toEqual({ action: 'update-all', target: null });
  });

  it('parses action:target key', () => {
    expect(parseActionKey('preview:proj-a')).toEqual({ action: 'preview', target: 'proj-a' });
  });

  it('handles target with colons', () => {
    expect(parseActionKey('pin:path/to:file.sh')).toEqual({ action: 'pin', target: 'path/to:file.sh' });
  });
});

// ─── isActionLoading ────────────────────────────────────────

describe('isActionLoading', () => {
  it('returns false when actionLoading is null', () => {
    expect(isActionLoading(null, 'update-all')).toBe(false);
  });

  it('returns true for exact match without target', () => {
    expect(isActionLoading('update-all', 'update-all')).toBe(true);
  });

  it('returns true for action:target match', () => {
    expect(isActionLoading('preview:proj-a', 'preview', 'proj-a')).toBe(true);
  });

  it('returns false for mismatch', () => {
    expect(isActionLoading('preview:proj-a', 'preview', 'proj-b')).toBe(false);
  });
});

// ─── isProjectActionLoading ─────────────────────────────────

describe('isProjectActionLoading', () => {
  it('returns false when actionLoading is null', () => {
    expect(isProjectActionLoading(null, 'proj-a')).toBe(false);
  });

  it('returns true when action targets the project', () => {
    expect(isProjectActionLoading('preview:proj-a', 'proj-a')).toBe(true);
  });

  it('returns false when action targets different project', () => {
    expect(isProjectActionLoading('preview:proj-b', 'proj-a')).toBe(false);
  });

  it('returns false for action-only keys', () => {
    expect(isProjectActionLoading('update-all', 'proj-a')).toBe(false);
  });
});

// ─── isFileActionLoading ────────────────────────────────────

describe('isFileActionLoading', () => {
  it('returns false when actionLoading is null', () => {
    expect(isFileActionLoading(null, 'hooks/pre-commit.sh')).toBe(false);
  });

  it('returns true when action targets the file', () => {
    expect(isFileActionLoading('pin:hooks/pre-commit.sh', 'hooks/pre-commit.sh')).toBe(true);
  });

  it('returns false when action targets different file', () => {
    expect(isFileActionLoading('pin:other.sh', 'hooks/pre-commit.sh')).toBe(false);
  });
});

// ─── getFileStatusLabel ─────────────────────────────────────

describe('getFileStatusLabel', () => {
  it('maps all status values to display labels', () => {
    expect(getFileStatusLabel('synced')).toBe('Synced');
    expect(getFileStatusLabel('outdated')).toBe('Outdated');
    expect(getFileStatusLabel('modified')).toBe('Modified');
    expect(getFileStatusLabel('pinned')).toBe('Pinned');
    expect(getFileStatusLabel('missing')).toBe('Missing');
    expect(getFileStatusLabel('user-owned')).toBe('User Owned');
  });
});

// ─── fileNeedsAttention ─────────────────────────────────────

describe('fileNeedsAttention', () => {
  it('returns true for outdated', () => {
    expect(fileNeedsAttention('outdated')).toBe(true);
  });

  it('returns true for missing', () => {
    expect(fileNeedsAttention('missing')).toBe(true);
  });

  it('returns false for synced', () => {
    expect(fileNeedsAttention('synced')).toBe(false);
  });

  it('returns false for modified', () => {
    expect(fileNeedsAttention('modified')).toBe(false);
  });

  it('returns false for pinned', () => {
    expect(fileNeedsAttention('pinned')).toBe(false);
  });

  it('returns false for user-owned', () => {
    expect(fileNeedsAttention('user-owned')).toBe(false);
  });
});

// ─── canRevertFile ──────────────────────────────────────────

describe('canRevertFile', () => {
  it('returns true when file is modified and has previous version', () => {
    expect(canRevertFile(makeEntry({ status: 'modified', hasPrev: true }))).toBe(true);
  });

  it('returns false when file has no previous version', () => {
    expect(canRevertFile(makeEntry({ status: 'modified', hasPrev: false }))).toBe(false);
  });

  it('returns false when file is not modified', () => {
    expect(canRevertFile(makeEntry({ status: 'synced', hasPrev: true }))).toBe(false);
  });

  it('returns false for outdated files even with hasPrev', () => {
    expect(canRevertFile(makeEntry({ status: 'outdated', hasPrev: true }))).toBe(false);
  });
});
