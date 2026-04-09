/**
 * Validation module for the Orbital Command primitive system.
 *
 * Checks cross-references between manifest, settings.local.json,
 * workflow.json, and files on disk. Ensures internal consistency.
 */

import fs from 'fs';
import path from 'path';
import { loadManifest } from './manifest.js';
import { validateHookPaths } from './settings-sync.js';
import type { ValidationResult, ValidationSeverity } from './manifest-types.js';

// ─── Public API ─────────────────────────────────────────────

export interface ValidationReport {
  results: ValidationResult[];
  errors: number;
  warnings: number;
  info: number;
}

/**
 * Run all validation checks on a project. Returns a structured report.
 */
export function validate(
  projectRoot: string,
  packageVersion: string,
): ValidationReport {
  const results: ValidationResult[] = [];
  const claudeDir = path.join(projectRoot, '.claude');

  // 1. Check manifest exists
  const manifest = loadManifest(projectRoot);
  if (!manifest) {
    results.push({
      severity: 'warning',
      message: 'No orbital-manifest.json found — run `orbital update` to create one',
    });
    // Can't do further manifest checks without a manifest
    return buildReport(results);
  }

  // 2. Manifest file existence — every template file should exist on disk
  for (const [relPath, record] of Object.entries(manifest.files)) {
    const absPath = path.join(claudeDir, relPath);
    if (!fs.existsSync(absPath)) {
      results.push({
        severity: 'error',
        message: 'Manifest references missing file',
        file: relPath,
        detail: `Origin: ${record.origin}, Status: ${record.status}`,
      });
    }
  }

  // 3. Untracked files — files on disk not in manifest
  for (const dir of ['hooks', 'skills', 'agents']) {
    const dirPath = path.join(claudeDir, dir);
    if (!fs.existsSync(dirPath)) continue;

    walkDir(dirPath, dir, (relPath) => {
      if (!manifest.files[relPath]) {
        results.push({
          severity: 'warning',
          message: 'Untracked file in managed directory',
          file: relPath,
          detail: 'Not in manifest — may be orphaned or user-created',
        });
      }
    });
  }

  // 4. Settings hook file existence
  const settingsPath = path.join(claudeDir, 'settings.local.json');
  const brokenHooks = validateHookPaths(settingsPath, projectRoot);
  for (const command of brokenHooks) {
    results.push({
      severity: 'error',
      message: 'Settings hook references missing file',
      detail: command,
    });
  }

  // 5. Workflow integrity
  const workflowPath = path.join(claudeDir, 'config', 'workflow.json');
  if (fs.existsSync(workflowPath)) {
    validateWorkflow(workflowPath, claudeDir, results);
  }

  // 6. Config schema check (basic — just verify it parses)
  const configPath = path.join(claudeDir, 'orbital.config.json');
  if (fs.existsSync(configPath)) {
    try {
      JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    } catch {
      results.push({
        severity: 'error',
        message: 'orbital.config.json is malformed JSON',
        file: 'orbital.config.json',
      });
    }
  } else {
    results.push({
      severity: 'warning',
      message: 'orbital.config.json not found',
    });
  }

  // 7. Version consistency
  if (manifest.packageVersion !== packageVersion) {
    results.push({
      severity: 'warning',
      message: 'Manifest version mismatch — run `orbital update`',
      detail: `Manifest: ${manifest.packageVersion}, Package: ${packageVersion}`,
    });
  }

  // 8. Generated artifacts exist
  for (const artifact of manifest.generatedArtifacts) {
    const artifactPath = path.join(claudeDir, artifact);
    if (!fs.existsSync(artifactPath)) {
      results.push({
        severity: 'warning',
        message: 'Generated artifact missing',
        file: artifact,
        detail: 'Will be regenerated on next update',
      });
    }
  }

  return buildReport(results);
}

/**
 * Format a validation report for CLI output.
 */
export function formatValidationReport(report: ValidationReport): string {
  const lines: string[] = [];

  lines.push('Orbital Command — validation report\n');

  if (report.results.length === 0) {
    lines.push('  All checks passed.\n');
    return lines.join('\n');
  }

  // Group by severity
  const grouped: Record<ValidationSeverity, ValidationResult[]> = {
    error: [],
    warning: [],
    info: [],
  };
  for (const r of report.results) {
    grouped[r.severity].push(r);
  }

  for (const severity of ['error', 'warning', 'info'] as const) {
    const items = grouped[severity];
    if (items.length === 0) continue;

    const label = severity === 'error' ? 'ERRORS' : severity === 'warning' ? 'WARNINGS' : 'INFO';
    lines.push(`  ${label}:`);
    for (const item of items) {
      const file = item.file ? ` [${item.file}]` : '';
      const detail = item.detail ? ` — ${item.detail}` : '';
      lines.push(`    ${item.message}${file}${detail}`);
    }
    lines.push('');
  }

  lines.push(`  Summary: ${report.errors} errors, ${report.warnings} warnings, ${report.info} info`);
  return lines.join('\n');
}

// ─── Internal Helpers ───────────────────────────────────────

/** Recursively walk a directory, calling fn with relative paths. */
function walkDir(
  dirPath: string,
  prefix: string,
  fn: (relPath: string) => void,
): void {
  if (!fs.existsSync(dirPath)) return;

  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const absPath = path.join(dirPath, entry.name);
    const relPath = `${prefix}/${entry.name}`;

    // Follow symlinks: use stat() to check if target is a directory
    const stat = fs.statSync(absPath);
    if (stat.isDirectory()) {
      walkDir(absPath, relPath, fn);
    } else {
      fn(relPath);
    }
  }
}

/** Validate workflow.json hook targets and edge commands. */
function validateWorkflow(
  workflowPath: string,
  claudeDir: string,
  results: ValidationResult[],
): void {
  let workflow: Record<string, unknown>;
  try {
    workflow = JSON.parse(fs.readFileSync(workflowPath, 'utf-8'));
  } catch {
    results.push({
      severity: 'error',
      message: 'workflow.json is malformed JSON',
      file: 'config/workflow.json',
    });
    return;
  }

  // Check hook targets
  const hooks = workflow.hooks as Array<{ id?: string; target?: string }> | undefined;
  if (Array.isArray(hooks)) {
    for (const hook of hooks) {
      if (!hook.target) continue;

      // Resolve hook target relative to project root (targets use .claude/ prefix)
      const targetPath = path.resolve(path.dirname(claudeDir), hook.target);
      if (!fs.existsSync(targetPath)) {
        results.push({
          severity: 'error',
          message: 'Workflow hook references missing script',
          file: 'config/workflow.json',
          detail: `Hook "${hook.id || 'unknown'}": ${hook.target}`,
        });
      }
    }
  }

  // Check edge commands reference existing skills
  const edges = workflow.edges as Array<{ command?: string; from?: string; to?: string }> | undefined;
  if (Array.isArray(edges)) {
    for (const edge of edges) {
      if (!edge.command) continue;

      // Extract skill name from command like "/skill-name {id}"
      const match = edge.command.match(/^\/([a-z-]+)/);
      if (!match) continue;

      const skillName = match[1];
      const skillPath = path.join(claudeDir, 'skills', skillName, 'SKILL.md');
      if (!fs.existsSync(skillPath)) {
        results.push({
          severity: 'warning',
          message: 'Workflow edge references unknown skill',
          file: 'config/workflow.json',
          detail: `Edge "${edge.from}" → "${edge.to}": ${edge.command}`,
        });
      }
    }
  }
}

/** Build a report with counts from a list of results. */
function buildReport(results: ValidationResult[]): ValidationReport {
  return {
    results,
    errors: results.filter(r => r.severity === 'error').length,
    warnings: results.filter(r => r.severity === 'warning').length,
    info: results.filter(r => r.severity === 'info').length,
  };
}
