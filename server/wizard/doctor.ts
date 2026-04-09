/**
 * Health diagnostics — `orbital doctor`
 */

import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import pc from 'picocolors';

export async function runDoctor(projectRoot: string, packageVersion: string): Promise<void> {
  console.log(`\n  ${pc.bold('Orbital Command')} ${pc.cyan(`v${packageVersion}`)}\n`);

  const checks: { label: string; status: string }[] = [];

  // 1. Check for latest version on npm
  try {
    const latest = execFileSync('npm', ['view', 'orbital-command', 'version'], {
      encoding: 'utf8',
      timeout: 5000,
    }).trim();

    if (latest && latest !== packageVersion) {
      checks.push({ label: 'Latest', status: pc.yellow(`v${latest} available (run \`npm update -g orbital-command\`)`) });
    } else {
      checks.push({ label: 'Latest', status: pc.green(`v${packageVersion} (up to date)`) });
    }
  } catch {
    checks.push({ label: 'Latest', status: pc.dim('could not check (npm unreachable)') });
  }

  // 2. Node version
  const nodeVersion = process.version;
  const major = parseInt(nodeVersion.slice(1), 10);
  if (major >= 18) {
    checks.push({ label: 'Node', status: pc.green(`${nodeVersion} (supported)`) });
  } else {
    checks.push({ label: 'Node', status: pc.red(`${nodeVersion} (requires Node 18+)`) });
  }

  // 3. Global registry
  const homedir = process.env.HOME || process.env.USERPROFILE || '~';
  const registryPath = path.join(homedir, '.orbital', 'config.json');
  if (fs.existsSync(registryPath)) {
    try {
      const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
      const count = (registry.projects || []).length;
      checks.push({ label: 'Global', status: pc.green(`~/.orbital/ exists (${count} project${count !== 1 ? 's' : ''} registered)`) });
    } catch {
      checks.push({ label: 'Global', status: pc.yellow('~/.orbital/ exists (registry unreadable)') });
    }
  } else {
    checks.push({ label: 'Global', status: pc.dim('~/.orbital/ not found (run `orbital init` to create)') });
  }

  // 4. Project initialization
  const configPath = path.join(projectRoot, '.claude', 'orbital.config.json');
  if (fs.existsSync(configPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      const name = config.projectName || path.basename(projectRoot);
      checks.push({ label: 'Project', status: pc.green(`initialized (${name})`) });
    } catch {
      checks.push({ label: 'Project', status: pc.yellow('config exists but unreadable') });
    }
  } else {
    checks.push({ label: 'Project', status: pc.dim('not initialized (run `orbital init`)') });
  }

  // 5. Workflow
  const workflowPath = path.join(projectRoot, '.claude', 'config', 'workflow.json');
  if (fs.existsSync(workflowPath)) {
    try {
      const wf = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));
      const listCount = (wf.lists || []).length;
      const mode = wf.branchingMode || 'unknown';
      checks.push({ label: 'Workflow', status: pc.green(`${wf.name || 'Custom'} (${listCount} lists, ${mode})`) });
    } catch {
      checks.push({ label: 'Workflow', status: pc.yellow('workflow.json exists but unreadable') });
    }
  } else {
    checks.push({ label: 'Workflow', status: pc.dim('no workflow configured') });
  }

  // 6. Database
  const dbPath = path.join(projectRoot, '.claude', 'orbital', 'orbital.db');
  if (fs.existsSync(dbPath)) {
    const stats = fs.statSync(dbPath);
    const sizeMb = (stats.size / (1024 * 1024)).toFixed(1);
    checks.push({ label: 'Database', status: pc.green(`${sizeMb} MB`) });
  } else {
    checks.push({ label: 'Database', status: pc.dim('not yet created (starts on first launch)') });
  }

  // 7. Template staleness
  if (fs.existsSync(configPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (config.templateVersion && config.templateVersion !== packageVersion) {
        checks.push({ label: 'Templates', status: pc.yellow(`outdated (v${config.templateVersion} → v${packageVersion}, run \`orbital update\`)`) });
      } else if (config.templateVersion) {
        checks.push({ label: 'Templates', status: pc.green('synced') });
      } else {
        checks.push({ label: 'Templates', status: pc.yellow('no version stamp (run `orbital update`)') });
      }
    } catch { /* skip */ }
  }

  // Print all checks
  const maxLabel = Math.max(...checks.map(c => c.label.length));
  for (const check of checks) {
    console.log(`  ${pc.dim(check.label.padEnd(maxLabel + 2))} ${check.status}`);
  }
  console.log();
}
