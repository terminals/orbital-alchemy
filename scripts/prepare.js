#!/usr/bin/env node

// Build script for `prepare` lifecycle — runs during git-dep installs
// (npm install github:...) to produce dist/ artifacts.
//
// This script only runs when a .git directory is present, meaning it's
// a git clone (git-dep install or manual clone), NOT an npm tarball.
//
// In npm's git-dep context, `prepare` fires BEFORE node_modules is
// populated. We must install deps ourselves — but the parent npm leaks
// its config (global, prefix, force) via npm_config_* env vars, which
// causes the nested install to target the global node_modules and fail
// with EISDIR. Stripping those vars forces a clean local install.

import { existsSync } from 'fs';
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

// Anchor all paths to the package root (parent of scripts/).
// This avoids relying on cwd, which can vary across npm versions.
const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Only build if this is a git repo (git-dep install or manual clone).
// npm tarballs never include .git/, so this skips registry installs
// where dist/ was already built by prepublishOnly.
if (!existsSync(path.join(packageRoot, '.git'))) {
  process.exit(0);
}

// Install deps if not present (git-dep context).
if (!existsSync(path.join(packageRoot, 'node_modules', 'vite', 'bin', 'vite.js'))) {
  console.log('Dependencies not found, installing...');
  const cleanEnv = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith('npm_config_'))
  );
  // Note: execSync with hardcoded commands is safe here — no user input is interpolated.
  execSync('npm install --ignore-scripts', { stdio: 'inherit', env: cleanEnv, cwd: packageRoot });

  // esbuild ships as a stub that downloads a platform-specific binary via
  // postinstall. Since we used --ignore-scripts above, run it explicitly.
  const esbuildInstall = path.join(packageRoot, 'node_modules', 'esbuild', 'install.js');
  if (existsSync(esbuildInstall)) {
    console.log('Installing esbuild platform binary...');
    execSync(`node ${esbuildInstall}`, { stdio: 'inherit', cwd: packageRoot });
  }
}

console.log('Building frontend...');
const viteBin = path.join(packageRoot, 'node_modules', 'vite', 'bin', 'vite.js');
execSync(`node ${viteBin} build --config ${path.join(packageRoot, 'vite.config.ts')}`, {
  stdio: 'inherit',
  cwd: packageRoot,
});

// Note: dist/server/ (tsc output) is NOT built here because the server
// always runs via tsx at runtime. The tsc compilation is only needed for
// type-checking (npm run typecheck) and is handled by prepublishOnly.
