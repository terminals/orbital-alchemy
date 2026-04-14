#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import {
  detectProjectRoot,
  getPackageVersion,
  loadRegistry,
  writeRegistryAtomic,
  loadSharedModule,
  loadWizardModule,
  orbitalSetupDone,
  printHelp,
} from './lib/helpers.js';

import { cmdLaunchOrDev, cmdBuild } from './commands/launch.js';
import { cmdStatus, cmdValidate, cmdPin, cmdUnpin, cmdPins, cmdDiff, cmdReset } from './commands/manifest.js';
import { cmdRegister, cmdUnregister, cmdProjects } from './commands/registry.js';
import { cmdConfig, cmdDoctor } from './commands/config.js';
import { cmdEmit } from './commands/events.js';
import { cmdUpdate, cmdUninstall } from './commands/update.js';

// ---------------------------------------------------------------------------
// Hub Flow — the primary entry point
// ---------------------------------------------------------------------------

async function runHubFlow() {
  if (!process.stdout.isTTY || process.env.CI) {
    printHelp();
    return;
  }

  const wiz = await loadWizardModule();
  const hubVersion = getPackageVersion();

  // First-time global setup — run wizard then launch dashboard
  if (!orbitalSetupDone()) {
    await wiz.runSetupWizard(hubVersion);
    cmdLaunchOrDev(false);
    return;
  }

  const hubRoot = detectProjectRoot();
  const isInitialized = fs.existsSync(
    path.join(hubRoot, '.claude', 'orbital.config.json')
  );
  const hubRegistry = loadRegistry();

  // Not an initialized project — launch dashboard directly.
  // The frontend Add Project modal handles project setup.
  if (!isInitialized) {
    cmdLaunchOrDev(false);
    return;
  }

  // Show hub menu for initialized projects
  const projectNames = (hubRegistry.projects || []).map(p => p.name);
  const projects = (hubRegistry.projects || [])
    .filter(p => p.enabled !== false)
    .map(p => ({ name: p.name, path: p.path }));

  const hubResult = await wiz.runHub({
    packageVersion: hubVersion,
    projectNames,
    itermPromptShown: hubRegistry.itermPromptShown === true,
    isMac: process.platform === 'darwin',
    lastUpdateCheck: hubRegistry.lastUpdateCheck,
    latestVersion: hubRegistry.latestVersion,
    projectPaths: projects,
  });

  // Persist registry changes in one write
  let registryChanged = false;
  if (hubResult.setItermPromptShown) {
    hubRegistry.itermPromptShown = true;
    registryChanged = true;
  }
  if (hubResult.updateCache) {
    hubRegistry.lastUpdateCheck = hubResult.updateCache.lastUpdateCheck;
    hubRegistry.latestVersion = hubResult.updateCache.latestVersion;
    registryChanged = true;
  }
  if (registryChanged) {
    writeRegistryAtomic(hubRegistry);
  }

  // Route the chosen action, then loop back to menu
  let action = hubResult.action;

  while (true) {
    switch (action) {
      case 'launch': cmdLaunchOrDev(false); return;
      case 'config': await cmdConfig([]); break;
      case 'doctor': await cmdDoctor(); break;
      case 'update': await cmdUpdate([]); break;
      case 'status': await cmdStatus(); break;
      case 'reset': {
        const { runInit } = await loadSharedModule();
        runInit(hubRoot, { force: true });
        break;
      }
      default:
        console.error(`Unknown action: ${action}`);
        process.exit(1);
    }

    // Show menu again after completing an action
    console.log('');
    action = await wiz.promptHubAction(projectNames);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const [command, ...args] = process.argv.slice(2);

async function main() {
  switch (command) {
    case undefined:
      await runHubFlow();
      break;

    case 'launch':
      cmdLaunchOrDev(false);
      break;

    // Active commands
    case 'config':
      await cmdConfig(args);
      break;
    case 'doctor':
      await cmdDoctor();
      break;
    case 'dev':
      cmdLaunchOrDev(true);
      break;
    case 'register':
      cmdRegister(args);
      break;
    case 'unregister':
      cmdUnregister(args);
      break;
    case 'projects':
      cmdProjects();
      break;
    case 'build':
      cmdBuild();
      break;
    case 'emit':
      cmdEmit(args);
      break;
    case 'update':
      await cmdUpdate(args);
      break;
    case 'uninstall':
      await cmdUninstall(args);
      break;
    case 'status':
      await cmdStatus();
      break;
    case 'validate':
      await cmdValidate();
      break;
    case 'pin':
      await cmdPin(args);
      break;
    case 'unpin':
      await cmdUnpin(args);
      break;
    case 'pins':
      await cmdPins();
      break;
    case 'diff':
      await cmdDiff(args);
      break;
    case 'reset':
      await cmdReset(args);
      break;
    case 'private': {
      const registry = loadRegistry();
      const enable = args[0] !== 'off';
      registry.privateMode = enable;
      writeRegistryAtomic(registry);
      console.log(`Private mode ${enable ? 'enabled' : 'disabled'} globally.`);
      break;
    }
    case 'help':
    case '--help':
    case '-h':
      printHelp();
      break;
    default:
      console.error(`Unknown command: ${command}`);
      printHelp();
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
