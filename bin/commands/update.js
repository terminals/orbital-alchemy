import fs from 'fs';
import path from 'path';
import {
  detectProjectRoot,
  getPackageVersion,
  loadSharedModule,
} from '../lib/helpers.js';

export async function cmdUpdate(args) {
  const projectRoot = detectProjectRoot();
  const dryRun = args.includes('--dry-run');

  const { runUpdate } = await loadSharedModule();
  runUpdate(projectRoot, { dryRun });

  if (!dryRun) {
    const configPath = path.join(projectRoot, '.claude', 'orbital.config.json');
    if (fs.existsSync(configPath)) {
      try {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        const version = getPackageVersion();
        if (config.templateVersion !== version) {
          config.templateVersion = version;
          const tmp = configPath + `.tmp.${process.pid}`;
          fs.writeFileSync(tmp, JSON.stringify(config, null, 2) + '\n', 'utf8');
          fs.renameSync(tmp, configPath);
        }
      } catch { /* ignore malformed config */ }
    }
  }
}

export async function cmdUninstall(args) {
  const projectRoot = detectProjectRoot();
  const dryRun = args.includes('--dry-run');
  const keepConfig = args.includes('--keep-config');

  const { runUninstall } = await loadSharedModule();
  runUninstall(projectRoot, { dryRun, keepConfig });
}
