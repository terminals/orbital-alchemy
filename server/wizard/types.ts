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

export interface PresetInfo {
  value: string;
  label: string;
  hint: string;
}

export const WORKFLOW_PRESETS: PresetInfo[] = [
  {
    value: 'default',
    label: 'Default',
    hint: '7 lists, trunk-based — Icebox → Planning → Backlog → Implementing → Review → Completed → Main',
  },
  {
    value: 'minimal',
    label: 'Minimal',
    hint: '3 lists — To Do → In Progress → Done',
  },
  {
    value: 'development',
    label: 'Development',
    hint: '5 lists, dev branch — Backlog → Implementing → Review → Completed → Dev',
  },
  {
    value: 'gitflow',
    label: 'Gitflow',
    hint: '9 lists, multi-branch — Full pipeline with Dev, Staging, and Production',
  },
];
