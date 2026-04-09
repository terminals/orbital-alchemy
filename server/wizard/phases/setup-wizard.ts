/**
 * Phase 1: Setup Wizard — runs on first install or when ~/.orbital/ is missing.
 *
 * Creates the Orbital home directory, seeds primitives, and optionally
 * lets the user link projects immediately.
 */

import fs from 'fs';
import * as p from '@clack/prompts';
import pc from 'picocolors';
import type { SetupState } from '../types.js';
import { NOTES } from '../ui.js';
import { isValidProjectPath, resolveProjectPath, ORBITAL_HOME } from '../detect.js';

export async function phaseSetupWizard(state: SetupState): Promise<void> {
  // Welcome and core concepts
  p.note(NOTES.setupWelcome, 'Welcome');

  // Create ~/.orbital/ and seed primitives
  const s = p.spinner();
  s.start('Setting up Orbital Command...');

  try {
    const { ensureOrbitalHome } = await import('../../global-config.js');
    const { seedGlobalPrimitives } = await import('../../init.js');

    ensureOrbitalHome();
    seedGlobalPrimitives();

    // Create empty registry if it doesn't exist
    const registryPath = `${ORBITAL_HOME}/config.json`;
    if (!fs.existsSync(registryPath)) {
      fs.writeFileSync(registryPath, JSON.stringify({ version: 1, projects: [] }, null, 2), 'utf8');
    }

    s.stop('Orbital Command is ready.');
  } catch (err) {
    s.stop('Setup failed.');
    p.log.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  // Offer to link projects
  p.note(NOTES.addProject, 'Projects');

  let addMore = true;
  while (addMore) {
    const wantsProject = await p.confirm({
      message: state.linkedProjects.length === 0
        ? 'Add a project now?'
        : 'Add another project?',
      initialValue: state.linkedProjects.length === 0,
    });

    if (p.isCancel(wantsProject) || !wantsProject) {
      addMore = false;
      break;
    }

    const projectPath = await p.text({
      message: 'Project path',
      placeholder: '~/Code/my-project',
      validate: (val) => {
        if (!val || !val.trim()) return 'Path is required';
        return isValidProjectPath(val.trim());
      },
    });

    if (p.isCancel(projectPath)) {
      addMore = false;
      break;
    }

    const resolved = resolveProjectPath(projectPath.trim());
    state.linkedProjects.push(resolved);
    p.log.success(`Added: ${pc.cyan(resolved)}`);
  }
}
