/**
 * Phase 3: Confirm choices, run installation, show next steps.
 */

import fs from 'fs';
import path from 'path';
import * as p from '@clack/prompts';
import type { ProjectSetupState } from '../types.js';
import { NOTES, formatSummary } from '../ui.js';

export async function phaseConfirm(state: ProjectSetupState): Promise<void> {
  p.note(formatSummary(state), 'Ready to Initialize');

  const proceed = await p.confirm({
    message: 'Proceed with installation?',
    initialValue: true,
  });

  if (p.isCancel(proceed) || !proceed) {
    p.cancel('Setup cancelled.');
    process.exit(0);
  }
}

export function showPostInstall(state: ProjectSetupState): void {
  // Count installed artifacts
  const claudeDir = path.join(state.projectRoot, '.claude');
  const counts = {
    hooks: countDir(path.join(claudeDir, 'hooks')),
    skills: countDir(path.join(claudeDir, 'skills')),
    agents: countDir(path.join(claudeDir, 'agents')),
  };

  p.note(NOTES.postInstall(counts), 'Installation Complete');
  p.note(NOTES.nextSteps, 'Getting Started');
}

function countDir(dir: string): number {
  if (!fs.existsSync(dir)) return 0;
  try {
    return fs.readdirSync(dir).filter(f => !f.startsWith('.')).length;
  } catch {
    return 0;
  }
}
