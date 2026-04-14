/**
 * Types for the interactive CLI wizard.
 *
 * Two wizard flows:
 *   Phase 1 (SetupState)        — first-time Orbital setup, ~/.orbital/ creation
 *   Phase 2 (ProjectSetupState) — per-project scaffolding into .claude/
 */

export interface SetupState {
  packageVersion: string;
  isFirstTime: boolean;           // ~/.orbital/ doesn't exist yet
  linkedProjects: string[];       // project paths added during setup
}

export interface ProjectSetupState {
  projectRoot: string;
  isProjectInitialized: boolean;  // .claude/orbital.config.json exists
  packageVersion: string;

  // Collected from phases
  projectName?: string;
  serverPort?: number;
  clientPort?: number;
  detectedCommands?: Record<string, string | null>;
  selectedCommands?: Record<string, string | null>;
  workflowPreset?: string;        // 'default' | 'minimal' | 'development' | 'gitflow'
}

export type { PresetInfo } from '../../shared/workflow-presets.js';
export { WORKFLOW_PRESETS } from '../../shared/workflow-presets.js';
