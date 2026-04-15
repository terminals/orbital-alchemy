import { describe, it, expect, beforeAll } from 'vitest';
import { execFileSync } from 'child_process';
import path from 'path';
import fs from 'fs';

const ROOT = path.resolve(import.meta.dirname, '../..');

interface PackFile {
  path: string;
  size: number;
  mode: number;
}

interface PackResult {
  id: string;
  name: string;
  version: string;
  size: number;
  unpackedSize: number;
  filename: string;
  files: PackFile[];
}

let packResult: PackResult;
let filePaths: string[];

beforeAll(() => {
  const raw = execFileSync('npm', ['pack', '--dry-run', '--json'], {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const parsed = JSON.parse(raw);
  packResult = Array.isArray(parsed) ? parsed[0] : parsed;
  filePaths = packResult.files.map((f) => f.path);
});

function hasFile(filePath: string): boolean {
  return filePaths.includes(filePath);
}

function hasFilesMatching(pattern: RegExp): string[] {
  return filePaths.filter((f) => pattern.test(f));
}

// ---------------------------------------------------------------------------
// Critical runtime files
// ---------------------------------------------------------------------------

describe('critical CLI files', () => {
  it('includes the CLI entry point', () => {
    expect(hasFile('bin/orbital.js')).toBe(true);
  });

  it('includes CLI helpers', () => {
    expect(hasFile('bin/lib/helpers.js')).toBe(true);
  });

  it('includes all command modules', () => {
    const commands = ['config', 'events', 'launch', 'manifest', 'registry', 'update'];
    for (const cmd of commands) {
      expect(hasFile(`bin/commands/${cmd}.js`)).toBe(true);
    }
  });

  it('includes the postinstall script', () => {
    expect(hasFile('scripts/postinstall.js')).toBe(true);
  });

  it('includes the JSON schema', () => {
    expect(hasFile('schemas/orbital.config.schema.json')).toBe(true);
  });
});

describe('compiled server output', () => {
  it('includes dist/server/server/init.js (loadSharedModule target)', () => {
    expect(hasFile('dist/server/server/init.js')).toBe(true);
  });

  it('includes dist/server/server/wizard/index.js (loadWizardModule target)', () => {
    expect(hasFile('dist/server/server/wizard/index.js')).toBe(true);
  });

  it('includes dist/server/server/launch.js', () => {
    expect(hasFile('dist/server/server/launch.js')).toBe(true);
  });

  it('includes dist/server/server/index.js', () => {
    expect(hasFile('dist/server/server/index.js')).toBe(true);
  });
});

describe('frontend build output', () => {
  it('includes dist/index.html (SPA entry)', () => {
    expect(hasFile('dist/index.html')).toBe(true);
  });

  it('includes frontend asset bundles', () => {
    const assets = hasFilesMatching(/^dist\/assets\//);
    expect(assets.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

describe('template completeness', () => {
  it('includes at least 60 template files', () => {
    const templates = hasFilesMatching(/^templates\//);
    expect(templates.length).toBeGreaterThanOrEqual(60);
  });

  it('includes hook templates', () => {
    const hooks = hasFilesMatching(/^templates\/hooks\//);
    expect(hooks.length).toBeGreaterThan(0);
  });

  it('includes skill templates', () => {
    const skills = hasFilesMatching(/^templates\/skills\//);
    expect(skills.length).toBeGreaterThan(0);
  });

  it('includes agent templates', () => {
    const agents = hasFilesMatching(/^templates\/agents\//);
    expect(agents.length).toBeGreaterThan(0);
  });

  it('includes workflow presets', () => {
    const presets = hasFilesMatching(/^templates\/presets\//);
    expect(presets.length).toBeGreaterThan(0);
  });

  it('includes critical template files', () => {
    expect(hasFile('templates/orbital.config.json')).toBe(true);
    expect(hasFile('templates/settings-hooks.json')).toBe(true);
    expect(hasFile('templates/presets/default.json')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Directory coverage — every files entry has content
// ---------------------------------------------------------------------------

describe('files field coverage', () => {
  const dirs = ['bin/', 'dist/', 'server/', 'shared/', 'templates/', 'schemas/', 'scripts/'];

  for (const dir of dirs) {
    it(`${dir} has at least one file in tarball`, () => {
      const matches = filePaths.filter((f) => f.startsWith(dir));
      expect(matches.length).toBeGreaterThan(0);
    });
  }
});

// ---------------------------------------------------------------------------
// Unwanted files excluded
// ---------------------------------------------------------------------------

describe('unwanted files excluded', () => {
  it('no .test.ts files in tarball', () => {
    const tests = hasFilesMatching(/\.test\.ts$/);
    expect(tests).toEqual([]);
  });

  it('no .test.js files in tarball', () => {
    const tests = hasFilesMatching(/\.test\.js$/);
    expect(tests).toEqual([]);
  });

  it('no __tests__ directories', () => {
    const tests = hasFilesMatching(/__tests__\//);
    expect(tests).toEqual([]);
  });

  it('no __fixtures__ directories', () => {
    const fixtures = hasFilesMatching(/__fixtures__\//);
    expect(fixtures).toEqual([]);
  });

  it('no .env files', () => {
    const envFiles = hasFilesMatching(/\.env$/);
    expect(envFiles).toEqual([]);
  });

  it('no .DS_Store files', () => {
    const ds = hasFilesMatching(/\.DS_Store$/);
    expect(ds).toEqual([]);
  });

  it('no node_modules', () => {
    const nm = hasFilesMatching(/node_modules\//);
    expect(nm).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Package metadata
// ---------------------------------------------------------------------------

describe('package.json metadata', () => {
  let pkg: Record<string, unknown>;

  beforeAll(() => {
    pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  });

  it('bin.orbital points to bin/orbital.js', () => {
    expect((pkg.bin as Record<string, string>).orbital).toBe('bin/orbital.js');
  });

  it('type is "module"', () => {
    expect(pkg.type).toBe('module');
  });

  it('postinstall script is defined', () => {
    expect((pkg.scripts as Record<string, string>).postinstall).toBeDefined();
  });
});

describe('CLI entry shebang', () => {
  it('bin/orbital.js starts with #!/usr/bin/env node', () => {
    const content = fs.readFileSync(path.join(ROOT, 'bin/orbital.js'), 'utf8');
    expect(content.startsWith('#!/usr/bin/env node')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Tarball size sanity
// ---------------------------------------------------------------------------

describe('tarball size', () => {
  it('packed size is between 500KB and 10MB', () => {
    const sizeBytes = packResult.size;
    expect(sizeBytes).toBeGreaterThan(500 * 1024);
    expect(sizeBytes).toBeLessThan(10 * 1024 * 1024);
  });
});
