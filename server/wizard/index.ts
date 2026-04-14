/**
 * Interactive CLI wizard — main orchestrator.
 *
 * Entry points:
 *   runSetupWizard()   — First-time Orbital setup (~/.orbital/)
 *   runHub()           — Context-aware hub menu (orbital)
 *   runConfigEditor()  — interactive config editor (orbital config)
 *   runDoctor()        — health diagnostics (orbital doctor)
 */

import fs from 'fs';
import path from 'path';
import { spawn, execFileSync } from 'child_process';
import * as p from '@clack/prompts';
import pc from 'picocolors';
import { buildSetupState } from './detect.js';
import { phaseSetupWizard } from './phases/setup-wizard.js';
import { runConfigEditor } from './config-editor.js';
import { runDoctor } from './doctor.js';
import { isITerm2Available } from '../adapters/iterm2-adapter.js';

export { runConfigEditor, runDoctor };

// ─── Phase 1: Setup Wizard ─────────────────────────────────────

/**
 * First-time setup. Creates ~/.orbital/ and seeds primitives.
 * Project setup is now handled by the frontend Add Project modal.
 */
export async function runSetupWizard(packageVersion: string): Promise<void> {
  const state = buildSetupState(packageVersion);

  p.intro(`${pc.bgCyan(pc.black(' Orbital Command '))} ${pc.dim(`v${packageVersion}`)}`);

  await phaseSetupWizard(state);

  p.outro('Launching dashboard...');
}

// ─── Update Check ─────────────────────────────────────────────

interface UpdateInfo {
  current: string;
  latest: string;
  isOutdated: boolean;
}

/** Returns true if `a` is older than `b` (semver comparison). */
function isOlderThan(a: string, b: string): boolean {
  const pa = a.match(/^(\d+)\.(\d+)\.(\d+)/);
  const pb = b.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!pa || !pb) return false;
  for (let i = 1; i <= 3; i++) {
    if (parseInt(pa[i]) < parseInt(pb[i])) return true;
    if (parseInt(pa[i]) > parseInt(pb[i])) return false;
  }
  return false;
}

async function checkForUpdate(
  currentVersion: string,
  cache: { lastUpdateCheck?: string; latestVersion?: string },
): Promise<{ info: UpdateInfo | null; cacheChanged: boolean }> {
  // Use cache if checked within 24 hours
  if (cache.lastUpdateCheck && cache.latestVersion) {
    const age = Date.now() - new Date(cache.lastUpdateCheck).getTime();
    if (age < 24 * 60 * 60 * 1000) {
      const isOutdated = isOlderThan(currentVersion, cache.latestVersion);
      return {
        info: { current: currentVersion, latest: cache.latestVersion, isOutdated },
        cacheChanged: false,
      };
    }
  }

  // Fetch from npm registry
  try {
    const res = await fetch('https://registry.npmjs.org/orbital-command/latest', {
      signal: AbortSignal.timeout(3000),
    });
    const data = await res.json() as { version: string };
    const latest = data.version;
    return {
      info: { current: currentVersion, latest, isOutdated: isOlderThan(currentVersion, latest) },
      cacheChanged: true,
    };
  } catch {
    return { info: null, cacheChanged: false };
  }
}

// ─── Hub Menu ─────────────────────────────────────────────────

export type HubAction = 'launch' | 'config' | 'doctor' | 'update' | 'status' | 'reset';

export interface HubResult {
  action: HubAction;
  setItermPromptShown?: boolean;
  updateCache?: { lastUpdateCheck: string; latestVersion?: string };
}

/**
 * Context-aware hub menu — the main entry point for `orbital` (no args).
 * Checks for updates, offers template sync, shows iTerm2 recommendation, then menu.
 */
export async function runHub(opts: {
  packageVersion: string;
  projectNames: string[];
  itermPromptShown: boolean;
  isMac: boolean;
  lastUpdateCheck?: string;
  latestVersion?: string;
  projectPaths: Array<{ name: string; path: string }>;
}): Promise<HubResult> {
  const result: HubResult = { action: 'launch' };

  p.intro(`${pc.bgCyan(pc.black(' Orbital Command '))} ${pc.dim(`v${opts.packageVersion}`)}`);

  // ── Update check ──
  const updateCheck = await checkForUpdate(opts.packageVersion, {
    lastUpdateCheck: opts.lastUpdateCheck,
    latestVersion: opts.latestVersion,
  });

  if (updateCheck.cacheChanged) {
    result.updateCache = {
      lastUpdateCheck: new Date().toISOString(),
      latestVersion: updateCheck.info?.latest,
    };
  }

  if (updateCheck.info?.isOutdated) {
    p.log.info(
      `Update available: ${pc.dim(`v${updateCheck.info.current}`)} → ${pc.cyan(`v${updateCheck.info.latest}`)}`
    );

    const updateChoice = await p.select({
      message: 'Update Orbital Command now?',
      options: [
        { value: 'update', label: 'Yes, update' },
        { value: 'skip', label: 'Skip for now' },
      ],
    });

    if (!p.isCancel(updateChoice) && updateChoice === 'update') {
      const s = p.spinner();
      s.start('Updating Orbital Command...');
      try {
        execFileSync('npm', ['update', '-g', 'orbital-command'], { stdio: 'pipe', timeout: 60000 });
        s.stop(`Updated to v${updateCheck.info.latest}!`);
        p.outro(`Run ${pc.cyan('orbital')} again to use the new version.`);
        process.exit(0);
      } catch (err) {
        s.stop('Update failed.');
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('EACCES') || msg.includes('permission denied')) {
          p.log.error('Permission denied. Try running with sudo or ensure npm is installed via nvm.');
        } else if (msg.includes('ETIMEDOUT') || msg.includes('timeout')) {
          p.log.error('Update timed out. Check your network connection and try again.');
        } else {
          p.log.error(msg);
        }
      }
    }
  }

  // ── Template staleness check ──
  if (opts.projectPaths.length > 0) {
    const mod = await import('../manifest.js');
    const initMod = await import('../init.js');
    const outdatedProjects: Array<{
      name: string;
      path: string;
      details: string[];
    }> = [];

    for (const proj of opts.projectPaths) {
      if (!fs.existsSync(proj.path)) {
        p.log.warn(`${proj.name}: project path not found (${proj.path})`);
        continue;
      }
      const manifest = mod.loadManifest(proj.path);
      if (!manifest) continue;
      const claudeDir = path.join(proj.path, '.claude');
      mod.refreshFileStatuses(manifest, claudeDir);
      const summary = mod.summarizeManifest(manifest);
      const parts = Object.entries(summary.byType)
        .filter(([, counts]) => counts.outdated > 0)
        .map(([type, counts]) => `${counts.outdated} ${type}`);
      if (parts.length > 0) {
        outdatedProjects.push({ name: proj.name, path: proj.path, details: parts });
      }
    }

    if (outdatedProjects.length > 0) {
      const lines = outdatedProjects.map(proj =>
        `  ${pc.cyan(proj.name.padEnd(16))} ${proj.details.join(', ')} outdated`
      );
      const count = outdatedProjects.length;
      p.note(lines.join('\n'), `${count} project${count > 1 ? 's have' : ' has'} outdated templates`);

      const syncChoice = await p.select({
        message: 'Update project templates now?',
        options: [
          { value: 'update', label: 'Yes, update all safe files', hint: 'skips modified and pinned' },
          { value: 'skip', label: 'Skip for now' },
        ],
      });

      if (!p.isCancel(syncChoice) && syncChoice === 'update') {
        for (const proj of outdatedProjects) {
          const s = p.spinner();
          s.start(`Updating ${proj.name}...`);
          try {
            initMod.runUpdate(proj.path, { dryRun: false });
            s.stop(`${proj.name} updated.`);
          } catch (err) {
            s.stop(`${proj.name} failed.`);
            p.log.warn(err instanceof Error ? err.message : String(err));
          }
        }
      }
    }
  }

  // ── iTerm2 recommendation (macOS only, one-time) ──
  if (opts.isMac && !opts.itermPromptShown && !isITerm2Available()) {
    p.note(
      `Sprint dispatch, batch orchestration, and session management\n` +
      `use iTerm2 tabs to run parallel Claude Code sessions.\n` +
      `Without it, sessions fall back to basic subprocess mode.`,
      'iTerm2 Recommended',
    );

    const itermChoice = await p.select({
      message: 'Install iTerm2?',
      options: [
        { value: 'install', label: 'Open download page', hint: 'https://iterm2.com' },
        { value: 'skip', label: 'Skip for now' },
      ],
    });

    result.setItermPromptShown = true;

    if (!p.isCancel(itermChoice) && itermChoice === 'install') {
      spawn('open', ['https://iterm2.com'], { detached: true, stdio: 'ignore' }).unref();
      p.log.info('Waiting for iTerm2 to install... (press any key to skip)');

      await new Promise<void>((resolve) => {
        let done = false;
        const cleanup = (): void => {
          if (done) return;
          done = true;
          process.stdin.setRawMode?.(false);
          process.stdin.removeListener('data', onKey);
          process.stdin.pause();
          clearInterval(timer);
          resolve();
        };
        const onKey = (): void => { cleanup(); };
        const startTime = Date.now();
        const MAX_WAIT = 10 * 60 * 1000; // 10 minutes
        const timer = setInterval(() => {
          if (isITerm2Available()) {
            p.log.success('iTerm2 detected!');
            cleanup();
          } else if (Date.now() - startTime > MAX_WAIT) {
            cleanup();
          }
        }, 3000);
        process.stdin.setRawMode?.(true);
        process.stdin.resume();
        process.stdin.on('data', onKey);
      });
    }
  }

  // ── Show menu and pick action ──
  result.action = await promptHubAction(opts.projectNames);
  return result;
}

/**
 * Show the hub menu and return the chosen action.
 * Exported separately so the CLI can loop back after executing an action.
 */
export async function promptHubAction(projectNames: string[]): Promise<HubAction> {
  const projectHint = projectNames.length > 0
    ? pc.dim(` (${projectNames.join(', ')})`)
    : '';

  const options: Array<{ value: HubAction; label: string; hint?: string }> = [
    { value: 'launch', label: `Launch dashboard${projectHint}` },
    { value: 'config', label: 'Config', hint: 'modify project settings' },
    { value: 'doctor', label: 'Doctor', hint: 'health check & diagnostics' },
    { value: 'update', label: 'Update templates', hint: 'sync to latest' },
    { value: 'status', label: 'Status', hint: 'template sync status' },
    { value: 'reset', label: 'Reset to defaults', hint: 'force-reset all templates' },
  ];

  const action = await p.select({
    message: 'What would you like to do?',
    options,
  });

  if (p.isCancel(action)) {
    p.cancel('Cancelled.');
    process.exit(0);
  }

  // Double-confirm for destructive reset
  if (action === 'reset') {
    p.note(
      'This will overwrite ALL hooks, skills, agents, and workflow config\n' +
      'with the default templates. Modified and pinned files will be replaced.\n' +
      'Your scopes, database, and orbital.config.json are preserved.',
      'Warning',
    );
    const confirmReset = await p.confirm({
      message: 'Are you sure you want to reset all templates?',
      initialValue: false,
    });
    if (p.isCancel(confirmReset) || !confirmReset) {
      return promptHubAction(projectNames);
    }
    const doubleConfirm = await p.confirm({
      message: 'This cannot be undone. Continue?',
      initialValue: false,
    });
    if (p.isCancel(doubleConfirm) || !doubleConfirm) {
      return promptHubAction(projectNames);
    }
  }

  return action;
}

