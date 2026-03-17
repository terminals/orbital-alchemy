#!/usr/bin/env node

// Build script for `prepare` lifecycle — runs during git-dep installs
// (npm install github:...) to produce dist/ artifacts.
//
// In npm's git-dep context, `prepare` fires BEFORE node_modules is
// populated. We must install deps ourselves — but the parent npm leaks
// its config (global, prefix, force) via npm_config_* env vars, which
// causes the nested install to target the global node_modules and fail
// with EISDIR. Stripping those vars forces a clean local install.

import { existsSync } from 'fs';
import { execSync } from 'child_process';

// Only build if this is the source repo (has src/main.tsx), not a consumer.
if (!existsSync('src/main.tsx')) {
  process.exit(0);
}

// Install deps if not present (git-dep context).
if (!existsSync('node_modules/vite/bin/vite.js')) {
  console.log('Dependencies not found, installing...');
  const cleanEnv = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith('npm_config_'))
  );
  execSync('npm install --ignore-scripts', { stdio: 'inherit', env: cleanEnv });
}

console.log('Building frontend...');
execSync('node node_modules/vite/bin/vite.js build', { stdio: 'inherit' });

console.log('Building server...');
execSync('node node_modules/typescript/bin/tsc -p tsconfig.server.json', { stdio: 'inherit' });
