import { describe, it, expect, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  TEMPLATES_DIR,
  ensureDir,
  cleanEmptyDirs,
  chmodScripts,
  listTemplateFiles,
  writeManifest,
  getPackageVersion,
  runInit,
  loadManifest,
} from '../init.js';

// ─── Shared temp dir setup ──────────────────────────────────

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'orbital-init-test-'));

afterAll(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

function makeTmpDir(name: string): string {
  const dir = path.join(tmpRoot, name);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// ─── TEMPLATES_DIR ──────────────────────────────────────────

describe('TEMPLATES_DIR', () => {
  it('points to an existing directory', () => {
    expect(fs.existsSync(TEMPLATES_DIR)).toBe(true);
  });

  it('contains hooks subdirectory', () => {
    expect(fs.existsSync(path.join(TEMPLATES_DIR, 'hooks'))).toBe(true);
  });
});

// ─── ensureDir() ────────────────────────────────────────────

describe('ensureDir()', () => {
  it('creates a new directory and returns true', () => {
    const dir = path.join(tmpRoot, 'ensureDir-new', 'sub');
    const result = ensureDir(dir);
    expect(result).toBe(true);
    expect(fs.existsSync(dir)).toBe(true);
  });

  it('returns false for existing directory', () => {
    const dir = makeTmpDir('ensureDir-exists');
    const result = ensureDir(dir);
    expect(result).toBe(false);
  });
});

// ─── cleanEmptyDirs() ───────────────────────────────────────

describe('cleanEmptyDirs()', () => {
  it('removes empty directories recursively', () => {
    const dir = makeTmpDir('cleanEmpty');
    const nested = path.join(dir, 'a', 'b', 'c');
    fs.mkdirSync(nested, { recursive: true });

    cleanEmptyDirs(dir);
    // The entire chain should be removed since all are empty
    expect(fs.existsSync(path.join(dir, 'a'))).toBe(false);
  });

  it('preserves directories with files', () => {
    const dir = makeTmpDir('cleanEmpty-withfiles');
    const sub = path.join(dir, 'sub');
    const empty = path.join(dir, 'empty');
    fs.mkdirSync(sub, { recursive: true });
    fs.mkdirSync(empty, { recursive: true });
    fs.writeFileSync(path.join(sub, 'keep.txt'), 'keep', 'utf-8');

    cleanEmptyDirs(dir);
    expect(fs.existsSync(sub)).toBe(true);
    expect(fs.existsSync(empty)).toBe(false);
  });

  it('handles non-existent directory gracefully', () => {
    expect(() => cleanEmptyDirs('/nonexistent/path/xyz')).not.toThrow();
  });
});

// ─── chmodScripts() ─────────────────────────────────────────

describe('chmodScripts()', () => {
  it('sets .sh files to 0o755', () => {
    const dir = makeTmpDir('chmod');
    fs.writeFileSync(path.join(dir, 'test.sh'), '#!/bin/bash', 'utf-8');
    fs.writeFileSync(path.join(dir, 'readme.md'), '# Readme', 'utf-8');

    chmodScripts(dir);
    const shStat = fs.statSync(path.join(dir, 'test.sh'));
    expect(shStat.mode & 0o777).toBe(0o755);
  });

  it('recurses into subdirectories', () => {
    const dir = makeTmpDir('chmod-recursive');
    const sub = path.join(dir, 'sub');
    fs.mkdirSync(sub, { recursive: true });
    fs.writeFileSync(path.join(sub, 'nested.sh'), '#!/bin/bash', 'utf-8');

    chmodScripts(dir);
    const stat = fs.statSync(path.join(sub, 'nested.sh'));
    expect(stat.mode & 0o777).toBe(0o755);
  });

  it('handles non-existent directory gracefully', () => {
    expect(() => chmodScripts('/nonexistent/path/xyz')).not.toThrow();
  });
});

// ─── listTemplateFiles() ────────────────────────────────────

describe('listTemplateFiles()', () => {
  it('lists template files mapped to target directory', () => {
    const tplDir = makeTmpDir('listTpl-src');
    const tgtDir = path.join(tmpRoot, 'listTpl-tgt');
    fs.writeFileSync(path.join(tplDir, 'a.sh'), 'a', 'utf-8');
    fs.writeFileSync(path.join(tplDir, 'b.sh'), 'b', 'utf-8');

    const files = listTemplateFiles(tplDir, tgtDir);
    expect(files).toHaveLength(2);
    expect(files).toContain(path.join(tgtDir, 'a.sh'));
    expect(files).toContain(path.join(tgtDir, 'b.sh'));
  });

  it('returns empty array for non-existent source', () => {
    expect(listTemplateFiles('/nonexistent', '/target')).toEqual([]);
  });

  it('handles nested directories', () => {
    const tplDir = makeTmpDir('listTpl-nested');
    const tgtDir = path.join(tmpRoot, 'listTpl-nested-tgt');
    fs.mkdirSync(path.join(tplDir, 'sub'), { recursive: true });
    fs.writeFileSync(path.join(tplDir, 'sub', 'c.sh'), 'c', 'utf-8');

    const files = listTemplateFiles(tplDir, tgtDir);
    expect(files).toHaveLength(1);
    expect(files[0]).toBe(path.join(tgtDir, 'sub', 'c.sh'));
  });
});

// ─── writeManifest() ────────────────────────────────────────

describe('writeManifest()', () => {
  it('returns false when no workflow.json exists', () => {
    const dir = makeTmpDir('writeManifest-noworkflow');
    fs.mkdirSync(path.join(dir, 'config'), { recursive: true });
    expect(writeManifest(dir)).toBe(false);
  });

  it('generates workflow-manifest.sh from workflow.json', () => {
    const dir = makeTmpDir('writeManifest-generate');
    fs.mkdirSync(path.join(dir, 'config'), { recursive: true });

    const workflow = {
      name: 'test',
      version: 1,
      lists: [
        { id: 'backlog', order: 0, hasDirectory: true, isEntryPoint: true },
        { id: 'dev', order: 1, hasDirectory: true },
      ],
      edges: [{ from: 'backlog', to: 'dev', direction: 'forward' }],
      terminalStatuses: [],
    };
    fs.writeFileSync(path.join(dir, 'config', 'workflow.json'), JSON.stringify(workflow), 'utf-8');

    const result = writeManifest(dir);
    expect(result).toBe(true);

    const manifestPath = path.join(dir, 'config', 'workflow-manifest.sh');
    expect(fs.existsSync(manifestPath)).toBe(true);
    const content = fs.readFileSync(manifestPath, 'utf-8');
    expect(content).toContain('WORKFLOW_STATUSES');
    expect(content).toContain('backlog');
    expect(content).toContain('dev');
  });
});

// ─── getPackageVersion() ────────────────────────────────────

describe('getPackageVersion()', () => {
  it('returns a valid semver-ish string', () => {
    const version = getPackageVersion();
    expect(version).toMatch(/^\d+\.\d+\.\d+/);
  });
});

// ─── runInit() ──────────────────────────────────────────────

describe('runInit()', () => {
  it('creates .claude/ directory structure in a temp project', () => {
    const projectRoot = makeTmpDir('runInit-basic');

    // Run init in quiet mode so console output is suppressed
    runInit(projectRoot, { quiet: true });

    // Verify key directories and files were created
    expect(fs.existsSync(path.join(projectRoot, '.claude'))).toBe(true);
    expect(fs.existsSync(path.join(projectRoot, '.claude', 'orbital-events'))).toBe(true);
    expect(fs.existsSync(path.join(projectRoot, '.claude', 'config'))).toBe(true);
    expect(fs.existsSync(path.join(projectRoot, '.claude', 'hooks'))).toBe(true);
    expect(fs.existsSync(path.join(projectRoot, '.claude', 'skills'))).toBe(true);
    expect(fs.existsSync(path.join(projectRoot, '.claude', 'agents'))).toBe(true);
  });

  it('creates orbital.config.json', () => {
    const projectRoot = makeTmpDir('runInit-config');
    runInit(projectRoot, { quiet: true });

    const configPath = path.join(projectRoot, '.claude', 'orbital.config.json');
    expect(fs.existsSync(configPath)).toBe(true);

    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    expect(config).toHaveProperty('serverPort');
    expect(config).toHaveProperty('clientPort');
  });

  it('creates a manifest after init', () => {
    const projectRoot = makeTmpDir('runInit-manifest');
    runInit(projectRoot, { quiet: true });

    const manifest = loadManifest(projectRoot);
    expect(manifest).not.toBeNull();
    expect(manifest!.version).toBe(2);
    expect(Object.keys(manifest!.files).length).toBeGreaterThan(0);
  });

  it('does not overwrite existing files without --force', () => {
    const projectRoot = makeTmpDir('runInit-noforce');

    // Create a custom config first
    fs.mkdirSync(path.join(projectRoot, '.claude'), { recursive: true });
    fs.writeFileSync(
      path.join(projectRoot, '.claude', 'orbital.config.json'),
      JSON.stringify({ serverPort: 9999, clientPort: 9998 }),
      'utf-8',
    );

    runInit(projectRoot, { quiet: true });

    // Verify custom config was not overwritten
    const config = JSON.parse(
      fs.readFileSync(path.join(projectRoot, '.claude', 'orbital.config.json'), 'utf-8'),
    );
    expect(config.serverPort).toBe(9999);
  });

  it('creates scopes directory', () => {
    const projectRoot = makeTmpDir('runInit-scopes');
    runInit(projectRoot, { quiet: true });

    expect(fs.existsSync(path.join(projectRoot, 'scopes'))).toBe(true);
  });

  it('copies workflow.json and generates workflow-manifest.sh', () => {
    const projectRoot = makeTmpDir('runInit-workflow');
    runInit(projectRoot, { quiet: true });

    expect(fs.existsSync(path.join(projectRoot, '.claude', 'config', 'workflow.json'))).toBe(true);
    expect(fs.existsSync(path.join(projectRoot, '.claude', 'config', 'workflow-manifest.sh'))).toBe(true);
  });

  it('creates settings.local.json with hook registrations', () => {
    const projectRoot = makeTmpDir('runInit-settings');
    runInit(projectRoot, { quiet: true });

    const settingsPath = path.join(projectRoot, '.claude', 'settings.local.json');
    expect(fs.existsSync(settingsPath)).toBe(true);

    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    expect(settings).toHaveProperty('hooks');
  });

  it('accepts custom project name', () => {
    const projectRoot = makeTmpDir('runInit-projectname');
    runInit(projectRoot, { quiet: true, projectName: 'My Custom Project' });

    const config = JSON.parse(
      fs.readFileSync(path.join(projectRoot, '.claude', 'orbital.config.json'), 'utf-8'),
    );
    expect(config.projectName).toBe('My Custom Project');
  });

  it('creates INDEX.md', () => {
    const projectRoot = makeTmpDir('runInit-index');
    runInit(projectRoot, { quiet: true });

    const indexPath = path.join(projectRoot, '.claude', 'INDEX.md');
    expect(fs.existsSync(indexPath)).toBe(true);
    const content = fs.readFileSync(indexPath, 'utf-8');
    expect(content).toContain('Agent Index');
  });
});
