import {
  detectProjectRoot,
  stampTemplateVersion,
  loadSharedModule,
} from '../lib/helpers.js';

export async function cmdUpdate(args) {
  const projectRoot = detectProjectRoot();
  const dryRun = args.includes('--dry-run');

  const { runUpdate } = await loadSharedModule();
  runUpdate(projectRoot, { dryRun });

  if (!dryRun) stampTemplateVersion(projectRoot);
}

export async function cmdUninstall(args) {
  const projectRoot = detectProjectRoot();
  const dryRun = args.includes('--dry-run');
  const keepConfig = args.includes('--keep-config');

  const { runUninstall } = await loadSharedModule();
  runUninstall(projectRoot, { dryRun, keepConfig });
}
