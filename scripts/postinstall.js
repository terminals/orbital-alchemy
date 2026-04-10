#!/usr/bin/env node

/**
 * Postinstall script for orbital-command.
 *
 * 1. Ensures esbuild's platform-specific binary is present (safety net).
 * 2. If this is an interactive terminal and Orbital hasn't been set up yet,
 *    launches the Phase 1 setup wizard.
 * 3. Otherwise, prints a banner with next steps.
 */

import { existsSync } from 'fs';
import { execFileSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(__dirname, '..');

// ─── 1. Esbuild safety net ─────────────────────────────────────

const esbuildInstall = path.join(packageRoot, 'node_modules', 'esbuild', 'install.js');
if (existsSync(esbuildInstall)) {
  try {
    execFileSync('node', [esbuildInstall], { stdio: 'pipe' });
  } catch {
    // Already installed or not applicable
  }
}

// ─── 2. Post-install banner ─────────────────────────────────────

console.log('');
console.log('  Orbital Command installed.');
console.log('  Run \x1b[36morbital\x1b[0m in your project directory to get started.');
console.log('');
