import { describe, it, expect } from 'vitest';
import { parseDragId, INITIAL_STATE } from './kanban-dnd-utils';

// ─── parseDragId ────────────────────────────────────────────

describe('parseDragId', () => {
  it('parses numeric scope IDs', () => {
    expect(parseDragId(42)).toEqual({ type: 'scope', scopeId: 42 });
    expect(parseDragId(0)).toEqual({ type: 'scope', scopeId: 0 });
    expect(parseDragId(-1)).toEqual({ type: 'scope', scopeId: -1 });
  });

  it('parses string numeric scope IDs', () => {
    expect(parseDragId('123')).toEqual({ type: 'scope', scopeId: 123 });
    expect(parseDragId('-5')).toEqual({ type: 'scope', scopeId: -5 });
  });

  it('parses sprint IDs', () => {
    expect(parseDragId('sprint-7')).toEqual({ type: 'sprint', sprintId: 7 });
    expect(parseDragId('sprint-0')).toEqual({ type: 'sprint', sprintId: 0 });
  });

  it('parses sprint drop targets', () => {
    expect(parseDragId('sprint-drop-3')).toEqual({ type: 'sprint-drop', sprintId: 3 });
    expect(parseDragId('sprint-drop-0')).toEqual({ type: 'sprint-drop', sprintId: 0 });
  });

  it('parses swimlane cell IDs as column targets', () => {
    expect(parseDragId('swim::high::implementing')).toEqual({ type: 'column', status: 'implementing' });
    expect(parseDragId('swim::low::done')).toEqual({ type: 'column', status: 'done' });
    expect(parseDragId('swim::::backlog')).toEqual({ type: 'column', status: 'backlog' });
  });

  it('parses project-scoped scope IDs', () => {
    expect(parseDragId('proj-abc::123')).toEqual({ type: 'scope', scopeId: 123, projectId: 'proj-abc' });
    expect(parseDragId('my-project::42')).toEqual({ type: 'scope', scopeId: 42, projectId: 'my-project' });
    expect(parseDragId('proj::-7')).toEqual({ type: 'scope', scopeId: -7, projectId: 'proj' });
  });

  it('treats unrecognized strings as column status IDs', () => {
    expect(parseDragId('backlog')).toEqual({ type: 'column', status: 'backlog' });
    expect(parseDragId('implementing')).toEqual({ type: 'column', status: 'implementing' });
    expect(parseDragId('in-review')).toEqual({ type: 'column', status: 'in-review' });
  });

  it('prioritizes sprint-drop over sprint prefix', () => {
    // "sprint-drop-5" starts with "sprint-" but should match sprint-drop first
    const result = parseDragId('sprint-drop-5');
    expect(result).toEqual({ type: 'sprint-drop', sprintId: 5 });
  });
});

// ─── INITIAL_STATE ──────────────────────────────────────────

describe('INITIAL_STATE', () => {
  it('has exactly 15 properties', () => {
    expect(Object.keys(INITIAL_STATE)).toHaveLength(15);
  });

  it('has all null object fields', () => {
    expect(INITIAL_STATE.activeScope).toBeNull();
    expect(INITIAL_STATE.activeSprint).toBeNull();
    expect(INITIAL_STATE.overId).toBeNull();
    expect(INITIAL_STATE.pending).toBeNull();
    expect(INITIAL_STATE.error).toBeNull();
    expect(INITIAL_STATE.pendingSprintDispatch).toBeNull();
    expect(INITIAL_STATE.pendingUnmetDeps).toBeNull();
    expect(INITIAL_STATE.pendingDepSprintId).toBeNull();
    expect(INITIAL_STATE.pendingDisambiguation).toBeNull();
  });

  it('has all false boolean fields', () => {
    expect(INITIAL_STATE.overIsValid).toBe(false);
    expect(INITIAL_STATE.showModal).toBe(false);
    expect(INITIAL_STATE.showPopover).toBe(false);
    expect(INITIAL_STATE.showIdeaForm).toBe(false);
    expect(INITIAL_STATE.dispatching).toBe(false);
  });

  it('has null overSprintId', () => {
    expect(INITIAL_STATE.overSprintId).toBeNull();
  });
});
