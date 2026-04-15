import { describe, it, expect, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  hashFile,
  hashString,
  hashTree,
  loadManifest,
  saveManifest,
  createManifest,
  manifestPath,
  computeFileStatus,
  templateFileRecord,
  userFileRecord,
  createBackup,
  refreshFileStatuses,
  remapTemplatePath,
  reverseRemapPath,
  summarizeManifest,
  safeBackupFile,
  safeCopyTemplate,
  safeRestoreFile,
  MANIFEST_FILENAME,
  BACKUPS_DIR,
} from '../manifest.js';
import type { ManifestFile } from '../manifest-types.js';

// ─── Shared temp dir setup ──────────────────────────────────

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'orbital-manifest-test-'));

afterAll(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

function makeTmpDir(name: string): string {
  const dir = path.join(tmpRoot, name);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// ─── hashFile() ─────────────────────────────────────────────

describe('hashFile()', () => {
  it('returns a 16-char hex string', () => {
    const dir = makeTmpDir('hashFile-basic');
    const file = path.join(dir, 'test.txt');
    fs.writeFileSync(file, 'hello world', 'utf-8');
    const hash = hashFile(file);
    expect(hash).toMatch(/^[0-9a-f]{16}$/);
  });

  it('produces identical hashes for CRLF vs LF', () => {
    const dir = makeTmpDir('hashFile-crlf');
    const lfFile = path.join(dir, 'lf.txt');
    const crlfFile = path.join(dir, 'crlf.txt');
    fs.writeFileSync(lfFile, 'line1\nline2\nline3\n', 'utf-8');
    fs.writeFileSync(crlfFile, 'line1\r\nline2\r\nline3\r\n', 'utf-8');
    expect(hashFile(lfFile)).toBe(hashFile(crlfFile));
  });

  it('produces different hashes for different content', () => {
    const dir = makeTmpDir('hashFile-diff');
    const a = path.join(dir, 'a.txt');
    const b = path.join(dir, 'b.txt');
    fs.writeFileSync(a, 'content A', 'utf-8');
    fs.writeFileSync(b, 'content B', 'utf-8');
    expect(hashFile(a)).not.toBe(hashFile(b));
  });
});

// ─── hashString() ───────────────────────────────────────────

describe('hashString()', () => {
  it('returns a 16-char hex string', () => {
    expect(hashString('test')).toMatch(/^[0-9a-f]{16}$/);
  });

  it('normalizes CRLF to LF', () => {
    expect(hashString('a\r\nb')).toBe(hashString('a\nb'));
  });
});

// ─── hashTree() ─────────────────────────────────────────────

describe('hashTree()', () => {
  it('returns hashes for all files in a directory tree', () => {
    const dir = makeTmpDir('hashTree-basic');
    fs.mkdirSync(path.join(dir, 'sub'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'a.txt'), 'aaa', 'utf-8');
    fs.writeFileSync(path.join(dir, 'sub', 'b.txt'), 'bbb', 'utf-8');

    const tree = hashTree(dir);
    expect(tree.size).toBe(2);
    expect(tree.has('a.txt')).toBe(true);
    expect(tree.has('sub/b.txt')).toBe(true);
  });

  it('is deterministic across calls', () => {
    const dir = makeTmpDir('hashTree-deterministic');
    fs.writeFileSync(path.join(dir, 'x.txt'), 'xxx', 'utf-8');

    const hash1 = hashTree(dir);
    const hash2 = hashTree(dir);
    expect(hash1.get('x.txt')).toBe(hash2.get('x.txt'));
  });

  it('skips dotfiles', () => {
    const dir = makeTmpDir('hashTree-dotfiles');
    fs.writeFileSync(path.join(dir, '.hidden'), 'secret', 'utf-8');
    fs.writeFileSync(path.join(dir, 'visible.txt'), 'public', 'utf-8');

    const tree = hashTree(dir);
    expect(tree.size).toBe(1);
    expect(tree.has('visible.txt')).toBe(true);
    expect(tree.has('.hidden')).toBe(false);
  });

  it('returns empty map for non-existent directory', () => {
    const tree = hashTree('/nonexistent/path/xyz');
    expect(tree.size).toBe(0);
  });

  it('follows symlinks to files', () => {
    const dir = makeTmpDir('hashTree-symlink');
    const realFile = path.join(dir, 'real.txt');
    const linkFile = path.join(dir, 'link.txt');
    fs.writeFileSync(realFile, 'real content', 'utf-8');
    fs.symlinkSync(realFile, linkFile);

    const tree = hashTree(dir);
    expect(tree.size).toBe(2);
    expect(tree.get('real.txt')).toBe(tree.get('link.txt'));
  });
});

// ─── computeFileStatus() ────────────────────────────────────

describe('computeFileStatus()', () => {
  it('returns "synced" when hashes match template', () => {
    const record: ManifestFile = { origin: 'template', status: 'synced', templateHash: 'abc123', installedHash: 'abc123' };
    expect(computeFileStatus(record, 'abc123')).toBe('synced');
  });

  it('returns "outdated" when template changed but local matches installedHash', () => {
    const record: ManifestFile = { origin: 'template', status: 'synced', templateHash: 'new_hash', installedHash: 'old_hash' };
    expect(computeFileStatus(record, 'old_hash')).toBe('outdated');
  });

  it('returns "modified" when local differs from both template and installed', () => {
    const record: ManifestFile = { origin: 'template', status: 'synced', templateHash: 'template_hash', installedHash: 'installed_hash' };
    expect(computeFileStatus(record, 'totally_different')).toBe('modified');
  });

  it('returns "pinned" when status is pinned regardless of hashes', () => {
    const record: ManifestFile = { origin: 'template', status: 'pinned', templateHash: 'abc', installedHash: 'def' };
    expect(computeFileStatus(record, 'ghi')).toBe('pinned');
  });

  it('returns "user-owned" for user-origin files', () => {
    const record: ManifestFile = { origin: 'user', status: 'user-owned', installedHash: 'aaa' };
    expect(computeFileStatus(record, 'bbb')).toBe('user-owned');
  });

  it('returns "synced" when no templateHash and currentHash matches installedHash', () => {
    const record: ManifestFile = { origin: 'template', status: 'synced', installedHash: 'abc123' };
    expect(computeFileStatus(record, 'abc123')).toBe('synced');
  });
});

// ─── loadManifest() / saveManifest() ────────────────────────

describe('loadManifest() / saveManifest()', () => {
  it('round-trips a manifest correctly', () => {
    const dir = makeTmpDir('manifest-roundtrip');
    fs.mkdirSync(path.join(dir, '.claude'), { recursive: true });

    const original = createManifest('1.0.0', 'default');
    original.files['hooks/test.sh'] = templateFileRecord('abc123');
    original.files['custom.md'] = userFileRecord('def456');

    saveManifest(dir, original);
    const loaded = loadManifest(dir);

    expect(loaded).not.toBeNull();
    expect(loaded!.version).toBe(2);
    expect(loaded!.packageVersion).toBe('1.0.0');
    expect(loaded!.preset).toBe('default');
    expect(loaded!.files['hooks/test.sh']).toEqual(original.files['hooks/test.sh']);
    expect(loaded!.files['custom.md']).toEqual(original.files['custom.md']);
  });

  it('returns null for non-existent manifest', () => {
    const dir = makeTmpDir('manifest-missing');
    expect(loadManifest(dir)).toBeNull();
  });

  it('returns null for corrupted manifest', () => {
    const dir = makeTmpDir('manifest-corrupt');
    fs.mkdirSync(path.join(dir, '.claude'), { recursive: true });
    fs.writeFileSync(manifestPath(dir), 'not valid json!!!', 'utf-8');
    expect(loadManifest(dir)).toBeNull();
  });

  it('returns null for wrong version manifest', () => {
    const dir = makeTmpDir('manifest-version');
    fs.mkdirSync(path.join(dir, '.claude'), { recursive: true });
    fs.writeFileSync(manifestPath(dir), JSON.stringify({ version: 1 }), 'utf-8');
    expect(loadManifest(dir)).toBeNull();
  });
});

// ─── createManifest() ───────────────────────────────────────

describe('createManifest()', () => {
  it('creates a fresh manifest with correct defaults', () => {
    const m = createManifest('2.0.0', 'advanced');
    expect(m.version).toBe(2);
    expect(m.packageVersion).toBe('2.0.0');
    expect(m.preset).toBe('advanced');
    expect(m.files).toEqual({});
    expect(m.settingsHooksChecksum).toBe('');
    expect(m.appliedMigrations).toEqual([]);
    expect(m.generatedArtifacts).toContain('INDEX.md');
  });
});

// ─── templateFileRecord() / userFileRecord() ────────────────

describe('templateFileRecord()', () => {
  it('creates record with synced status', () => {
    const record = templateFileRecord('aaa');
    expect(record.origin).toBe('template');
    expect(record.status).toBe('synced');
    expect(record.templateHash).toBe('aaa');
    expect(record.installedHash).toBe('aaa');
  });

  it('includes symlinkTarget when provided', () => {
    const record = templateFileRecord('bbb', '../../templates/hooks/test.sh');
    expect(record.symlinkTarget).toBe('../../templates/hooks/test.sh');
  });
});

describe('userFileRecord()', () => {
  it('creates record with user-owned status', () => {
    const record = userFileRecord('ccc');
    expect(record.origin).toBe('user');
    expect(record.status).toBe('user-owned');
    expect(record.installedHash).toBe('ccc');
  });
});

// ─── createBackup() ─────────────────────────────────────────

describe('createBackup()', () => {
  it('returns null when no files to backup', () => {
    const dir = makeTmpDir('backup-empty');
    expect(createBackup(dir, [])).toBeNull();
  });

  it('creates a timestamped backup directory', () => {
    const dir = makeTmpDir('backup-create');
    const fileToBackup = 'hooks/test.sh';
    fs.mkdirSync(path.join(dir, 'hooks'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'hooks', 'test.sh'), '#!/bin/bash', 'utf-8');

    const backupDir = createBackup(dir, [fileToBackup]);
    expect(backupDir).not.toBeNull();
    expect(fs.existsSync(backupDir!)).toBe(true);
    expect(fs.existsSync(path.join(backupDir!, fileToBackup))).toBe(true);
  });

  it('rotates old backups keeping only 5', () => {
    const dir = makeTmpDir('backup-rotate');
    const backupsRoot = path.join(dir, BACKUPS_DIR);
    fs.mkdirSync(backupsRoot, { recursive: true });

    // Create 7 pre-existing backup directories
    for (let i = 0; i < 7; i++) {
      const ts = `2026-01-0${i + 1}T00-00-00-000Z`;
      const backupSubdir = path.join(backupsRoot, ts);
      fs.mkdirSync(backupSubdir, { recursive: true });
      fs.writeFileSync(path.join(backupSubdir, 'dummy.txt'), `backup ${i}`, 'utf-8');
    }

    // Create a file to backup
    fs.writeFileSync(path.join(dir, 'test.txt'), 'content', 'utf-8');
    createBackup(dir, ['test.txt']);

    // Count remaining backups
    const remaining = fs.readdirSync(backupsRoot, { withFileTypes: true })
      .filter(e => e.isDirectory());
    expect(remaining.length).toBeLessThanOrEqual(5);
  });
});

// ─── refreshFileStatuses() ──────────────────────────────────

describe('refreshFileStatuses()', () => {
  it('marks missing template files', () => {
    const dir = makeTmpDir('refresh-missing');
    const manifest = createManifest('1.0.0', 'default');
    manifest.files['hooks/gone.sh'] = templateFileRecord('abc');

    refreshFileStatuses(manifest, dir);
    expect(manifest.files['hooks/gone.sh'].status).toBe('missing');
  });

  it('does not change pinned file status', () => {
    const dir = makeTmpDir('refresh-pinned');
    const manifest = createManifest('1.0.0', 'default');
    manifest.files['hooks/pinned.sh'] = {
      origin: 'template',
      status: 'pinned',
      templateHash: 'abc',
      installedHash: 'abc',
    };

    refreshFileStatuses(manifest, dir);
    expect(manifest.files['hooks/pinned.sh'].status).toBe('pinned');
  });

  it('does not change user-origin file status', () => {
    const dir = makeTmpDir('refresh-user');
    const manifest = createManifest('1.0.0', 'default');
    manifest.files['hooks/user.sh'] = userFileRecord('abc');

    refreshFileStatuses(manifest, dir);
    expect(manifest.files['hooks/user.sh'].status).toBe('user-owned');
  });
});

// ─── remapTemplatePath() / reverseRemapPath() ───────────────

describe('remapTemplatePath()', () => {
  it('remaps presets/ to config/workflows/', () => {
    expect(remapTemplatePath('presets/default.json')).toBe('config/workflows/default.json');
  });

  it('passes through paths without remap', () => {
    expect(remapTemplatePath('hooks/test.sh')).toBe('hooks/test.sh');
  });
});

describe('reverseRemapPath()', () => {
  it('reverses config/workflows/ to presets/', () => {
    expect(reverseRemapPath('config/workflows/default.json')).toBe('presets/default.json');
  });

  it('passes through paths without reverse remap', () => {
    expect(reverseRemapPath('hooks/test.sh')).toBe('hooks/test.sh');
  });
});

// ─── summarizeManifest() ────────────────────────────────────

describe('summarizeManifest()', () => {
  it('computes correct summary from manifest files', () => {
    const manifest = createManifest('1.0.0', 'default');
    manifest.files['hooks/a.sh'] = { origin: 'template', status: 'synced', templateHash: 'a', installedHash: 'a' };
    manifest.files['hooks/b.sh'] = { origin: 'template', status: 'outdated', templateHash: 'b', installedHash: 'b' };
    manifest.files['skills/c.md'] = { origin: 'template', status: 'modified', templateHash: 'c', installedHash: 'c' };
    manifest.files['hooks/d.sh'] = { origin: 'template', status: 'pinned', templateHash: 'd', installedHash: 'd' };
    manifest.files['agents/e.md'] = { origin: 'user', status: 'user-owned', installedHash: 'e' };

    const summary = summarizeManifest(manifest);
    expect(summary.total).toBe(5);
    expect(summary.synced).toBe(1);
    expect(summary.outdated).toBe(1);
    expect(summary.modified).toBe(1);
    expect(summary.pinned).toBe(1);
    expect(summary.userOwned).toBe(1);
    expect(summary.byType['hooks'].synced).toBe(1);
    expect(summary.byType['hooks'].outdated).toBe(1);
    expect(summary.byType['hooks'].pinned).toBe(1);
    expect(summary.byType['skills'].modified).toBe(1);
    expect(summary.byType['agents'].userOwned).toBe(1);
  });

  it('returns zeros for empty manifest', () => {
    const manifest = createManifest('1.0.0', 'default');
    const summary = summarizeManifest(manifest);
    expect(summary.total).toBe(0);
    expect(summary.synced).toBe(0);
  });
});

// ─── safeBackupFile() / safeCopyTemplate() / safeRestoreFile() ──

describe('safeBackupFile()', () => {
  it('creates .prev backup for regular files', () => {
    const dir = makeTmpDir('safe-backup');
    const file = path.join(dir, 'test.sh');
    fs.writeFileSync(file, 'original', 'utf-8');

    safeBackupFile(file);
    expect(fs.existsSync(file + '.prev')).toBe(true);
    expect(fs.readFileSync(file + '.prev', 'utf-8')).toBe('original');
  });

  it('does nothing for non-existent file', () => {
    const dir = makeTmpDir('safe-backup-missing');
    const file = path.join(dir, 'nonexistent.sh');
    safeBackupFile(file);
    expect(fs.existsSync(file + '.prev')).toBe(false);
  });
});

describe('safeCopyTemplate()', () => {
  it('copies template to destination', () => {
    const dir = makeTmpDir('safe-copy');
    const src = path.join(dir, 'template.sh');
    const dest = path.join(dir, 'dest.sh');
    fs.writeFileSync(src, 'template content', 'utf-8');

    safeCopyTemplate(src, dest);
    expect(fs.readFileSync(dest, 'utf-8')).toBe('template content');
  });

  it('skips copy if destination is a symlink', () => {
    const dir = makeTmpDir('safe-copy-symlink');
    const src = path.join(dir, 'template.sh');
    const target = path.join(dir, 'target.sh');
    const dest = path.join(dir, 'dest.sh');
    fs.writeFileSync(src, 'new content', 'utf-8');
    fs.writeFileSync(target, 'symlinked content', 'utf-8');
    fs.symlinkSync(target, dest);

    safeCopyTemplate(src, dest);
    // Should still point to original symlink target
    expect(fs.readFileSync(dest, 'utf-8')).toBe('symlinked content');
  });
});

describe('safeRestoreFile()', () => {
  it('returns false when no .prev exists', () => {
    const dir = makeTmpDir('safe-restore-noprev');
    const file = path.join(dir, 'test.sh');
    fs.writeFileSync(file, 'current', 'utf-8');
    expect(safeRestoreFile(file)).toBe(false);
  });

  it('restores a regular file from .prev', () => {
    const dir = makeTmpDir('safe-restore-regular');
    const file = path.join(dir, 'test.sh');
    fs.writeFileSync(file, 'current', 'utf-8');
    fs.writeFileSync(file + '.prev', 'previous', 'utf-8');

    const result = safeRestoreFile(file);
    expect(result).toBe(true);
    expect(fs.readFileSync(file, 'utf-8')).toBe('previous');
  });
});

// ─── manifestPath() ─────────────────────────────────────────

describe('manifestPath()', () => {
  it('resolves to .claude/orbital-manifest.json', () => {
    expect(manifestPath('/foo/bar')).toBe(path.join('/foo/bar', '.claude', MANIFEST_FILENAME));
  });
});
