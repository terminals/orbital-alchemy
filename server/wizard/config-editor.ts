/**
 * Interactive config editor — `orbital config`
 */

import fs from 'fs';
import path from 'path';
import * as p from '@clack/prompts';
import pc from 'picocolors';
import { WORKFLOW_PRESETS } from './types.js';

export async function runConfigEditor(projectRoot: string, packageVersion: string, args: string[]): Promise<void> {
  const subcommand = args[0];

  // Non-interactive: orbital config show
  if (subcommand === 'show') {
    const config = loadProjectConfig(projectRoot);
    if (!config) {
      console.error('No config found. Run `orbital init` first.');
      process.exit(1);
    }
    console.log(JSON.stringify(config, null, 2));
    return;
  }

  // Non-interactive: orbital config set <key> <value>
  if (subcommand === 'set') {
    const key = args[1];
    const value = args[2];
    if (!key || value === undefined) {
      console.error('Usage: orbital config set <key> <value>');
      process.exit(1);
    }
    setConfigValue(projectRoot, key, value);
    return;
  }

  // Interactive mode
  const config = loadProjectConfig(projectRoot);
  if (!config) {
    p.log.error('No config found. Run `orbital init` first.');
    process.exit(1);
  }

  p.intro(`${pc.bgCyan(pc.black(' Orbital Config '))} ${pc.dim(`v${packageVersion}`)}`);

  // If a section was specified, jump directly to it
  if (subcommand === 'project') {
    await editProjectSection(projectRoot, config);
  } else if (subcommand === 'workflow') {
    await editWorkflowSection(projectRoot);
  } else if (subcommand === 'global') {
    await editGlobalSection();
  } else {
    // Show interactive menu
    const section = await p.select({
      message: 'What would you like to configure?',
      options: [
        { value: 'project', label: 'Project', hint: 'name, ports, build commands' },
        { value: 'workflow', label: 'Workflow', hint: 'switch preset, view lists' },
        { value: 'global', label: 'Global', hint: 'registered projects' },
      ],
    });

    if (p.isCancel(section)) {
      p.cancel('Config cancelled.');
      return;
    }

    if (section === 'project') await editProjectSection(projectRoot, config);
    else if (section === 'workflow') await editWorkflowSection(projectRoot);
    else if (section === 'global') await editGlobalSection();
  }

  p.outro('Configuration updated.');
}

// ─── Section Editors ────────────────────────────────────────────

async function editProjectSection(projectRoot: string, config: Record<string, unknown>): Promise<void> {
  const name = await p.text({
    message: 'Project name',
    defaultValue: (config.projectName as string) || '',
    placeholder: (config.projectName as string) || '',
  });
  if (p.isCancel(name)) return;

  const serverPort = await p.text({
    message: 'Server port',
    defaultValue: String(config.serverPort || 4444),
    placeholder: String(config.serverPort || 4444),
    validate: (val) => {
      const n = Number(val);
      if (isNaN(n) || n < 1 || n > 65535) return 'Must be a valid port (1-65535)';
      return undefined;
    },
  });
  if (p.isCancel(serverPort)) return;

  const clientPort = await p.text({
    message: 'Client port',
    defaultValue: String(config.clientPort || 4445),
    placeholder: String(config.clientPort || 4445),
    validate: (val) => {
      const n = Number(val);
      if (isNaN(n) || n < 1 || n > 65535) return 'Must be a valid port (1-65535)';
      return undefined;
    },
  });
  if (p.isCancel(clientPort)) return;

  config.projectName = name;
  config.serverPort = Number(serverPort);
  config.clientPort = Number(clientPort);
  saveProjectConfig(projectRoot, config);
  p.log.success('Project config saved.');
}

async function editWorkflowSection(projectRoot: string): Promise<void> {
  const workflowPath = path.join(projectRoot, '.claude', 'config', 'workflow.json');
  let currentPreset = 'unknown';

  if (fs.existsSync(workflowPath)) {
    try {
      const wf = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));
      currentPreset = wf.name || 'Custom';
      const lists = (wf.lists || []).map((l: Record<string, string>) => l.label).join(' → ');
      p.note(`Current: ${pc.cyan(currentPreset)}\nLists:   ${lists}`, 'Active Workflow');
    } catch { /* show selector anyway */ }
  }

  const switchPreset = await p.confirm({
    message: 'Switch to a different preset?',
    initialValue: false,
  });
  if (p.isCancel(switchPreset) || !switchPreset) return;

  const preset = await p.select({
    message: 'Choose a workflow preset',
    options: WORKFLOW_PRESETS.map(wp => ({
      value: wp.value,
      label: wp.label,
      hint: wp.hint,
    })),
  });
  if (p.isCancel(preset)) return;

  // Find and copy the preset
  // Walk up to find templates dir
  const templatesDir = findTemplatesDir();
  if (!templatesDir) {
    p.log.error('Could not locate templates directory.');
    return;
  }

  const presetPath = path.join(templatesDir, 'presets', `${preset}.json`);
  if (fs.existsSync(presetPath)) {
    fs.copyFileSync(presetPath, workflowPath);
    p.log.success(`Switched to ${preset} workflow.`);
  } else {
    p.log.error(`Preset file not found: ${preset}.json`);
  }
}

async function editGlobalSection(): Promise<void> {
  const homedir = process.env.HOME || process.env.USERPROFILE || '~';
  const registryPath = path.join(homedir, '.orbital', 'config.json');

  if (!fs.existsSync(registryPath)) {
    p.log.info('No global registry found. Run `orbital init` in a project first.');
    return;
  }

  try {
    const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    const projects = registry.projects || [];

    if (projects.length === 0) {
      p.log.info('No projects registered.');
      return;
    }

    const rows = projects.map((proj: Record<string, unknown>) => {
      const exists = fs.existsSync(proj.path as string);
      const status = proj.enabled ? (exists ? pc.green('active') : pc.yellow('offline')) : pc.dim('disabled');
      return `  ${pc.cyan(String(proj.id).padEnd(20))} ${status.padEnd(20)} ${proj.path}`;
    });
    p.note(rows.join('\n'), `Registered Projects (${projects.length})`);
  } catch {
    p.log.error('Could not read global registry.');
  }
}

// ─── Helpers ────────────────────────────────────────────────────

function loadProjectConfig(projectRoot: string): Record<string, unknown> | null {
  const configPath = path.join(projectRoot, '.claude', 'orbital.config.json');
  if (!fs.existsSync(configPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch {
    return null;
  }
}

function saveProjectConfig(projectRoot: string, config: Record<string, unknown>): void {
  const configPath = path.join(projectRoot, '.claude', 'orbital.config.json');
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf8');
}

function setConfigValue(projectRoot: string, key: string, value: string): void {
  const config = loadProjectConfig(projectRoot);
  if (!config) {
    console.error('No config found. Run `orbital init` first.');
    process.exit(1);
  }

  // Parse value: try number, then boolean, then string
  let parsed: unknown = value;
  if (value === 'true') parsed = true;
  else if (value === 'false') parsed = false;
  else if (value === 'null') parsed = null;
  else if (!isNaN(Number(value)) && value !== '') parsed = Number(value);

  // Support dot notation for nested keys
  const keys = key.split('.');
  let target: Record<string, unknown> = config;
  for (let i = 0; i < keys.length - 1; i++) {
    if (typeof target[keys[i]] !== 'object' || target[keys[i]] === null) {
      target[keys[i]] = {};
    }
    target = target[keys[i]] as Record<string, unknown>;
  }
  target[keys[keys.length - 1]] = parsed;

  saveProjectConfig(projectRoot, config);
  console.log(`Set ${key} = ${JSON.stringify(parsed)}`);
}

function findTemplatesDir(): string | null {
  // Walk up from this file to find templates/
  let dir = path.dirname(new URL(import.meta.url).pathname);
  for (let i = 0; i < 5; i++) {
    const candidate = path.join(dir, 'templates');
    if (fs.existsSync(candidate)) return candidate;
    dir = path.resolve(dir, '..');
  }
  return null;
}
