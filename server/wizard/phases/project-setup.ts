/**
 * Phase 1: Project configuration — name, commands, ports.
 */

import * as p from '@clack/prompts';
import type { ProjectSetupState } from '../types.js';
import { NOTES, formatDetectedCommands } from '../ui.js';
import { detectProjectName, detectCommands, detectPortConflict } from '../detect.js';

export async function phaseProjectSetup(state: ProjectSetupState): Promise<void> {
  p.note(NOTES.projectConfig, 'Project Configuration');

  // 1. Project name
  const defaultName = detectProjectName(state.projectRoot);
  const name = await p.text({
    message: 'Project name',
    placeholder: defaultName,
    defaultValue: defaultName,
  });

  if (p.isCancel(name)) {
    p.cancel('Setup cancelled.');
    process.exit(0);
  }
  state.projectName = name;

  // 2. Command detection
  const detected = detectCommands(state.projectRoot);
  state.detectedCommands = detected;
  const detectedCount = Object.values(detected).filter(v => v !== null).length;

  if (detectedCount > 0) {
    p.note(formatDetectedCommands(detected), `Detected ${detectedCount} command(s) from package.json`);

    const useDetected = await p.confirm({
      message: 'Use these detected commands for quality gates?',
      initialValue: true,
    });

    if (p.isCancel(useDetected)) {
      p.cancel('Setup cancelled.');
      process.exit(0);
    }

    if (useDetected) {
      state.selectedCommands = { ...detected };
    } else {
      state.selectedCommands = await promptCommands(detected);
    }
  } else {
    p.log.info('No build commands detected from package.json. You can configure them later with `orbital config`.');
    state.selectedCommands = detected;
  }

  // 3. Port conflict detection
  const conflict = detectPortConflict(4444);
  if (conflict) {
    p.log.warn(`Port 4444 is already used by "${conflict}".`);

    const serverPort = await p.text({
      message: 'Server port',
      placeholder: '4446',
      defaultValue: '4446',
      validate: (val) => {
        const n = Number(val);
        if (isNaN(n) || n < 1 || n > 65535) return 'Must be a valid port (1-65535)';
        return undefined;
      },
    });

    if (p.isCancel(serverPort)) {
      p.cancel('Setup cancelled.');
      process.exit(0);
    }

    state.serverPort = Number(serverPort);
    state.clientPort = state.serverPort + 1;
  }
}

async function promptCommands(defaults: Record<string, string | null>): Promise<Record<string, string | null>> {
  const commands: Record<string, string | null> = {};
  const labels: Record<string, string> = {
    typeCheck: 'Type check command',
    lint: 'Lint command',
    build: 'Build command',
    test: 'Test command',
  };

  for (const [key, defaultVal] of Object.entries(defaults)) {
    const val = await p.text({
      message: labels[key] || key,
      placeholder: defaultVal || 'none',
      defaultValue: defaultVal || '',
    });

    if (p.isCancel(val)) {
      p.cancel('Setup cancelled.');
      process.exit(0);
    }

    commands[key] = val || null;
  }

  return commands;
}
