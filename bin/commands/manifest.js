import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import {
  PACKAGE_ROOT,
  detectProjectRoot,
  getPackageVersion,
  loadSharedModule,
} from '../lib/helpers.js';

export async function cmdStatus() {
  const projectRoot = detectProjectRoot();

  const mod = await loadSharedModule();
  const manifest = mod.loadManifest(projectRoot);

  if (!manifest) {
    console.log('\nNo manifest found. Run `orbital` to set up this project.\n');
    return;
  }

  const claudeDir = path.join(projectRoot, '.claude');
  mod.refreshFileStatuses(manifest, claudeDir);

  const summary = mod.summarizeManifest(manifest);
  const packageVersion = getPackageVersion();
  const needsUpdate = manifest.packageVersion !== packageVersion;

  console.log(`\nOrbital Command v${packageVersion}${needsUpdate ? ` (installed: ${manifest.packageVersion} → needs update)` : ''}\n`);

  for (const [type, counts] of Object.entries(summary.byType)) {
    const parts = [];
    if (counts.synced) parts.push(`${counts.synced} synced`);
    if (counts.outdated) parts.push(`${counts.outdated} outdated`);
    if (counts.modified) parts.push(`${counts.modified} modified`);
    if (counts.pinned) parts.push(`${counts.pinned} pinned`);
    if (counts.userOwned) parts.push(`${counts.userOwned} user-owned`);
    console.log(`  ${type.padEnd(16)} ${parts.join(', ')}`);
  }

  const outdated = Object.entries(manifest.files)
    .filter(([, r]) => r.status === 'outdated');
  if (outdated.length > 0) {
    console.log('\n  Outdated files (safe to update):');
    for (const [file] of outdated) {
      console.log(`    ${file}`);
    }
  }

  const modified = Object.entries(manifest.files)
    .filter(([, r]) => r.status === 'modified');
  if (modified.length > 0) {
    console.log('\n  Modified files (user edited):');
    for (const [file] of modified) {
      console.log(`    ${file}  (run 'orbital diff ${file}')`);
    }
  }

  const pinned = Object.entries(manifest.files)
    .filter(([, r]) => r.status === 'pinned');
  if (pinned.length > 0) {
    console.log('\n  Pinned files:');
    for (const [file, record] of pinned) {
      const reason = record.pinnedReason ? `"${record.pinnedReason}"` : '';
      console.log(`    ${file}  ${reason}`);
    }
  }

  console.log();
}

export async function cmdValidate() {
  const projectRoot = detectProjectRoot();

  const mod = await loadSharedModule();
  const report = mod.validate(projectRoot, getPackageVersion());
  console.log(mod.formatValidationReport(report));
  process.exit(report.errors > 0 ? 1 : 0);
}

export async function cmdPin(args) {
  const projectRoot = detectProjectRoot();
  const filePath = args.find(a => !a.startsWith('--'));
  const reasonIdx = args.indexOf('--reason');
  const reason = reasonIdx !== -1 ? args[reasonIdx + 1] : undefined;

  if (!filePath) {
    console.error('Usage: orbital pin <relative-path> [--reason "..."]');
    process.exit(1);
  }

  const mod = await loadSharedModule();
  const manifest = mod.loadManifest(projectRoot);
  if (!manifest) {
    console.error('No manifest found. Run `orbital` first.');
    process.exit(1);
  }

  const record = manifest.files[filePath];
  if (!record) {
    console.error(`File not tracked: ${filePath}`);
    process.exit(1);
  }
  if (record.origin === 'user') {
    console.error(`Cannot pin user-owned file: ${filePath}`);
    process.exit(1);
  }

  record.status = 'pinned';
  record.pinnedAt = new Date().toISOString();
  if (reason) record.pinnedReason = reason;

  mod.saveManifest(projectRoot, manifest);
  console.log(`Pinned: ${filePath}${reason ? ` (${reason})` : ''}`);
}

export async function cmdUnpin(args) {
  const projectRoot = detectProjectRoot();
  const filePath = args[0];

  if (!filePath) {
    console.error('Usage: orbital unpin <relative-path>');
    process.exit(1);
  }

  const mod = await loadSharedModule();
  const manifest = mod.loadManifest(projectRoot);
  if (!manifest) {
    console.error('No manifest found. Run `orbital` first.');
    process.exit(1);
  }

  const record = manifest.files[filePath];
  if (!record || record.status !== 'pinned') {
    console.error(`File is not pinned: ${filePath}`);
    process.exit(1);
  }

  record.status = 'synced';
  delete record.pinnedAt;
  delete record.pinnedReason;

  const absPath = path.join(projectRoot, '.claude', filePath);
  if (fs.existsSync(absPath)) {
    const currentHash = mod.hashFile(absPath);
    record.status = mod.computeFileStatus(record, currentHash);
  } else {
    record.status = 'synced';
  }

  mod.saveManifest(projectRoot, manifest);
  console.log(`Unpinned: ${filePath} (now ${record.status})`);
}

export async function cmdPins() {
  const projectRoot = detectProjectRoot();

  const mod = await loadSharedModule();
  const manifest = mod.loadManifest(projectRoot);
  if (!manifest) {
    console.error('No manifest found. Run `orbital` first.');
    process.exit(1);
  }

  const pinned = Object.entries(manifest.files)
    .filter(([, r]) => r.status === 'pinned');

  if (pinned.length === 0) {
    console.log('No pinned files.');
    return;
  }

  console.log(`\n  Pinned files:\n`);
  for (const [file, record] of pinned) {
    const reason = record.pinnedReason || '(no reason)';
    const date = record.pinnedAt ? new Date(record.pinnedAt).toLocaleDateString() : '';
    console.log(`  ${file}`);
    console.log(`    Reason: ${reason}  Pinned: ${date}`);
    if (record.templateHash !== record.installedHash) {
      console.log(`    Template has changed since pin — run 'orbital diff ${file}' to compare`);
    }
  }
  console.log();
}

export async function cmdDiff(args) {
  const projectRoot = detectProjectRoot();
  const filePath = args[0];

  if (!filePath) {
    console.error('Usage: orbital diff <relative-path>');
    process.exit(1);
  }

  const mod = await loadSharedModule();
  const manifest = mod.loadManifest(projectRoot);
  if (!manifest) {
    console.error('No manifest found. Run `orbital` first.');
    process.exit(1);
  }

  const record = manifest.files[filePath];
  if (!record || record.origin !== 'template') {
    console.error(`Not a template file: ${filePath}`);
    process.exit(1);
  }

  let templateRelPath = filePath;
  if (filePath.startsWith('config/workflows/')) {
    templateRelPath = filePath.replace('config/workflows/', 'presets/');
  }

  const templatePath = path.join(PACKAGE_ROOT, 'templates', templateRelPath);
  const localPath = path.join(projectRoot, '.claude', filePath);

  if (!fs.existsSync(templatePath)) {
    console.error(`Template file not found: ${templateRelPath}`);
    process.exit(1);
  }
  if (!fs.existsSync(localPath)) {
    console.log('Local file does not exist. Template content:');
    console.log(fs.readFileSync(templatePath, 'utf-8'));
    return;
  }

  try {
    const output = execFileSync(
      'git', ['diff', '--no-index', '--color', '--', templatePath, localPath],
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
    );
    console.log(output);
  } catch (e) {
    if (e.stdout) console.log(e.stdout);
    else console.log('Files differ but git diff is unavailable.');
  }
}

export async function cmdReset(args) {
  const projectRoot = detectProjectRoot();
  const filePath = args[0];

  if (!filePath) {
    console.error('Usage: orbital reset <relative-path>');
    process.exit(1);
  }

  const mod = await loadSharedModule();
  const manifest = mod.loadManifest(projectRoot);
  if (!manifest) {
    console.error('No manifest found. Run `orbital` first.');
    process.exit(1);
  }

  const record = manifest.files[filePath];
  if (!record || record.origin !== 'template') {
    console.error(`Not a template file: ${filePath}`);
    process.exit(1);
  }

  let templateRelPath = filePath;
  if (filePath.startsWith('config/workflows/')) {
    templateRelPath = filePath.replace('config/workflows/', 'presets/');
  }

  const templatePath = path.join(PACKAGE_ROOT, 'templates', templateRelPath);
  const localPath = path.join(projectRoot, '.claude', filePath);

  if (!fs.existsSync(templatePath)) {
    console.error(`Template file not found: ${templateRelPath}`);
    process.exit(1);
  }

  fs.copyFileSync(templatePath, localPath);
  const newHash = mod.hashFile(localPath);
  record.status = 'synced';
  record.templateHash = newHash;
  record.installedHash = newHash;
  delete record.pinnedAt;
  delete record.pinnedReason;

  mod.saveManifest(projectRoot, manifest);
  console.log(`Reset: ${filePath} → synced with template`);
}
