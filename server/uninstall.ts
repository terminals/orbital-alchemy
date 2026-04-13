/**
 * Uninstall logic — extracted from init.ts for focused maintainability.
 */

import fs from 'fs';
import path from 'path';
import { loadManifest } from './manifest.js';
import { removeAllOrbitalHooks } from './settings-sync.js';
import { unregisterProject } from './global-config.js';
import {
  TEMPLATES_DIR,
  cleanEmptyDirs,
  listTemplateFiles,
} from './init.js';

// ─── Uninstall ──────────────────────────────────────────────

export interface UninstallOptions {
  dryRun?: boolean;
  keepConfig?: boolean;
}

export function runUninstall(projectRoot: string, options: UninstallOptions = {}): void {
  const { dryRun = false, keepConfig = false } = options;
  const claudeDir = path.join(projectRoot, '.claude');

  console.log(`\nOrbital Command — uninstall${dryRun ? ' (dry run)' : ''}`);
  console.log(`Project root: ${projectRoot}\n`);

  const manifest = loadManifest(projectRoot);

  // Fall back to legacy uninstall if no manifest
  if (!manifest) {
    console.log('  No manifest found — falling back to legacy uninstall.');
    runLegacyUninstall(projectRoot);
    return;
  }

  // Compute what to remove vs preserve
  const toRemove: string[] = [];
  const toPreserve: string[] = [];

  for (const [filePath, record] of Object.entries(manifest.files)) {
    if (record.origin === 'user') {
      toPreserve.push(filePath);
    } else if (record.status === 'modified' || record.status === 'outdated') {
      toPreserve.push(filePath);
    } else {
      toRemove.push(filePath);
    }
  }

  if (dryRun) {
    console.log('  Files to REMOVE:');
    for (const f of toRemove) console.log(`    ${f}`);
    if (toPreserve.length > 0) {
      console.log('  Files to PRESERVE:');
      for (const f of toPreserve) console.log(`    ${f} (${manifest.files[f].origin}/${manifest.files[f].status})`);
    }
    console.log(`\n  Would also remove: settings hooks, generated artifacts, config files, gitignore entries`);
    console.log(`  No changes made. Run without --dry-run to apply.`);
    return;
  }

  // 1. Remove _orbital hooks from settings.local.json
  const settingsPath = path.join(claudeDir, 'settings.local.json');
  const removedHooks = removeAllOrbitalHooks(settingsPath);
  console.log(`  Removed  ${removedHooks} orbital hook registrations`);

  // 2. Delete template files (synced + pinned, not modified or user-owned)
  let filesRemoved = 0;
  for (const filePath of toRemove) {
    const absPath = path.join(claudeDir, filePath);
    if (fs.existsSync(absPath)) {
      fs.unlinkSync(absPath);
      filesRemoved++;
    }
  }
  console.log(`  Removed  ${filesRemoved} template files`);
  if (toPreserve.length > 0) {
    console.log(`  Preserved ${toPreserve.length} user/modified files`);
  }

  // 3. Clean up empty directories
  for (const dir of ['hooks', 'skills', 'agents', 'config/workflows', 'quick', 'anti-patterns']) {
    const dirPath = path.join(claudeDir, dir);
    if (fs.existsSync(dirPath)) cleanEmptyDirs(dirPath);
  }

  // 4. Remove generated artifacts
  for (const artifact of manifest.generatedArtifacts) {
    const artifactPath = path.join(claudeDir, artifact);
    if (fs.existsSync(artifactPath)) {
      fs.unlinkSync(artifactPath);
      console.log(`  Removed  .claude/${artifact}`);
    }
  }

  // 5. Remove template-sourced config files
  const configFiles = [
    'config/agent-triggers.json',
    'config/workflow.json',
    'lessons-learned.md',
  ];
  for (const file of configFiles) {
    const filePath = path.join(claudeDir, file);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`  Removed  .claude/${file}`);
    }
  }

  // Remove config/workflows/ directory entirely
  const workflowsDir = path.join(claudeDir, 'config', 'workflows');
  if (fs.existsSync(workflowsDir)) {
    fs.rmSync(workflowsDir, { recursive: true, force: true });
    console.log(`  Removed  .claude/config/workflows/`);
  }

  // 6. Remove gitignore entries
  removeGitignoreEntries(projectRoot, manifest.gitignoreEntries);
  console.log(`  Cleaned  .gitignore`);

  // 7. Deregister from global registry
  if (unregisterProject(projectRoot)) {
    console.log(`  Removed  project from ~/.orbital/config.json`);
  }

  // 8. Remove orbital config and manifest (unless --keep-config)
  if (!keepConfig) {
    const toClean = ['orbital.config.json', 'orbital-manifest.json', 'orbital-sync.json'];
    for (const file of toClean) {
      const filePath = path.join(claudeDir, file);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }

    // Remove backups directory
    const backupsDir = path.join(claudeDir, '.orbital-backups');
    if (fs.existsSync(backupsDir)) fs.rmSync(backupsDir, { recursive: true, force: true });

    console.log(`  Removed  orbital config and manifest`);
  } else {
    // Still remove the manifest — it's invalid after uninstall
    const manifestPath = path.join(claudeDir, 'orbital-manifest.json');
    if (fs.existsSync(manifestPath)) fs.unlinkSync(manifestPath);
    console.log(`  Kept     orbital.config.json (--keep-config)`);
  }

  // Clean up remaining empty directories
  for (const dir of ['config', 'quick', 'anti-patterns', 'review-verdicts']) {
    const dirPath = path.join(claudeDir, dir);
    if (fs.existsSync(dirPath)) cleanEmptyDirs(dirPath);
  }

  const total = removedHooks + filesRemoved;
  console.log(`\nUninstall complete. ${total} items removed.`);
  if (toPreserve.length > 0) {
    console.log(`Note: ${toPreserve.length} user/modified files were preserved.`);
  }
  console.log(`Note: scopes/ and .claude/orbital-events/ were preserved.\n`);
}

// ─── Helpers ────────────────────────────────────────────────

/** Legacy uninstall for projects without a manifest (backward compat). */
function runLegacyUninstall(projectRoot: string): void {
  const claudeDir = path.join(projectRoot, '.claude');

  // Remove orbital hooks from settings.local.json
  const settingsPath = path.join(claudeDir, 'settings.local.json');
  const removedHooks = removeAllOrbitalHooks(settingsPath);
  console.log(`  Removed  ${removedHooks} orbital hook registrations`);

  // Delete hooks/skills/agents that match template files
  for (const dir of ['hooks', 'skills', 'agents']) {
    const templateDir = listTemplateFiles(path.join(TEMPLATES_DIR, dir), path.join(claudeDir, dir));
    let removed = 0;
    for (const f of templateDir) {
      if (fs.existsSync(f)) { fs.unlinkSync(f); removed++; }
    }
    const dirPath = path.join(claudeDir, dir);
    if (fs.existsSync(dirPath)) cleanEmptyDirs(dirPath);
    console.log(`  Removed  ${removed} ${dir} files`);
  }

  console.log(`\nLegacy uninstall complete.`);
  console.log(`Note: scopes/ and .claude/orbital-events/ were preserved.\n`);
}

/** Remove Orbital-added entries from .gitignore. */
function removeGitignoreEntries(projectRoot: string, entries: string[]): void {
  const gitignorePath = path.join(projectRoot, '.gitignore');
  if (!fs.existsSync(gitignorePath)) return;

  let content = fs.readFileSync(gitignorePath, 'utf-8');
  const marker = '# Orbital Command';

  const markerIdx = content.indexOf(marker);
  if (markerIdx !== -1) {
    const before = content.slice(0, markerIdx).replace(/\n+$/, '');
    const after = content.slice(markerIdx);
    const lines = after.split('\n');
    let endIdx = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (i === 0) { endIdx = i + 1; continue; }
      if (line === '' || entries.includes(line)) { endIdx = i + 1; continue; }
      break;
    }
    const remaining = lines.slice(endIdx).join('\n');
    content = before + (remaining ? '\n' + remaining : '') + '\n';
    fs.writeFileSync(gitignorePath, content, 'utf-8');
  }
}
