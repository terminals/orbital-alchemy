import {
  detectProjectRoot,
  getPackageVersion,
  loadWizardModule,
} from '../lib/helpers.js';

export async function cmdConfig(args) {
  const { runConfigEditor } = await loadWizardModule();
  const projectRoot = detectProjectRoot();
  const version = getPackageVersion();
  await runConfigEditor(projectRoot, version, args);
}

export async function cmdDoctor() {
  const { runDoctor } = await loadWizardModule();
  const projectRoot = detectProjectRoot();
  const version = getPackageVersion();
  await runDoctor(projectRoot, version);
}
