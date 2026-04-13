/**
 * Template update logic — extracted from init.ts for focused maintainability.
 */

import fs from 'fs';
import path from 'path';
import {
  loadManifest,
  saveManifest,
  buildTemplateInventory,
  refreshFileStatuses,
  templateFileRecord,
  safeBackupFile,
  safeCopyTemplate,
  reverseRemapPath,
} from './manifest.js';
import { needsLegacyMigration, migrateFromLegacy } from './migrate-legacy.js';
import { computeUpdatePlan, loadRenameMap, formatPlan, getFilesToBackup } from './update-planner.js';
import { syncSettingsHooks, getTemplateChecksum } from './settings-sync.js';
import { migrateConfig } from './config-migrator.js';
import { validate, formatValidationReport } from './validator.js';
import { createBackup } from './manifest.js';
import {
  TEMPLATES_DIR,
  ensureDir,
  cleanEmptyDirs,
  chmodScripts,
  writeManifest,
  generateIndexMd,
  seedGlobalPrimitives,
  getPackageVersion,
} from './init.js';

// ─── Update ─────────────────────────────────────────────────

export interface UpdateOptions {
  dryRun?: boolean;
  force?: boolean;
}

export function runUpdate(projectRoot: string, options: UpdateOptions = {}): void {
  const { dryRun = false } = options;
  const claudeDir = path.join(projectRoot, '.claude');
  const newVersion = getPackageVersion();

  console.log(`\nOrbital Command — update${dryRun ? ' (dry run)' : ''}`);
  console.log(`Project root: ${projectRoot}\n`);

  // 1. Load or create manifest (auto-migrate legacy installs)
  let manifest = loadManifest(projectRoot);
  if (!manifest) {
    if (needsLegacyMigration(projectRoot)) {
      console.log('  Migrating from legacy install...');
      const result = migrateFromLegacy(projectRoot, TEMPLATES_DIR, newVersion);
      console.log(`  Migrated ${result.synced} synced, ${result.modified} modified, ${result.userOwned} user-owned files`);
      if (result.importedPins > 0) console.log(`  Imported ${result.importedPins} pinned files from orbital-sync.json`);
      manifest = loadManifest(projectRoot);
    }
    if (!manifest) {
      console.log('  No manifest found. Run `orbital` first.');
      return;
    }
  }

  const oldVersion = manifest.packageVersion;

  // 1b. Refresh file statuses so outdated vs modified is accurate
  refreshFileStatuses(manifest, claudeDir);

  // 2. Compute update plan
  const renameMap = loadRenameMap(TEMPLATES_DIR, oldVersion, newVersion);
  const plan = computeUpdatePlan({
    templatesDir: TEMPLATES_DIR,
    claudeDir,
    manifest,
    newVersion,
    renameMap,
  });

  // 3. Dry-run mode — print plan and exit
  if (dryRun) {
    console.log(formatPlan(plan, oldVersion, newVersion));
    return;
  }

  if (plan.isEmpty && oldVersion === newVersion) {
    console.log('  Everything up to date. No changes needed.');
  }

  // 4. Create backup of files that will be modified
  const filesToBackup = getFilesToBackup(plan);
  if (filesToBackup.length > 0) {
    const backupDir = createBackup(claudeDir, filesToBackup);
    if (backupDir) {
      console.log(`  Backup   ${filesToBackup.length} files → ${path.relative(claudeDir, backupDir)}/`);
    }
  }

  // 5. Execute plan
  const templateInventory = buildTemplateInventory(TEMPLATES_DIR);

  // 5a. Handle renames
  for (const { from, to } of plan.toRename) {
    const fromPath = path.join(claudeDir, from);
    const toPath = path.join(claudeDir, to);
    const toDir = path.dirname(toPath);
    if (!fs.existsSync(toDir)) fs.mkdirSync(toDir, { recursive: true });

    if (fs.existsSync(fromPath)) {
      safeBackupFile(fromPath);
      const stat = fs.lstatSync(fromPath);
      if (stat.isSymbolicLink()) {
        const target = fs.readlinkSync(fromPath);
        fs.unlinkSync(fromPath);
        fs.symlinkSync(target, toPath);
      } else {
        fs.renameSync(fromPath, toPath);
      }
    }

    const record = manifest.files[from];
    if (record) {
      delete manifest.files[from];
      const newHash = templateInventory.get(to);
      manifest.files[to] = { ...record, templateHash: newHash, installedHash: newHash || record.installedHash };
    }
    console.log(`  RENAME  ${from} → ${to}`);
  }

  // 5b. Add new files
  for (const filePath of plan.toAdd) {
    const templateHash = templateInventory.get(filePath);
    if (!templateHash) continue;

    const destPath = path.join(claudeDir, filePath);
    const destDir = path.dirname(destPath);
    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

    copyTemplateFile(filePath, destPath);
    manifest.files[filePath] = templateFileRecord(templateHash);
    console.log(`  ADD     ${filePath}`);
  }

  // 5c. Update changed synced/outdated files
  for (const filePath of plan.toUpdate) {
    const templateHash = templateInventory.get(filePath);
    if (!templateHash) continue;

    const destPath = path.join(claudeDir, filePath);
    safeBackupFile(destPath);
    copyTemplateFile(filePath, destPath);
    manifest.files[filePath] = templateFileRecord(templateHash);
    console.log(`  UPDATE  ${filePath}`);
  }

  // 5d. Remove deleted files
  for (const filePath of plan.toRemove) {
    const absPath = path.join(claudeDir, filePath);
    if (fs.existsSync(absPath)) {
      safeBackupFile(absPath);
      fs.unlinkSync(absPath);
    }
    delete manifest.files[filePath];
    console.log(`  REMOVE  ${filePath}`);
  }

  // 5e. Update pinned/modified file records (record new template hash without touching file)
  for (const { file, reason, newTemplateHash } of plan.toSkip) {
    if (manifest.files[file]) {
      manifest.files[file].templateHash = newTemplateHash;
    }
    if (reason === 'modified') {
      console.log(`  SKIP    ${file} (user modified)`);
    } else {
      console.log(`  SKIP    ${file} (pinned)`);
    }
  }

  // 5f. Clean up empty directories
  for (const dir of ['hooks', 'skills', 'agents', 'config/workflows']) {
    const dirPath = path.join(claudeDir, dir);
    if (fs.existsSync(dirPath)) cleanEmptyDirs(dirPath);
  }

  // 6. Bidirectional settings hook sync
  const settingsTarget = path.join(claudeDir, 'settings.local.json');
  const settingsSrc = path.join(TEMPLATES_DIR, 'settings-hooks.json');
  const syncResult = syncSettingsHooks(settingsTarget, settingsSrc, manifest.settingsHooksChecksum, renameMap);
  if (!syncResult.skipped) {
    console.log(`  Settings +${syncResult.added} -${syncResult.removed} hooks (${syncResult.updated} renamed)`);
    manifest.settingsHooksChecksum = getTemplateChecksum(settingsSrc);
  }

  // 7. Config migrations
  const configPath = path.join(claudeDir, 'orbital.config.json');
  const migrationResult = migrateConfig(configPath, manifest.appliedMigrations);
  if (migrationResult.applied.length > 0) {
    manifest.appliedMigrations.push(...migrationResult.applied);
    console.log(`  Config   ${migrationResult.applied.length} migration(s) applied`);
  }
  if (migrationResult.defaultsFilled.length > 0) {
    console.log(`  Config   ${migrationResult.defaultsFilled.length} default(s) filled`);
  }

  // 8. Regenerate derived artifacts (always)
  const workflowManifestOk = writeManifest(claudeDir);
  console.log(`  ${workflowManifestOk ? 'Updated' : 'Skipped'}  .claude/config/workflow-manifest.sh`);

  const indexContent = generateIndexMd(projectRoot, claudeDir);
  fs.writeFileSync(path.join(claudeDir, 'INDEX.md'), indexContent, 'utf8');
  console.log(`  Updated  .claude/INDEX.md`);

  // 9. Update agent-triggers.json (template-managed)
  const triggersSrc = path.join(TEMPLATES_DIR, 'config', 'agent-triggers.json');
  const triggersDest = path.join(claudeDir, 'config', 'agent-triggers.json');
  if (fs.existsSync(triggersSrc)) {
    fs.copyFileSync(triggersSrc, triggersDest);
    console.log(`  Updated  .claude/config/agent-triggers.json`);
  }

  // 10. Update scope template
  const scopeTemplateSrc = path.join(TEMPLATES_DIR, 'scopes', '_template.md');
  const scopeTemplateDest = path.join(projectRoot, 'scopes', '_template.md');
  if (fs.existsSync(scopeTemplateSrc)) {
    ensureDir(path.join(projectRoot, 'scopes'));
    fs.copyFileSync(scopeTemplateSrc, scopeTemplateDest);
  }

  // 11. Make hook scripts executable
  chmodScripts(path.join(claudeDir, 'hooks'));

  // 12. Refresh global primitives
  seedGlobalPrimitives();

  // 13. Update manifest metadata
  manifest.previousPackageVersion = oldVersion;
  manifest.packageVersion = newVersion;
  manifest.updatedAt = new Date().toISOString();
  saveManifest(projectRoot, manifest);

  // 14. Validate
  const report = validate(projectRoot, newVersion);
  if (report.errors > 0) {
    console.log(`\n  Validation: ${report.errors} errors found`);
    console.log(formatValidationReport(report));
  }

  const totalChanges = plan.toAdd.length + plan.toUpdate.length + plan.toRemove.length + plan.toRename.length;
  console.log(`\nUpdate complete. ${totalChanges} file changes, ${plan.toSkip.length} skipped.\n`);
}

// ─── Helpers ────────────────────────────────────────────────

function copyTemplateFile(claudeRelPath: string, destPath: string): void {
  const templateRelPath = reverseRemapPath(claudeRelPath);
  const srcPath = path.join(TEMPLATES_DIR, templateRelPath);
  if (!fs.existsSync(srcPath)) {
    throw new Error(`Template file not found: ${templateRelPath}`);
  }
  const destDir = path.dirname(destPath);
  if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
  safeCopyTemplate(srcPath, destPath);
}
