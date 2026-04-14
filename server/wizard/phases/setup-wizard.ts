/**
 * Phase 1: Setup Wizard — runs on first install or when ~/.orbital/ is missing.
 *
 * Creates the Orbital home directory, seeds primitives, and optionally
 * lets the user link projects immediately.
 */

import fs from 'fs';
import * as p from '@clack/prompts';
import type { SetupState } from '../types.js';
import { NOTES } from '../ui.js';
import { ORBITAL_HOME } from '../detect.js';

export async function phaseSetupWizard(_state: SetupState): Promise<void> {
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

  // Direct user to the dashboard for project setup
  p.note(
    'Launch the dashboard to add your first project.\nThe setup wizard will guide you through it.',
    'Next Steps',
  );
}
