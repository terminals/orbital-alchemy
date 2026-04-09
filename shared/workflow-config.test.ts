import { describe, it, expect } from 'vitest';
import {
  isWorkflowConfig, isWorkflowList, isWorkflowEdge, getHookEnforcement,
  type WorkflowHook,
} from './workflow-config.js';
import { MINIMAL_CONFIG, DEFAULT_CONFIG } from './__fixtures__/workflow-configs.js';

describe('isWorkflowConfig()', () => {
  it('returns true for valid minimal config', () => {
    expect(isWorkflowConfig(MINIMAL_CONFIG)).toBe(true);
  });

  it('returns true for full default config', () => {
    expect(isWorkflowConfig(DEFAULT_CONFIG)).toBe(true);
  });

  it('returns false for null', () => {
    expect(isWorkflowConfig(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isWorkflowConfig(undefined)).toBe(false);
  });

  it('returns false for non-object', () => {
    expect(isWorkflowConfig('string')).toBe(false);
    expect(isWorkflowConfig(42)).toBe(false);
  });

  it('returns false when version != 1', () => {
    expect(isWorkflowConfig({ ...MINIMAL_CONFIG, version: 2 })).toBe(false);
  });

  it('returns false when lists is not an array', () => {
    expect(isWorkflowConfig({ ...MINIMAL_CONFIG, lists: 'not-array' })).toBe(false);
  });

  it('returns false when name is not a string', () => {
    expect(isWorkflowConfig({ ...MINIMAL_CONFIG, name: 123 })).toBe(false);
  });

  it('returns false when branchingMode is invalid', () => {
    expect(isWorkflowConfig({ ...MINIMAL_CONFIG, branchingMode: 'invalid' })).toBe(false);
  });

  it('returns true when branchingMode is trunk or worktree', () => {
    expect(isWorkflowConfig({ ...MINIMAL_CONFIG, branchingMode: 'trunk' })).toBe(true);
    expect(isWorkflowConfig({ ...MINIMAL_CONFIG, branchingMode: 'worktree' })).toBe(true);
  });
});

describe('isWorkflowList()', () => {
  const validList = MINIMAL_CONFIG.lists[0];

  it('returns true for valid list', () => {
    expect(isWorkflowList(validList)).toBe(true);
  });

  it('returns false for non-object', () => {
    expect(isWorkflowList(null)).toBe(false);
    expect(isWorkflowList('string')).toBe(false);
  });

  it('returns false when missing required fields', () => {
    expect(isWorkflowList({ id: 'a', label: 'A' })).toBe(false); // missing order, color, hex, hasDirectory
  });

  it('returns true with optional fields present', () => {
    expect(isWorkflowList({ ...validList, gitBranch: 'main', sessionKey: 'test' })).toBe(true);
  });
});

describe('isWorkflowEdge()', () => {
  const validEdge = MINIMAL_CONFIG.edges[0];

  it('returns true for valid edge', () => {
    expect(isWorkflowEdge(validEdge)).toBe(true);
  });

  it('returns false for non-object', () => {
    expect(isWorkflowEdge(null)).toBe(false);
    expect(isWorkflowEdge(42)).toBe(false);
  });

  it('returns false when missing required string fields', () => {
    expect(isWorkflowEdge({ from: 'a', to: 'b' })).toBe(false); // missing direction, label, description
  });
});

describe('getHookEnforcement()', () => {
  const makeHook = (category: string): WorkflowHook => ({
    id: 'test', label: 'Test', timing: 'before', type: 'shell',
    target: 'test.sh', category: category as WorkflowHook['category'],
  });

  it('guard -> blocker', () => {
    expect(getHookEnforcement(makeHook('guard'))).toBe('blocker');
  });

  it('gate -> advisor', () => {
    expect(getHookEnforcement(makeHook('gate'))).toBe('advisor');
  });

  it('lifecycle -> operator', () => {
    expect(getHookEnforcement(makeHook('lifecycle'))).toBe('operator');
  });

  it('observer -> silent', () => {
    expect(getHookEnforcement(makeHook('observer'))).toBe('silent');
  });
});
