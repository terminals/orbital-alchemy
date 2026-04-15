import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { validate, formatValidationReport } from '../validator.js';
import type { ValidationReport } from '../validator.js';

describe('validator', () => {
  let tmpDir: string;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orbital-validator-'));
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  /**
   * Set up a minimal project directory with manifest and files.
   */
  function setupProject(
    name: string,
    opts: {
      manifestFiles?: Record<string, { origin: string; status: string; templateHash?: string; installedHash: string }>;
      diskFiles?: Record<string, string>;
      config?: Record<string, unknown> | null; // null = no config, string = raw content
      configRaw?: string;
      workflow?: Record<string, unknown> | null;
      workflowRaw?: string;
      settings?: Record<string, unknown> | null;
      generatedArtifacts?: string[];
      packageVersion?: string;
      manifestVersion?: string;
      noManifest?: boolean;
    } = {},
  ): string {
    const projectRoot = path.join(tmpDir, name);
    const claudeDir = path.join(projectRoot, '.claude');
    fs.mkdirSync(claudeDir, { recursive: true });

    // Create manifest
    if (!opts.noManifest) {
      const manifest = {
        version: 2,
        installedAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
        packageVersion: opts.manifestVersion || '1.0.0',
        preset: 'default',
        files: opts.manifestFiles || {},
        settingsHooksChecksum: '',
        appliedMigrations: [],
        generatedArtifacts: opts.generatedArtifacts || ['INDEX.md', 'config/workflow-manifest.sh'],
        gitignoreEntries: [],
      };
      fs.writeFileSync(
        path.join(claudeDir, 'orbital-manifest.json'),
        JSON.stringify(manifest, null, 2),
        'utf8',
      );
    }

    // Create files on disk
    if (opts.diskFiles) {
      for (const [relPath, content] of Object.entries(opts.diskFiles)) {
        const absPath = path.join(claudeDir, relPath);
        fs.mkdirSync(path.dirname(absPath), { recursive: true });
        fs.writeFileSync(absPath, content, 'utf8');
      }
    }

    // Create config
    if (opts.config !== undefined) {
      if (opts.config !== null) {
        fs.writeFileSync(
          path.join(claudeDir, 'orbital.config.json'),
          JSON.stringify(opts.config, null, 2),
          'utf8',
        );
      }
    } else if (opts.configRaw !== undefined) {
      fs.writeFileSync(
        path.join(claudeDir, 'orbital.config.json'),
        opts.configRaw,
        'utf8',
      );
    }

    // Create workflow
    if (opts.workflow !== undefined && opts.workflow !== null) {
      const configDir = path.join(claudeDir, 'config');
      fs.mkdirSync(configDir, { recursive: true });
      fs.writeFileSync(
        path.join(configDir, 'workflow.json'),
        JSON.stringify(opts.workflow, null, 2),
        'utf8',
      );
    } else if (opts.workflowRaw !== undefined) {
      const configDir = path.join(claudeDir, 'config');
      fs.mkdirSync(configDir, { recursive: true });
      fs.writeFileSync(
        path.join(configDir, 'workflow.json'),
        opts.workflowRaw,
        'utf8',
      );
    }

    // Create settings
    if (opts.settings !== undefined && opts.settings !== null) {
      fs.writeFileSync(
        path.join(claudeDir, 'settings.local.json'),
        JSON.stringify(opts.settings, null, 2),
        'utf8',
      );
    }

    return projectRoot;
  }

  // ─── No manifest ──────────────────────────────────────────

  describe('manifest existence', () => {
    it('warns when no manifest exists', () => {
      const projectRoot = setupProject('no-manifest', { noManifest: true });
      const report = validate(projectRoot, '1.0.0');

      expect(report.warnings).toBeGreaterThanOrEqual(1);
      expect(report.results.some(r =>
        r.severity === 'warning' && r.message.includes('No orbital-manifest.json'),
      )).toBe(true);
    });
  });

  // ─── File existence ───────────────────────────────────────

  describe('manifest file existence', () => {
    it('reports error when manifest references a missing file', () => {
      const projectRoot = setupProject('missing-file', {
        manifestFiles: {
          'hooks/gone.sh': {
            origin: 'template',
            status: 'synced',
            templateHash: 'abc',
            installedHash: 'abc',
          },
        },
      });
      const report = validate(projectRoot, '1.0.0');

      expect(report.errors).toBeGreaterThanOrEqual(1);
      expect(report.results.some(r =>
        r.severity === 'error' && r.message.includes('missing file') && r.file === 'hooks/gone.sh',
      )).toBe(true);
    });

    it('passes when all manifest files exist on disk', () => {
      const projectRoot = setupProject('files-exist', {
        manifestFiles: {
          'hooks/present.sh': {
            origin: 'template',
            status: 'synced',
            templateHash: 'abc',
            installedHash: 'abc',
          },
        },
        diskFiles: {
          'hooks/present.sh': '#!/bin/bash\necho hi',
        },
        config: { serverPort: 4444 },
      });
      const report = validate(projectRoot, '1.0.0');

      // No errors about missing files
      const missingFileErrors = report.results.filter(r =>
        r.severity === 'error' && r.message.includes('missing file'),
      );
      expect(missingFileErrors).toHaveLength(0);
    });
  });

  // ─── Untracked files ─────────────────────────────────────

  describe('untracked files', () => {
    it('warns about untracked files in managed directories', () => {
      const projectRoot = setupProject('untracked', {
        manifestFiles: {},
        diskFiles: {
          'hooks/unknown.sh': '#!/bin/bash\necho mystery',
        },
      });
      const report = validate(projectRoot, '1.0.0');

      expect(report.warnings).toBeGreaterThanOrEqual(1);
      expect(report.results.some(r =>
        r.severity === 'warning' && r.message.includes('Untracked file') && r.file === 'hooks/unknown.sh',
      )).toBe(true);
    });
  });

  // ─── Config checks ───────────────────────────────────────

  describe('config checks', () => {
    it('reports error for malformed orbital.config.json', () => {
      const projectRoot = setupProject('bad-config', {
        configRaw: '{not valid json!!!',
      });
      const report = validate(projectRoot, '1.0.0');

      expect(report.errors).toBeGreaterThanOrEqual(1);
      expect(report.results.some(r =>
        r.severity === 'error' && r.message.includes('malformed JSON'),
      )).toBe(true);
    });

    it('warns when config file is missing', () => {
      const projectRoot = setupProject('no-config', {
        config: null,
      });
      const report = validate(projectRoot, '1.0.0');

      expect(report.results.some(r =>
        r.severity === 'warning' && r.message.includes('orbital.config.json not found'),
      )).toBe(true);
    });

    it('passes for valid JSON config', () => {
      const projectRoot = setupProject('good-config', {
        config: { serverPort: 4444, clientPort: 4445 },
      });
      const report = validate(projectRoot, '1.0.0');

      const configErrors = report.results.filter(r =>
        r.message.includes('orbital.config.json') && r.severity === 'error',
      );
      expect(configErrors).toHaveLength(0);
    });
  });

  // ─── Workflow validation ──────────────────────────────────

  describe('workflow validation', () => {
    it('reports error for malformed workflow.json', () => {
      const projectRoot = setupProject('bad-workflow', {
        config: { serverPort: 4444 },
        workflowRaw: 'not json!!!',
      });
      const report = validate(projectRoot, '1.0.0');

      expect(report.results.some(r =>
        r.severity === 'error' && r.message.includes('workflow.json is malformed'),
      )).toBe(true);
    });

    it('reports error when workflow hook references missing script', () => {
      const projectRoot = setupProject('bad-hook-target', {
        config: { serverPort: 4444 },
        workflow: {
          hooks: [
            { id: 'my-hook', target: '.claude/hooks/nonexistent.sh' },
          ],
          edges: [],
        },
      });
      const report = validate(projectRoot, '1.0.0');

      expect(report.results.some(r =>
        r.severity === 'error' && r.message.includes('Workflow hook references missing script'),
      )).toBe(true);
    });

    it('warns when workflow edge references unknown skill', () => {
      const projectRoot = setupProject('unknown-skill', {
        config: { serverPort: 4444 },
        workflow: {
          hooks: [],
          edges: [
            { from: 'backlog', to: 'implementing', command: '/nonexistent-skill {id}' },
          ],
        },
      });
      const report = validate(projectRoot, '1.0.0');

      expect(report.results.some(r =>
        r.severity === 'warning' && r.message.includes('unknown skill'),
      )).toBe(true);
    });

    it('passes when workflow edge skill exists', () => {
      const projectRoot = setupProject('valid-skill', {
        config: { serverPort: 4444 },
        diskFiles: {
          'skills/my-skill/SKILL.md': '# My Skill',
        },
        workflow: {
          hooks: [],
          edges: [
            { from: 'backlog', to: 'implementing', command: '/my-skill {id}' },
          ],
        },
      });
      const report = validate(projectRoot, '1.0.0');

      const skillWarnings = report.results.filter(r =>
        r.message.includes('unknown skill'),
      );
      expect(skillWarnings).toHaveLength(0);
    });
  });

  // ─── Version consistency ──────────────────────────────────

  describe('version consistency', () => {
    it('warns when manifest version does not match package version', () => {
      const projectRoot = setupProject('version-mismatch', {
        manifestVersion: '0.9.0',
        config: { serverPort: 4444 },
      });
      const report = validate(projectRoot, '1.0.0');

      expect(report.results.some(r =>
        r.severity === 'warning' && r.message.includes('version mismatch'),
      )).toBe(true);
    });
  });

  // ─── Generated artifacts ──────────────────────────────────

  describe('generated artifacts', () => {
    it('warns when generated artifact is missing', () => {
      const projectRoot = setupProject('missing-artifact', {
        generatedArtifacts: ['INDEX.md', 'config/workflow-manifest.sh'],
        config: { serverPort: 4444 },
      });
      // Neither INDEX.md nor config/workflow-manifest.sh exist on disk
      const report = validate(projectRoot, '1.0.0');

      expect(report.results.some(r =>
        r.severity === 'warning' && r.message.includes('Generated artifact missing'),
      )).toBe(true);
    });
  });

  // ─── Valid project ────────────────────────────────────────

  describe('valid project (all checks pass)', () => {
    it('has zero errors for a properly configured project', () => {
      const projectRoot = setupProject('valid-project', {
        manifestFiles: {
          'hooks/init.sh': {
            origin: 'template',
            status: 'synced',
            templateHash: 'abc',
            installedHash: 'abc',
          },
        },
        diskFiles: {
          'hooks/init.sh': '#!/bin/bash\necho init',
          'INDEX.md': '# Index',
          'config/workflow-manifest.sh': '#!/bin/bash\necho manifest',
        },
        config: { serverPort: 4444 },
        generatedArtifacts: ['INDEX.md', 'config/workflow-manifest.sh'],
        manifestVersion: '1.0.0',
      });
      const report = validate(projectRoot, '1.0.0');

      expect(report.errors).toBe(0);
    });
  });

  // ─── formatValidationReport ───────────────────────────────

  describe('formatValidationReport()', () => {
    it('shows "All checks passed" when no results', () => {
      const report: ValidationReport = {
        results: [],
        errors: 0,
        warnings: 0,
        info: 0,
      };
      const output = formatValidationReport(report);

      expect(output).toContain('All checks passed');
    });

    it('groups results by severity', () => {
      const report: ValidationReport = {
        results: [
          { severity: 'error', message: 'Missing file', file: 'hooks/gone.sh' },
          { severity: 'warning', message: 'Untracked file', file: 'hooks/extra.sh' },
          { severity: 'info', message: 'All good' },
        ],
        errors: 1,
        warnings: 1,
        info: 1,
      };
      const output = formatValidationReport(report);

      expect(output).toContain('ERRORS');
      expect(output).toContain('Missing file');
      expect(output).toContain('WARNINGS');
      expect(output).toContain('Untracked file');
      expect(output).toContain('INFO');
      expect(output).toContain('All good');
      expect(output).toContain('1 errors, 1 warnings, 1 info');
    });

    it('includes file and detail annotations', () => {
      const report: ValidationReport = {
        results: [
          {
            severity: 'error',
            message: 'Hook broken',
            file: 'hooks/bad.sh',
            detail: 'Origin: template',
          },
        ],
        errors: 1,
        warnings: 0,
        info: 0,
      };
      const output = formatValidationReport(report);

      expect(output).toContain('[hooks/bad.sh]');
      expect(output).toContain('Origin: template');
    });

    it('includes summary line with counts', () => {
      const report: ValidationReport = {
        results: [
          { severity: 'error', message: 'e1' },
          { severity: 'error', message: 'e2' },
          { severity: 'warning', message: 'w1' },
        ],
        errors: 2,
        warnings: 1,
        info: 0,
      };
      const output = formatValidationReport(report);

      expect(output).toContain('2 errors, 1 warnings, 0 info');
    });
  });
});
