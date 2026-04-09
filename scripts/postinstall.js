#!/usr/bin/env node

/**
 * Postinstall script for orbital-command.
 *
 * 1. Ensures esbuild's platform-specific binary is present (safety net).
 * 2. If this is an interactive terminal and Orbital hasn't been set up yet,
 *    launches the Phase 1 setup wizard.
 * 3. Otherwise, prints a banner with next steps.
 */

import { existsSync, readFileSync } from 'fs';
import { execFileSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(__dirname, '..');
const orbitalHome = path.join(process.env.HOME || process.env.USERPROFILE || '~', '.orbital');

// ─── 1. Esbuild safety net ─────────────────────────────────────

const esbuildInstall = path.join(packageRoot, 'node_modules', 'esbuild', 'install.js');
if (existsSync(esbuildInstall)) {
  try {
    execFileSync('node', [esbuildInstall], { stdio: 'pipe' });
  } catch {
    // Already installed or not applicable
  }
}

// ─── 2. Setup wizard or banner ──────────────────────────────────

const isInteractive = process.stdout.isTTY && !process.env.CI;
const alreadySetUp = existsSync(path.join(orbitalHome, 'config.json'));

if (isInteractive && !alreadySetUp) {
  // Launch the Phase 1 setup wizard
  try {
    const pkg = JSON.parse(readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
    const version = pkg.version || '0.0.0';

    let wizard;
    try {
      wizard = await import('../dist/server/server/wizard/index.js');
    } catch {
      try {
        wizard = await import('../server/wizard/index.js');
      } catch {
        // Wizard module not available — fall through to banner
        wizard = null;
      }
    }

    if (wizard) {
      await wizard.runSetupWizard(version);
    } else {
      printBanner();
    }
  } catch {
    printBanner();
  }
} else if (!alreadySetUp) {
  printBanner();
}

function printBanner() {
  console.log('');
  console.log('  Orbital Command installed.');
  console.log('  Run `orbital` in your project directory to get started.');
  console.log('');
}
