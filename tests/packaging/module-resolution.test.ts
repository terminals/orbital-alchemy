import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(import.meta.dirname, '../..');

// ---------------------------------------------------------------------------
// loadSharedModule / loadWizardModule import targets
// ---------------------------------------------------------------------------

describe('CLI module import targets exist in dist/', () => {
  // bin/lib/helpers.js line 92: import('../../dist/server/server/init.js')
  it('dist/server/server/init.js exists (loadSharedModule target)', () => {
    expect(fs.existsSync(path.join(ROOT, 'dist/server/server/init.js'))).toBe(true);
  });

  // bin/lib/helpers.js line 110: import('../../dist/server/server/wizard/index.js')
  it('dist/server/server/wizard/index.js exists (loadWizardModule target)', () => {
    expect(fs.existsSync(path.join(ROOT, 'dist/server/server/wizard/index.js'))).toBe(true);
  });

  // bin/commands/launch.js uses dist/server/server/launch.js
  it('dist/server/server/launch.js exists', () => {
    expect(fs.existsSync(path.join(ROOT, 'dist/server/server/launch.js'))).toBe(true);
  });

  // launch.js imports index.js
  it('dist/server/server/index.js exists', () => {
    expect(fs.existsSync(path.join(ROOT, 'dist/server/server/index.js'))).toBe(true);
  });

  // Production SPA check in bin/commands/launch.js
  it('dist/index.html exists (production SPA)', () => {
    expect(fs.existsSync(path.join(ROOT, 'dist/index.html'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// resolvePackageRoot — the fragile path-walking logic
// ---------------------------------------------------------------------------

describe('resolvePackageRoot from dist/', () => {
  // Simulates what server/init.ts does: walk up from __dirname until templates/ found.
  // In dist, __dirname = dist/server/server/ — needs 3 hops to reach root.
  function resolvePackageRoot(startDir: string): string {
    let dir = startDir;
    for (let i = 0; i < 5; i++) {
      if (fs.existsSync(path.join(dir, 'templates'))) return dir;
      dir = path.resolve(dir, '..');
    }
    return path.resolve(startDir, '..');
  }

  it('resolves to package root from dist/server/server/', () => {
    const distServerDir = path.join(ROOT, 'dist/server/server');
    const resolved = resolvePackageRoot(distServerDir);
    expect(resolved).toBe(ROOT);
  });

  it('finds templates/ directory from resolved root', () => {
    const distServerDir = path.join(ROOT, 'dist/server/server');
    const resolved = resolvePackageRoot(distServerDir);
    expect(fs.existsSync(path.join(resolved, 'templates'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// getOrbitalRoot — walks up looking for package.json
// ---------------------------------------------------------------------------

describe('getOrbitalRoot from dist/', () => {
  // Simulates server/utils/package-info.ts: walk up from __dirname until package.json found.
  function getOrbitalRoot(startDir: string): string {
    let dir = startDir;
    for (let i = 0; i < 6; i++) {
      if (fs.existsSync(path.join(dir, 'package.json'))) return dir;
      dir = path.dirname(dir);
    }
    return path.resolve(startDir, '../..');
  }

  it('resolves to package root from dist/server/server/utils/', () => {
    const utilsDir = path.join(ROOT, 'dist/server/server/utils');
    const resolved = getOrbitalRoot(utilsDir);
    expect(resolved).toBe(ROOT);
  });
});

// ---------------------------------------------------------------------------
// All three root-resolution mechanisms agree
// ---------------------------------------------------------------------------

describe('root resolution consistency', () => {
  it('PACKAGE_ROOT, resolvePackageRoot, and getOrbitalRoot all resolve to the same directory', () => {
    // PACKAGE_ROOT in bin/lib/helpers.js: path.resolve(__dirname, '..', '..')
    // __dirname for helpers.js = bin/lib/
    const packageRoot = path.resolve(ROOT, 'bin/lib', '..', '..');

    // resolvePackageRoot from dist/server/server/
    const distDir = path.join(ROOT, 'dist/server/server');
    let rpRoot = distDir;
    for (let i = 0; i < 5; i++) {
      if (fs.existsSync(path.join(rpRoot, 'templates'))) break;
      rpRoot = path.resolve(rpRoot, '..');
    }

    // getOrbitalRoot from dist/server/server/utils/
    const utilsDir = path.join(ROOT, 'dist/server/server/utils');
    let orRoot = utilsDir;
    for (let i = 0; i < 6; i++) {
      if (fs.existsSync(path.join(orRoot, 'package.json'))) break;
      orRoot = path.dirname(orRoot);
    }

    expect(packageRoot).toBe(ROOT);
    expect(rpRoot).toBe(ROOT);
    expect(orRoot).toBe(ROOT);
  });
});
