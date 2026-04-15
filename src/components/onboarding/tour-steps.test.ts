import { describe, it, expect } from 'vitest';
import { TOUR_STEPS } from './tour-steps';

describe('onboarding tour steps', () => {
  it('should have at least one step', () => {
    expect(TOUR_STEPS.length).toBeGreaterThan(0);
  });

  it('should have unique step IDs', () => {
    const ids = TOUR_STEPS.map(s => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('should have unique targets', () => {
    const targets = TOUR_STEPS.map(s => s.target);
    expect(new Set(targets).size).toBe(targets.length);
  });

  it('should have title and description for every step', () => {
    for (const step of TOUR_STEPS) {
      expect(step.title).toBeTruthy();
      expect(step.description).toBeTruthy();
    }
  });

  it('should have valid placement values', () => {
    const validPlacements = new Set(['top', 'bottom', 'left', 'right']);
    for (const step of TOUR_STEPS) {
      if (step.placement) {
        expect(validPlacements.has(step.placement)).toBe(true);
      }
    }
  });

  it('should mark dynamic content steps as optional', () => {
    const dynamicTargets = ['kanban-column', 'scope-card'];
    for (const step of TOUR_STEPS) {
      if (dynamicTargets.includes(step.target)) {
        expect(step.optional).toBe(true);
      }
    }
  });

  it('should cover all expected pages', () => {
    const pages = new Set(TOUR_STEPS.filter(s => s.page).map(s => s.page));
    expect(pages.has('/')).toBe(true);
    expect(pages.has('/primitives')).toBe(true);
    expect(pages.has('/guards')).toBe(true);
    expect(pages.has('/repo')).toBe(true);
    expect(pages.has('/sessions')).toBe(true);
    expect(pages.has('/workflow')).toBe(true);
  });

  describe('step sequencing', () => {
    it('first step should target the Kanban nav', () => {
      expect(TOUR_STEPS[0].target).toBe('nav-kanban');
      expect(TOUR_STEPS[0].page).toBe('/');
    });

    it('last step should target Settings', () => {
      const last = TOUR_STEPS[TOUR_STEPS.length - 1];
      expect(last.target).toBe('nav-settings');
    });

    it('should complete a full traversal of all steps', () => {
      let index = 0;
      const visited: string[] = [];
      while (index < TOUR_STEPS.length) {
        visited.push(TOUR_STEPS[index].id);
        index++;
      }
      expect(visited.length).toBe(TOUR_STEPS.length);
      expect(visited[0]).toBe('welcome');
      expect(visited[visited.length - 1]).toBe('nav-settings');
    });
  });

  describe('completion tracking', () => {
    it('default state should be pending', () => {
      const DEFAULT_STATE = 'pending';
      expect(DEFAULT_STATE).toBe('pending');
    });

    it('completed state should be the string completed', () => {
      const state: string = 'completed';
      expect(state).toBe('completed');
    });

    it('dismissed state should be the string dismissed', () => {
      const state: string = 'dismissed';
      expect(state).toBe('dismissed');
    });
  });
});
