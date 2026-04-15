import { describe, it, expect } from 'vitest';
import { computeAllProjectsBoard } from './all-projects-board';
import { WorkflowEngine } from '../../shared/workflow-engine';
import { DEFAULT_CONFIG, MINIMAL_CONFIG } from '../../shared/__fixtures__/workflow-configs';
import type { Scope } from '@/types';

function makeScope(overrides: Partial<Scope> & { id: number }): Scope {
  return {
    title: `Scope ${overrides.id}`,
    status: 'backlog',
    priority: null,
    effort_estimate: null,
    category: null,
    tags: [],
    blocked_by: [],
    blocks: [],
    file_path: '/test',
    created_at: null,
    updated_at: null,
    raw_content: null,
    sessions: {},
    ...overrides,
  };
}

describe('computeAllProjectsBoard', () => {
  it('returns empty state for no engines', () => {
    const result = computeAllProjectsBoard([], new Map());
    expect(result.isUnified).toBe(true);
    expect(result.columns).toEqual([]);
    expect(result.scopesByColumn).toEqual({});
  });

  // ─── Unified workflow (all projects same) ─────────────────

  it('returns unified columns when single project', () => {
    const engine = new WorkflowEngine(DEFAULT_CONFIG);
    const engines = new Map([['proj-1', engine]]);
    const scopes = [makeScope({ id: 1, status: 'backlog', project_id: 'proj-1' })];

    const result = computeAllProjectsBoard(scopes, engines);
    expect(result.isUnified).toBe(true);
    expect(result.columns.length).toBeGreaterThan(0);
    // Scope should be in the backlog column
    expect(result.scopesByColumn['backlog']).toBeDefined();
  });

  it('returns unified columns when all engines match', () => {
    const engine1 = new WorkflowEngine(DEFAULT_CONFIG);
    const engine2 = new WorkflowEngine(DEFAULT_CONFIG);
    const engines = new Map([['proj-1', engine1], ['proj-2', engine2]]);
    const scopes = [
      makeScope({ id: 1, status: 'backlog', project_id: 'proj-1' }),
      makeScope({ id: 2, status: 'backlog', project_id: 'proj-2' }),
    ];

    const result = computeAllProjectsBoard(scopes, engines);
    expect(result.isUnified).toBe(true);
  });

  // ─── Non-unified (different workflows) ────────────────────

  it('returns phase columns when workflows differ', () => {
    const engine1 = new WorkflowEngine(DEFAULT_CONFIG);
    const engine2 = new WorkflowEngine(MINIMAL_CONFIG);
    const engines = new Map([['proj-1', engine1], ['proj-2', engine2]]);
    const scopes = [
      makeScope({ id: 1, status: 'backlog', project_id: 'proj-1' }),
      makeScope({ id: 2, status: 'todo', project_id: 'proj-2' }),
    ];

    const result = computeAllProjectsBoard(scopes, engines);
    expect(result.isUnified).toBe(false);
    // Phase columns: queued, active, review, shipped
    expect(result.columns.length).toBe(4);
    const phaseIds = result.columns.map(c => c.id);
    expect(phaseIds).toContain('queued');
    expect(phaseIds).toContain('active');
    expect(phaseIds).toContain('review');
    expect(phaseIds).toContain('shipped');
  });

  // ─── Scope without project_id falls to queued ─────────────

  it('puts scopes without project_id in queued when non-unified', () => {
    const engine1 = new WorkflowEngine(DEFAULT_CONFIG);
    const engine2 = new WorkflowEngine(MINIMAL_CONFIG);
    const engines = new Map([['proj-1', engine1], ['proj-2', engine2]]);
    const scopes = [makeScope({ id: 1, status: 'backlog' })];

    const result = computeAllProjectsBoard(scopes, engines);
    expect(result.isUnified).toBe(false);
    expect(result.scopesByColumn['queued']).toHaveLength(1);
  });

  // ─── Unknown status falls to entry point (unified) ────────

  it('falls back to entry point for unknown status in unified mode', () => {
    const engine = new WorkflowEngine(DEFAULT_CONFIG);
    const engines = new Map([['proj-1', engine]]);
    const scopes = [makeScope({ id: 1, status: 'nonexistent-status', project_id: 'proj-1' })];

    const result = computeAllProjectsBoard(scopes, engines);
    expect(result.isUnified).toBe(true);
    // Should fall back to entry point
    const entryId = engine.getEntryPoint().id;
    expect(result.scopesByColumn[entryId]).toHaveLength(1);
  });
});
