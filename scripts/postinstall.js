#!/usr/bin/env node

// Safety net for esbuild's platform-specific binary.
//
// esbuild ships as a stub that downloads its binary via postinstall.
// If esbuild's own postinstall was skipped or incomplete, this script
// re-triggers the download. This helps when:
//   - The package was installed with --ignore-scripts and later rebuilt
//   - esbuild's postinstall silently failed
//
// NOTE: This does NOT fix the npm 11 (Node 25+) global install failure
// where npm tries to chmod esbuild's bin symlink before the binary exists.
// That is a hard error during npm's own install phase — this script never
// runs because npm aborts first. Workarounds for that issue:
//   - npm install -g orbital-command --foreground-scripts
//   - Or: git clone + npm install + npm install -g .

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
