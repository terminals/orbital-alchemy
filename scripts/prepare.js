#!/usr/bin/env node

// Build script for `prepare` lifecycle — handles git-dep installs where
// node_modules may not be populated yet when `prepare` fires.

import { existsSync } from 'fs';
import { execSync } from 'child_process';

// Only build if this is the source repo (has src/main.tsx), not a consumer.
if (!existsSync('src/main.tsx')) {
  process.exit(0);
}

// In npm's git-dep context, prepare can fire before deps are installed.
// If that happens, install them first (--ignore-scripts avoids recursion).
if (!existsSync('node_modules/vite/bin/vite.js')) {
  console.log('Dependencies not found, installing...');
  execSync('npm install --ignore-scripts', { stdio: 'inherit' });
}

console.log('Building frontend...');
execSync('node node_modules/vite/bin/vite.js build', { stdio: 'inherit' });

console.log('Building server...');
execSync('node node_modules/typescript/bin/tsc -p tsconfig.server.json', { stdio: 'inherit' });
