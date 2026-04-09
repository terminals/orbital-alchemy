/**
 * Phase 2: Workflow preset selection.
 */

import * as p from '@clack/prompts';
import type { ProjectSetupState } from '../types.js';
import { WORKFLOW_PRESETS } from '../types.js';
import { NOTES } from '../ui.js';

export async function phaseWorkflowSetup(state: ProjectSetupState): Promise<void> {
  p.note(NOTES.workflow, 'Workflow Selection');

  const preset = await p.select({
    message: 'Choose a workflow preset',
    options: WORKFLOW_PRESETS.map(p => ({
      value: p.value,
      label: p.label,
      hint: p.hint,
    })),
  });

  if (p.isCancel(preset)) {
    p.cancel('Setup cancelled.');
    process.exit(0);
  }

  state.workflowPreset = preset as string;
}
