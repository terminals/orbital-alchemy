/**
 * Interactive CLI wizard — main orchestrator.
 *
 * Entry points:
 *   runSetupWizard()   — Phase 1: first-time Orbital setup (~/.orbital/)
 *   runProjectSetup()  — Phase 2: per-project scaffolding (.claude/)
 *   runConfigEditor()  — interactive config editor (orbital config)
 *   runDoctor()        — health diagnostics (orbital doctor)
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import * as p from '@clack/prompts';
import pc from 'picocolors';
import { buildSetupState, buildProjectState, ORBITAL_HOME } from './detect.js';
import { phaseSetupWizard } from './phases/setup-wizard.js';
import { phaseWelcome } from './phases/welcome.js';
import { phaseProjectSetup } from './phases/project-setup.js';
import { phaseWorkflowSetup } from './phases/workflow-setup.js';
import { phaseConfirm, showPostInstall } from './phases/confirm.js';
import { NOTES } from './ui.js';
import { runConfigEditor } from './config-editor.js';
import { runDoctor } from './doctor.js';

export { runConfigEditor, runDoctor };

// ─── Phase 1: Setup Wizard ─────────────────────────────────────

/**
 * First-time setup. Creates ~/.orbital/, seeds primitives,
 * optionally links projects (running Phase 2 for each).
 */
export async function runSetupWizard(packageVersion: string): Promise<void> {
  const state = buildSetupState(packageVersion);

  p.intro(`${pc.bgCyan(pc.black(' Orbital Command '))} ${pc.dim(`v${packageVersion}`)}`);

  await phaseSetupWizard(state);

  // If user linked projects, run Phase 2 for each
  for (const projectRoot of state.linkedProjects) {
    p.log.step(`Setting up ${pc.cyan(path.basename(projectRoot))}...`);
    await runProjectSetupInline(projectRoot, packageVersion);
  }

  if (state.linkedProjects.length === 0) {
    p.note(NOTES.setupComplete, 'Done');
  }

  p.outro(
    state.linkedProjects.length > 0
      ? `Run ${pc.cyan('orbital launch --open')} to open the dashboard.`
      : `Run ${pc.cyan('orbital init')} in a project directory to get started.`
  );
}

// ─── Phase 2: Project Setup ────────────────────────────────────

/**
 * Per-project setup. Walks through name, commands, workflow, then
 * calls runInit() to scaffold files into .claude/.
 */
export async function runProjectSetup(projectRoot: string, packageVersion: string, args: string[]): Promise<void> {
  const state = buildProjectState(projectRoot, packageVersion);
  const force = args.includes('--force');

  p.intro(`${pc.bgCyan(pc.black(' Orbital Command '))} ${pc.dim(`v${packageVersion}`)}`);

  // Welcome gate: detect re-init / reconfigure
  const forceFromWelcome = await phaseWelcome(state);
  const useForce = force || forceFromWelcome;

  await runProjectPhases(state, useForce);

  p.outro(`Run ${pc.cyan('orbital launch --open')} to open the dashboard.`);
}

// ─── Shared project phases (used by both flows) ────────────────

/**
 * Run the project setup phases and install. Used by both
 * standalone runProjectSetup() and inline from runSetupWizard().
 */
async function runProjectPhases(state: ReturnType<typeof buildProjectState>, useForce: boolean): Promise<void> {
  await phaseProjectSetup(state);
  await phaseWorkflowSetup(state);
  await phaseConfirm(state);

  // Install
  const s = p.spinner();
  s.start('Installing into project...');

  try {
    const { runInit } = await import('../init.js');

    runInit(state.projectRoot, {
      force: useForce,
      quiet: true,
      preset: state.workflowPreset,
      projectName: state.projectName,
      serverPort: state.serverPort,
      clientPort: state.clientPort,
      commands: state.selectedCommands,
    });

    registerProject(state.projectRoot, state.projectName);
    stampTemplateVersion(state.projectRoot, state.packageVersion);

    s.stop('Project ready.');
  } catch (err) {
    s.stop('Installation failed.');
    p.log.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  showPostInstall(state);
}

/**
 * Inline project setup — called from Phase 1 when user links a project.
 * Skips intro/outro since the setup wizard already has those.
 */
async function runProjectSetupInline(projectRoot: string, packageVersion: string): Promise<void> {
  const state = buildProjectState(projectRoot, packageVersion);

  // Skip welcome gate for inline — this is a fresh project being linked
  await runProjectPhases(state, false);
}

// ─── Registration ──────────────────────────────────────────────

function registerProject(projectRoot: string, projectName?: string): void {
  const registryPath = path.join(ORBITAL_HOME, 'config.json');
  let registry: { version: number; projects: Array<Record<string, unknown>> };

  try {
    registry = fs.existsSync(registryPath)
      ? JSON.parse(fs.readFileSync(registryPath, 'utf8'))
      : { version: 1, projects: [] };
  } catch {
    registry = { version: 1, projects: [] };
  }

  if (!registry.projects) registry.projects = [];
  if (registry.projects.some((proj: Record<string, unknown>) => proj.path === projectRoot)) return;

  const COLORS = [
    '210 80% 55%', '340 75% 55%', '160 60% 45%', '30 90% 55%',
    '270 65% 55%', '50 85% 50%', '180 55% 45%', '0 70% 55%',
  ];
  const usedColors = registry.projects.map((proj: Record<string, unknown>) => proj.color);
  const color = COLORS.find(c => !usedColors.includes(c)) || COLORS[0];

  const name = projectName || path.basename(projectRoot);
  const baseSlug = path.basename(projectRoot).toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'project';
  const existingIds = registry.projects.map((proj: Record<string, unknown>) => proj.id);
  const slug = existingIds.includes(baseSlug)
    ? `${baseSlug}-${crypto.createHash('sha256').update(projectRoot).digest('hex').slice(0, 4)}`
    : baseSlug;

  registry.projects.push({
    id: slug,
    path: projectRoot,
    name,
    color,
    registeredAt: new Date().toISOString(),
    enabled: true,
  });

  fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2), 'utf8');
}

// ─── Template Version Stamping ─────────────────────────────────

function stampTemplateVersion(projectRoot: string, packageVersion: string): void {
  const configPath = path.join(projectRoot, '.claude', 'orbital.config.json');
  if (!fs.existsSync(configPath)) return;

  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    if (config.templateVersion !== packageVersion) {
      config.templateVersion = packageVersion;
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf8');
    }
  } catch { /* ignore malformed config */ }
}
