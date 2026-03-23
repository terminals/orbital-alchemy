#!/usr/bin/env node

// Safety net for esbuild's platform-specific binary.
//
// esbuild (a transitive dependency of Vite) ships as a stub that downloads
// its native binary via postinstall. If that step was skipped or failed
// silently, this script re-triggers the download.

import { existsSync } from 'fs';
import { execFileSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(__dirname, '..');
const esbuildInstall = path.join(packageRoot, 'node_modules', 'esbuild', 'install.js');

if (existsSync(esbuildInstall)) {
  try {
    execFileSync('node', [esbuildInstall], { stdio: 'pipe' });
  } catch {
    // Already installed or not applicable
  }
}
