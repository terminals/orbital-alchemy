/**
 * Environment and state detection for the wizard.
 */

import fs from 'fs';
import path from 'path';
import type { SetupState, ProjectSetupState } from './types.js';

const ORBITAL_HOME = path.join(process.env.HOME || process.env.USERPROFILE || '~', '.orbital');

export { ORBITAL_HOME };

export function isInteractiveTerminal(): boolean {
  return !!(process.stdout.isTTY && !process.env.CI);
}

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

export function buildProjectState(projectRoot: string, packageVersion: string): ProjectSetupState {
  const projectConfigExists = fs.existsSync(path.join(projectRoot, '.claude', 'orbital.config.json'));

  return {
    projectRoot,
    isProjectInitialized: projectConfigExists,
    packageVersion,
  };
}

export function detectProjectName(projectRoot: string): string {
  return path.basename(projectRoot)
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

export function detectCommands(projectRoot: string): Record<string, string | null> {
  const commands: Record<string, string | null> = {
    typeCheck: null,
    lint: null,
    build: null,
    test: null,
  };

  const pkgJsonPath = path.join(projectRoot, 'package.json');
  if (!fs.existsSync(pkgJsonPath)) return commands;

  try {
    const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
    const scripts = pkg.scripts || {};

    if (scripts.typecheck || scripts['type-check']) {
      commands.typeCheck = `npm run ${scripts.typecheck ? 'typecheck' : 'type-check'}`;
    }
    if (scripts.lint) commands.lint = 'npm run lint';
    if (scripts.build) commands.build = 'npm run build';
    if (scripts.test) commands.test = 'npm run test';
  } catch { /* ignore malformed package.json */ }

  return commands;
}

export function detectPortConflict(serverPort: number): string | null {
  const registryPath = path.join(ORBITAL_HOME, 'config.json');
  if (!fs.existsSync(registryPath)) return null;

  try {
    const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    for (const project of registry.projects || []) {
      const configPath = path.join(project.path, '.claude', 'orbital.config.json');
      if (!fs.existsSync(configPath)) continue;
      try {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        if (config.serverPort === serverPort) return project.name;
      } catch { /* skip unreadable configs */ }
    }
  } catch { /* skip unreadable registry */ }

  return null;
}

export function isValidProjectPath(p: string): string | undefined {
  const resolved = p.startsWith('~')
    ? path.join(process.env.HOME || process.env.USERPROFILE || '~', p.slice(1))
    : path.resolve(p);
  if (!fs.existsSync(resolved)) return 'Directory does not exist';
  if (!fs.statSync(resolved).isDirectory()) return 'Not a directory';
  return undefined;
}

export function resolveProjectPath(p: string): string {
  if (p.startsWith('~')) {
    return path.join(process.env.HOME || process.env.USERPROFILE || '~', p.slice(1));
  }
  return path.resolve(p);
}
