import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { ConfigService, isValidPrimitiveType } from './config-service.js';

describe('ConfigService', () => {
  let tmpDir: string;
  let service: ConfigService;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'config-svc-test-'));
    service = new ConfigService(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeFile(relPath: string, content: string): void {
    const fullPath = path.join(tmpDir, relPath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content, 'utf-8');
  }

  // ─── isValidPrimitiveType() ─────────────────────────────────

  describe('isValidPrimitiveType()', () => {
    it('accepts valid types', () => {
      expect(isValidPrimitiveType('agents')).toBe(true);
      expect(isValidPrimitiveType('skills')).toBe(true);
      expect(isValidPrimitiveType('hooks')).toBe(true);
    });

    it('rejects invalid types', () => {
      expect(isValidPrimitiveType('plugins')).toBe(false);
      expect(isValidPrimitiveType('')).toBe(false);
      expect(isValidPrimitiveType('AGENTS')).toBe(false);
    });
  });

  // ─── getBasePath() ──────────────────────────────────────────

  describe('getBasePath()', () => {
    it('resolves correct paths for each type', () => {
      expect(service.getBasePath('agents')).toBe(path.join(tmpDir, '.claude', 'agents'));
      expect(service.getBasePath('skills')).toBe(path.join(tmpDir, '.claude', 'skills'));
      expect(service.getBasePath('hooks')).toBe(path.join(tmpDir, '.claude', 'hooks'));
    });
  });

  // ─── scanDirectory() ───────────────────────────────────────

  describe('scanDirectory()', () => {
    it('returns empty array for non-existent directory', () => {
      const result = service.scanDirectory(path.join(tmpDir, 'nonexistent'));
      expect(result).toEqual([]);
    });

    it('returns empty array for empty directory', () => {
      const dir = path.join(tmpDir, 'empty');
      fs.mkdirSync(dir, { recursive: true });
      const result = service.scanDirectory(dir);
      expect(result).toEqual([]);
    });

    it('scans files and folders, folders first alphabetically', () => {
      const base = path.join(tmpDir, 'agents');
      writeFile('agents/alpha/AGENT.md', '# Alpha Agent');
      writeFile('agents/beta.sh', '#!/bin/bash');
      writeFile('agents/gamma/AGENT.md', '# Gamma Agent');

      const result = service.scanDirectory(base);

      // Folders first, then files, alphabetical within each
      expect(result[0].type).toBe('folder');
      expect(result[0].name).toBe('alpha');
      expect(result[1].type).toBe('folder');
      expect(result[1].name).toBe('gamma');
      expect(result[2].type).toBe('file');
      expect(result[2].name).toBe('beta.sh');
    });

    it('extracts frontmatter from .md files', () => {
      const base = path.join(tmpDir, 'agents');
      writeFile('agents/test-agent.md', [
        '---',
        'name: Test Agent',
        'role: reviewer',
        '---',
        '# Test Agent',
        'Description here.',
      ].join('\n'));

      const result = service.scanDirectory(base, true);
      const file = result.find(n => n.name === 'test-agent.md');
      expect(file).toBeDefined();
      expect(file!.frontmatter).toEqual({ name: 'Test Agent', role: 'reviewer' });
    });

    it('does not include frontmatter for non-.md files', () => {
      const base = path.join(tmpDir, 'hooks');
      writeFile('hooks/pre-push.sh', '#!/bin/bash\necho hello');

      const result = service.scanDirectory(base, true);
      const file = result.find(n => n.name === 'pre-push.sh');
      expect(file).toBeDefined();
      expect(file!.frontmatter).toBeUndefined();
    });

    it('skips hidden files', () => {
      const base = path.join(tmpDir, 'agents');
      writeFile('agents/.DS_Store', 'binary');
      writeFile('agents/visible.md', '# Visible');

      const result = service.scanDirectory(base);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('visible.md');
    });

    it('sets relative path correctly', () => {
      const base = path.join(tmpDir, 'skills');
      writeFile('skills/coding/SKILL.md', '# Coding Skill');

      const result = service.scanDirectory(base);
      const folder = result.find(n => n.name === 'coding');
      expect(folder).toBeDefined();
      expect(folder!.path).toBe('coding');
      expect(folder!.children![0].path).toBe(path.join('coding', 'SKILL.md'));
    });
  });

  // ─── readFile() ─────────────────────────────────────────────

  describe('readFile()', () => {
    it('reads file content within basePath', () => {
      const base = path.join(tmpDir, 'hooks');
      writeFile('hooks/test.sh', '#!/bin/bash\necho test');

      const content = service.readFile(base, 'test.sh');
      expect(content).toBe('#!/bin/bash\necho test');
    });

    it('rejects path traversal', () => {
      const base = path.join(tmpDir, 'hooks');
      writeFile('hooks/test.sh', 'content');
      writeFile('secret.txt', 'secret');

      expect(() => service.readFile(base, '../secret.txt')).toThrow('Path traversal detected');
    });
  });

  // ─── writeFile() ────────────────────────────────────────────

  describe('writeFile()', () => {
    it('writes file atomically', () => {
      const base = path.join(tmpDir, 'hooks');
      writeFile('hooks/test.sh', 'original');

      service.writeFile(base, 'test.sh', 'updated');
      expect(fs.readFileSync(path.join(base, 'test.sh'), 'utf-8')).toBe('updated');
    });

    it('throws when file does not exist', () => {
      const base = path.join(tmpDir, 'hooks');
      fs.mkdirSync(base, { recursive: true });

      expect(() => service.writeFile(base, 'nonexistent.sh', 'content')).toThrow('File not found');
    });
  });

  // ─── createFile() ──────────────────────────────────────────

  describe('createFile()', () => {
    it('creates a new file', () => {
      const base = path.join(tmpDir, 'hooks');
      fs.mkdirSync(base, { recursive: true });

      service.createFile(base, 'new.sh', '#!/bin/bash');
      expect(fs.existsSync(path.join(base, 'new.sh'))).toBe(true);
    });

    it('throws when file already exists', () => {
      const base = path.join(tmpDir, 'hooks');
      writeFile('hooks/existing.sh', 'content');

      expect(() => service.createFile(base, 'existing.sh', 'new')).toThrow('File already exists');
    });
  });

  // ─── deleteFile() ──────────────────────────────────────────

  describe('deleteFile()', () => {
    it('deletes an existing file', () => {
      const base = path.join(tmpDir, 'hooks');
      writeFile('hooks/delete-me.sh', 'content');

      service.deleteFile(base, 'delete-me.sh');
      expect(fs.existsSync(path.join(base, 'delete-me.sh'))).toBe(false);
    });

    it('throws when file does not exist', () => {
      const base = path.join(tmpDir, 'hooks');
      fs.mkdirSync(base, { recursive: true });

      expect(() => service.deleteFile(base, 'nonexistent.sh')).toThrow('File not found');
    });
  });
});
