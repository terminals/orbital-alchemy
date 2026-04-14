/**
 * Environment and state detection for the wizard.
 */

import fs from 'fs';
import path from 'path';
import type { SetupState } from './types.js';

const ORBITAL_HOME = path.join(process.env.HOME || process.env.USERPROFILE || '~', '.orbital');

export { ORBITAL_HOME };

export function isOrbitalSetupDone(): boolean {
  return fs.existsSync(path.join(ORBITAL_HOME, 'config.json'));
}

export function buildSetupState(packageVersion: string): SetupState {
  return {
    packageVersion,
    isFirstTime: !isOrbitalSetupDone(),
    linkedProjects: [],
  };
}

