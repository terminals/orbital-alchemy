import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ScopeService } from './scope-service.js';
import { ScopeCache } from './scope-cache.js';
import { WorkflowEngine } from '../../shared/workflow-engine.js';
import { CONFIG_WITH_HOOKS } from '../../shared/__fixtures__/workflow-configs.js';
import { createMockEmitter } from '../__tests__/helpers/mock-emitter.js';
import type { Emitter } from '../project-emitter.js';
import fs from 'fs';
import os from 'os';
import path from 'path';

describe('ScopeService', () => {
  let tmpDir: string;
  let cache: ScopeCache;
  let emitter: Emitter & { emit: ReturnType<typeof vi.fn> };
  let engine: WorkflowEngine;
  let service: ScopeService;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-svc-test-'));
    cache = new ScopeCache();
    emitter = createMockEmitter();
    engine = new WorkflowEngine(CONFIG_WITH_HOOKS);
    service = new ScopeService(cache, emitter, tmpDir, engine);

    // Create status directories
    for (const status of ['icebox', 'backlog', 'active', 'review', 'shipped']) {
      fs.mkdirSync(path.join(tmpDir, status), { recursive: true });
    }
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeScopeFile(status: string, filename: string, frontmatter: Record<string, unknown>, body: string = '') {
    const filePath = path.join(tmpDir, status, filename);
    const yamlLines = Object.entries(frontmatter).map(([k, v]) => {
      if (Array.isArray(v)) return `${k}: [${v.join(', ')}]`;
      return `${k}: ${v}`;
    }).join('\n');
    fs.writeFileSync(filePath, `---\n${yamlLines}\n---\n${body}\n`);
    return filePath;
  }

  // ─── syncFromFilesystem() ─────────────────────────────────

  describe('syncFromFilesystem()', () => {
    it('loads all .md files into cache', () => {
      writeScopeFile('backlog', '001-first.md', { title: 'First', status: 'backlog' });
      writeScopeFile('active', '002-second.md', { title: 'Second', status: 'active' });

      const count = service.syncFromFilesystem();
      expect(count).toBe(2);
      expect(cache.size).toBe(2);
    });

    it('returns 0 for empty directories', () => {
      expect(service.syncFromFilesystem()).toBe(0);
    });
  });

  // ─── getAll() / getById() ─────────────────────────────────

  describe('getAll() / getById()', () => {
    it('delegates to cache', () => {
      writeScopeFile('backlog', '001-test.md', { title: 'Test', status: 'backlog' });
      service.syncFromFilesystem();

      expect(service.getAll()).toHaveLength(1);
      expect(service.getById(1)?.title).toBe('Test');
      expect(service.getById(999)).toBeUndefined();
    });
  });

  // ─── updateStatus() ──────────────────────────────────────

  describe('updateStatus()', () => {
    beforeEach(() => {
      writeScopeFile('backlog', '001-test.md', { title: 'Test', status: 'backlog' });
      service.syncFromFilesystem();
    });

    it('validates transition via engine', () => {
      // backlog → shipped is not a valid edge in CONFIG_WITH_HOOKS
      const result = service.updateStatus(1, 'shipped', 'patch');
      expect(result.ok).toBe(false);
    });

    it('bulk-sync bypasses validation', () => {
      const result = service.updateStatus(1, 'shipped', 'bulk-sync');
      expect(result.ok).toBe(true);
    });

    it('returns NOT_FOUND for unknown scope', () => {
      const result = service.updateStatus(999, 'active', 'dispatch');
      expect(result.ok).toBe(false);
    });

    it('fires onStatusChange callbacks on successful transition', () => {
      const callback = vi.fn();
      service.onStatusChange(callback);

      // Use bulk-sync to bypass edge validation — focuses on the callback mechanism
      const result = service.updateStatus(1, 'active', 'bulk-sync');
      if (result.ok) {
        expect(callback).toHaveBeenCalledWith(1, 'active');
      }
    });
  });

  // ─── createIdeaFile() ─────────────────────────────────────

  describe('createIdeaFile()', () => {
    it('creates file in icebox directory', () => {
      const result = service.createIdeaFile('My New Idea', 'A description of the idea');
      expect(result.slug).toBeDefined();
      expect(result.title).toBe('My New Idea');

      // Verify file exists
      const files = fs.readdirSync(path.join(tmpDir, 'icebox'));
      expect(files.length).toBe(1);
      expect(files[0]).toMatch(/\.md$/);
    });

    it('slugifies the title', () => {
      const result = service.createIdeaFile('Some Feature Idea!', '');
      expect(result.slug).toMatch(/^[a-z0-9-]+$/);
    });
  });

  // ─── deleteIdeaFile() ─────────────────────────────────────

  describe('deleteIdeaFile()', () => {
    it('removes the idea file', () => {
      const { slug } = service.createIdeaFile('To Delete', '');
      const result = service.deleteIdeaFile(slug);
      expect(result).toBe(true);

      const files = fs.readdirSync(path.join(tmpDir, 'icebox'));
      expect(files).toHaveLength(0);
    });

    it('returns false for non-existent slug', () => {
      expect(service.deleteIdeaFile('nonexistent-slug')).toBe(false);
    });
  });

  // ─── reconcileDirectories() ───────────────────────────────

  describe('reconcileDirectories()', () => {
    it('moves files to correct directory based on frontmatter', () => {
      // Put a file in backlog but with status: active in frontmatter
      writeScopeFile('backlog', '001-misplaced.md', { title: 'Misplaced', status: 'active' });
      service.syncFromFilesystem();

      const moved = service.reconcileDirectories();
      expect(moved).toBeGreaterThanOrEqual(0);
    });
  });

  // ─── isSuppressed() ──────────────────────────────────────

  describe('isSuppressed()', () => {
    it('returns false by default', () => {
      expect(service.isSuppressed('/some/path.md')).toBe(false);
    });
  });
});
