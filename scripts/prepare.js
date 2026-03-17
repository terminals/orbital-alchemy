#!/usr/bin/env node

// Build script for `prepare` lifecycle — runs during git-dep installs
// (npm install github:...) to produce dist/ artifacts.
//
// npm installs dependencies BEFORE running `prepare`, so we just build.
// Do NOT run nested `npm install` here — it inherits the parent npm's
// global-install context and causes EISDIR conflicts.

import { existsSync } from 'fs';
import { execSync } from 'child_process';

// Only build if this is the source repo (has src/main.tsx), not a consumer.
if (!existsSync('src/main.tsx')) {
  process.exit(0);
}

console.log('Building frontend...');
execSync('node node_modules/vite/bin/vite.js build', { stdio: 'inherit' });

console.log('Building server...');
execSync('node node_modules/typescript/bin/tsc -p tsconfig.server.json', { stdio: 'inherit' });
