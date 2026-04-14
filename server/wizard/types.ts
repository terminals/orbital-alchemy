/**
 * Types for the interactive CLI wizard.
 *
 * Phase 1 (SetupState) — first-time Orbital setup, ~/.orbital/ creation.
 * Project setup is handled by the frontend Add Project modal.
 */

export interface SetupState {
  packageVersion: string;
  isFirstTime: boolean;           // ~/.orbital/ doesn't exist yet
  linkedProjects: string[];       // project paths added during setup
}

export type { PresetInfo } from '../../shared/workflow-presets.js';
export { WORKFLOW_PRESETS } from '../../shared/workflow-presets.js';
