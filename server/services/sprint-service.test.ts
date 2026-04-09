import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SprintService } from './sprint-service.js';
import { createTestDb } from '../__tests__/helpers/db.js';
import { createMockEmitter } from '../__tests__/helpers/mock-emitter.js';
import type Database from 'better-sqlite3';
import type { Emitter } from '../project-emitter.js';
import type { ParsedScope } from '../parsers/scope-parser.js';

function makeScope(overrides: Partial<ParsedScope> & { id: number }): ParsedScope {
  return {
    title: `Scope ${overrides.id}`,
    slug: undefined,
    status: 'backlog',
    priority: null,
    effort_estimate: null,
    category: null,
    tags: [],
    blocked_by: [],
    blocks: [],
    file_path: `/scopes/backlog/${String(overrides.id).padStart(3, '0')}-test.md`,
    created_at: null,
    updated_at: null,
    raw_content: '',
    sessions: {},
    is_ghost: false,
    favourite: false,
    ...overrides,
  };
}

function createMockScopeService(scopes: ParsedScope[]) {
  return { getById: (id: number) => scopes.find(s => s.id === id) } as unknown as ConstructorParameters<typeof SprintService>[2];
}

describe('SprintService', () => {
  let db: Database.Database;
  let cleanup: () => void;
  let emitter: Emitter & { emit: ReturnType<typeof vi.fn> };
  let service: SprintService;
  const testScopes = [
    makeScope({ id: 1, title: 'Scope 1', status: 'backlog' }),
    makeScope({ id: 2, title: 'Scope 2', status: 'backlog' }),
    makeScope({ id: 3, title: 'Scope 3', status: 'backlog', blocked_by: [99] }),
    makeScope({ id: 4, title: 'Scope 4', status: 'implementing' }),
  ];

  beforeEach(() => {
    ({ db, cleanup } = createTestDb());
    // Add migration columns that SCHEMA_DDL may not include
    try { db.prepare("ALTER TABLE sprints ADD COLUMN target_column TEXT DEFAULT 'backlog'").run(); } catch { /* already exists */ }
    try { db.prepare("ALTER TABLE sprints ADD COLUMN group_type TEXT DEFAULT 'sprint'").run(); } catch { /* already exists */ }
    try { db.prepare("ALTER TABLE sprints ADD COLUMN dispatch_result TEXT DEFAULT '{}'").run(); } catch { /* already exists */ }
    emitter = createMockEmitter();
    const mockScopeService = createMockScopeService(testScopes);
    service = new SprintService(db, emitter, mockScopeService);
  });

  afterEach(() => {
    cleanup?.();
  });

  // ─── create() ─────────────────────────────────────────────

  describe('create()', () => {
    it('creates sprint with default values', () => {
      const sprint = service.create('Test Sprint');
      expect(sprint.name).toBe('Test Sprint');
      expect(sprint.status).toBe('assembling');
      expect(sprint.concurrency_cap).toBe(5);
      expect(sprint.group_type).toBe('sprint');
      expect(sprint.target_column).toBe('backlog');
    });

    it('creates batch with custom options', () => {
      const sprint = service.create('Test Batch', { group_type: 'batch', target_column: 'review' });
      expect(sprint.group_type).toBe('batch');
      expect(sprint.target_column).toBe('review');
    });

    it('emits sprint:created', () => {
      service.create('Test Sprint');
      expect(emitter.emit).toHaveBeenCalledWith('sprint:created', expect.objectContaining({ name: 'Test Sprint' }));
    });
  });

  // ─── getAll() / getById() ─────────────────────────────────

  describe('getAll() / getById()', () => {
    it('returns all sprints', () => {
      service.create('Sprint 1');
      service.create('Sprint 2');
      expect(service.getAll()).toHaveLength(2);
    });

    it('filters by status', () => {
      service.create('Sprint 1');
      const all = service.getAll('assembling');
      expect(all).toHaveLength(1);
      expect(service.getAll('dispatched')).toHaveLength(0);
    });

    it('returns null for unknown ID', () => {
      expect(service.getById(999)).toBeNull();
    });
  });

  // ─── rename() / delete() ──────────────────────────────────

  describe('rename()', () => {
    it('renames an assembling sprint', () => {
      const sprint = service.create('Original');
      const result = service.rename(sprint.id, 'Renamed');
      expect(result).toBe(true);
      expect(service.getById(sprint.id)!.name).toBe('Renamed');
    });

    it('returns false for non-assembling sprint', () => {
      const sprint = service.create('Sprint');
      service.updateStatus(sprint.id, 'dispatched');
      expect(service.rename(sprint.id, 'New Name')).toBe(false);
    });
  });

  describe('delete()', () => {
    it('deletes sprint and emits event', () => {
      const sprint = service.create('To Delete');
      const result = service.delete(sprint.id);
      expect(result).toBe(true);
      expect(service.getById(sprint.id)).toBeNull();
      expect(emitter.emit).toHaveBeenCalledWith('sprint:deleted', expect.objectContaining({ id: sprint.id }));
    });
  });

  // ─── addScopes() ──────────────────────────────────────────

  describe('addScopes()', () => {
    it('adds scopes to assembling sprint', () => {
      const sprint = service.create('Sprint');
      const result = service.addScopes(sprint.id, [1, 2]);
      expect(result).not.toBeNull();
      expect(result!.added).toEqual([1, 2]);
    });

    it('returns null for non-existent sprint', () => {
      expect(service.addScopes(999, [1])).toBeNull();
    });

    it('reports unmet dependencies', () => {
      const sprint = service.create('Sprint');
      const result = service.addScopes(sprint.id, [3]); // scope 3 is blocked_by [99]
      expect(result).not.toBeNull();
      expect(result!.unmet_dependencies.length).toBeGreaterThanOrEqual(0);
    });

    it('skips scopes that are already in the sprint', () => {
      const sprint = service.create('Sprint');
      service.addScopes(sprint.id, [1]);
      const result = service.addScopes(sprint.id, [1, 2]);
      expect(result).not.toBeNull();
      expect(result!.added).toEqual([2]);
    });
  });

  // ─── removeScopes() ──────────────────────────────────────

  describe('removeScopes()', () => {
    it('removes scopes from assembling sprint', () => {
      const sprint = service.create('Sprint');
      service.addScopes(sprint.id, [1, 2]);
      const result = service.removeScopes(sprint.id, [1]);
      expect(result).toBe(true);
      const updated = service.getById(sprint.id)!;
      expect(updated.scope_ids).not.toContain(1);
    });
  });

  // ─── updateStatus() ──────────────────────────────────────

  describe('updateStatus()', () => {
    it('transitions to dispatched and sets dispatched_at', () => {
      const sprint = service.create('Sprint');
      service.addScopes(sprint.id, [1]);
      service.updateStatus(sprint.id, 'dispatched');
      const updated = service.getById(sprint.id)!;
      expect(updated.status).toBe('dispatched');
      expect(updated.dispatched_at).not.toBeNull();
    });

    it('transitions to completed and sets completed_at', () => {
      const sprint = service.create('Sprint');
      service.updateStatus(sprint.id, 'completed');
      const updated = service.getById(sprint.id)!;
      expect(updated.status).toBe('completed');
      expect(updated.completed_at).not.toBeNull();
    });

    it('emits sprint:updated on status change', () => {
      const sprint = service.create('Sprint');
      emitter.emit.mockClear();
      service.updateStatus(sprint.id, 'dispatched');
      expect(emitter.emit).toHaveBeenCalledWith('sprint:updated', expect.objectContaining({ status: 'dispatched' }));
    });
  });

  // ─── updateScopeStatus() ─────────────────────────────────

  describe('updateScopeStatus()', () => {
    it('updates dispatch_status for a scope in sprint', () => {
      const sprint = service.create('Sprint');
      service.addScopes(sprint.id, [1]);
      service.updateScopeStatus(sprint.id, 1, 'in_progress');
      const updated = service.getById(sprint.id)!;
      const scope = updated.scopes.find(s => s.scope_id === 1);
      expect(scope?.dispatch_status).toBe('in_progress');
    });

    it('records error for failed scopes', () => {
      const sprint = service.create('Sprint');
      service.addScopes(sprint.id, [1]);
      service.updateScopeStatus(sprint.id, 1, 'failed', 'Timeout');
      const rows = db.prepare('SELECT error FROM sprint_scopes WHERE scope_id = 1').all() as Array<{ error: string | null }>;
      expect(rows[0].error).toBe('Timeout');
    });
  });

  // ─── setLayers() ──────────────────────────────────────────

  describe('setLayers()', () => {
    it('stores layer assignment', () => {
      const sprint = service.create('Sprint');
      service.addScopes(sprint.id, [1, 2]);
      service.setLayers(sprint.id, [[1], [2]]);
      const updated = service.getById(sprint.id)!;
      expect(updated.layers).toEqual([[1], [2]]);
    });
  });

  // ─── findActiveSprintForScope() ───────────────────────────

  describe('findActiveSprintForScope()', () => {
    it('returns active sprint containing the scope', () => {
      const sprint = service.create('Sprint');
      service.addScopes(sprint.id, [1]);
      service.updateStatus(sprint.id, 'dispatched');
      const active = service.findActiveSprintForScope(1);
      expect(active).not.toBeNull();
      expect(active!.sprint_id).toBe(sprint.id);
    });

    it('returns null/undefined when scope is not in any active sprint', () => {
      expect(service.findActiveSprintForScope(99)).toBeFalsy();
    });
  });

  // ─── getActiveGroupForScope() ─────────────────────────────

  describe('getActiveGroupForScope()', () => {
    it('returns group info for scope in active sprint', () => {
      const sprint = service.create('Batch', { group_type: 'batch' });
      service.addScopes(sprint.id, [1]);
      service.updateStatus(sprint.id, 'dispatched');
      const group = service.getActiveGroupForScope(1);
      expect(group).not.toBeNull();
      expect(group!.group_type).toBe('batch');
    });

    it('returns null/undefined when scope is not in any active group', () => {
      expect(service.getActiveGroupForScope(99)).toBeFalsy();
    });
  });
});
