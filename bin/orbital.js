#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { spawn, execFileSync } from 'child_process';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PACKAGE_ROOT = path.resolve(__dirname, '..');

/**
 * Resolve a package binary (e.g. 'tsx', 'vite') to an absolute path.
 * Checks PACKAGE_ROOT/node_modules/.bin first (global installs, non-hoisted),
 * then the parent node_modules/.bin (hoisted local installs where deps are
 * lifted to <project>/node_modules/.bin/). Returns null to fall back to npx.
 */
function resolveBin(name) {
  const local = path.join(PACKAGE_ROOT, 'node_modules', '.bin', name);
  if (fs.existsSync(local)) return local;
  const hoisted = path.join(PACKAGE_ROOT, '..', '.bin', name);
  if (fs.existsSync(hoisted)) return path.resolve(hoisted);
  return null;
}

// ---------------------------------------------------------------------------
// CLI Helpers
// ---------------------------------------------------------------------------

function getFlagValue(args, flag) {
  const idx = args.indexOf(flag);
  return idx !== -1 && idx + 1 < args.length ? args[idx + 1] : undefined;
}

function isGitRepo() {
  try {
    execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8', stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function detectProjectRoot() {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8', stdio: 'pipe' }).trim();
  } catch {
    return process.cwd();
  }
}

function requireGitRepo() {
  if (!isGitRepo()) {
    console.error('Not a git repository. Run `orbital` from inside a project directory.');
    process.exit(1);
  }
}

function loadConfig(projectRoot) {
  const configPath = path.join(projectRoot, '.claude', 'orbital.config.json');
  if (fs.existsSync(configPath)) {
    try {
      return JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch (err) {
      console.warn(`Warning: could not parse ${configPath}: ${err.message}`);
    }
  }
  return { serverPort: 4444, clientPort: 4445 };
}

function getPackageVersion() {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(PACKAGE_ROOT, 'package.json'), 'utf8'));
    return pkg.version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

function stampTemplateVersion(projectRoot) {
  const configPath = path.join(projectRoot, '.claude', 'orbital.config.json');
  if (!fs.existsSync(configPath)) return;

  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const version = getPackageVersion();
    if (config.templateVersion !== version) {
      config.templateVersion = version;
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf8');
      console.log(`  Stamped  templateVersion: ${version}`);
    }
  } catch { /* ignore malformed config */ }
}

function openBrowser(url) {
  const platform = process.platform;
  if (platform === 'darwin') {
    spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
  } else if (platform === 'win32') {
    spawn('cmd', ['/c', 'start', url], { detached: true, stdio: 'ignore' }).unref();
  } else {
    spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
  }
}

// ---------------------------------------------------------------------------
// Shared Module Loader
// ---------------------------------------------------------------------------

/**
 * Load the shared init module. Tries compiled JS first (production/global
 * installs via npm publish), then TypeScript source (dev via tsx).
 */
async function loadSharedModule() {
  try {
    return await import('../dist/server/server/init.js');
  } catch {
    try {
      return await import('../server/init.js');
    } catch {
      console.error('Error: Orbital Command server module not found.');
      console.error('Try reinstalling: npm install -g orbital-command');
      console.error('For local development: npm run build:server');
      process.exit(1);
    }
  }
}

/**
 * Load the interactive wizard module.
 */
async function loadWizardModule() {
  try {
    return await import('../dist/server/server/wizard/index.js');
  } catch {
    try {
      return await import('../server/wizard/index.js');
    } catch {
      console.error('Error: Wizard module not found.');
      console.error('Try reinstalling: npm install -g orbital-command');
      process.exit(1);
    }
  }
}

// ---------------------------------------------------------------------------
// Multi-project registry
// ---------------------------------------------------------------------------

const ORBITAL_HOME = path.join(process.env.HOME || process.env.USERPROFILE || '~', '.orbital');
const REGISTRY_PATH = path.join(ORBITAL_HOME, 'config.json');

function loadRegistry() {
  if (!fs.existsSync(REGISTRY_PATH)) return { version: 1, projects: [] };
  try {
    return JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
  } catch {
    return { version: 1, projects: [] };
  }
}

function writeRegistryAtomic(registry) {
  if (!fs.existsSync(ORBITAL_HOME)) fs.mkdirSync(ORBITAL_HOME, { recursive: true });
  const tmp = REGISTRY_PATH + `.tmp.${process.pid}`;
  try {
    fs.writeFileSync(tmp, JSON.stringify(registry, null, 2), 'utf8');
    fs.renameSync(tmp, REGISTRY_PATH);
  } catch (err) {
    try { fs.unlinkSync(tmp); } catch { /* best-effort */ }
    throw err;
  }
}

function orbitalSetupDone() {
  return fs.existsSync(path.join(ORBITAL_HOME, 'config.json'));
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

function cmdLaunchOrDev(forceViteFlag) {
  const shouldOpen = process.argv.includes('--open');
  const forceVite = forceViteFlag || process.argv.includes('--vite');
  const projectRoot = detectProjectRoot();
  const config = loadConfig(projectRoot);
  const serverPort = config.serverPort || 4444;
  const clientPort = config.clientPort || 4445;

  // Detect packaged mode: dist/index.html exists → serve pre-built frontend
  const hasPrebuiltFrontend = fs.existsSync(path.join(PACKAGE_ROOT, 'dist', 'index.html'));
  const useVite = forceVite || !hasPrebuiltFrontend;

  // Detect compiled server: dist/server/server/launch.js exists → run with node
  const compiledServer = path.join(PACKAGE_ROOT, 'dist', 'server', 'server', 'launch.js');
  const hasCompiledServer = fs.existsSync(compiledServer);
  const useCompiledServer = hasCompiledServer && !useVite;

  console.log(`\nOrbital Command — ${useVite ? 'dev' : 'launch'}`);
  console.log(`Project root: ${projectRoot}`);
  if (useVite) {
    console.log(`Server: http://localhost:${serverPort}`);
    console.log(`Client: http://localhost:${clientPort} (Vite dev server)\n`);
  } else {
    console.log(`Dashboard: http://localhost:${serverPort}\n`);
  }

  const env = {
    ...process.env,
    ORBITAL_LAUNCH_MODE: 'central',
    ORBITAL_AUTO_REGISTER: projectRoot,
    ORBITAL_SERVER_PORT: String(serverPort),
  };

  let serverProcess;

  if (useCompiledServer) {
    serverProcess = spawn(process.execPath, [compiledServer],
      { stdio: 'inherit', env, cwd: PACKAGE_ROOT });
  } else {
    const tsxBin = resolveBin('tsx');
    const serverScript = path.join(PACKAGE_ROOT, 'server', 'launch.ts');
    if (tsxBin) {
      serverProcess = spawn(tsxBin, ['watch', serverScript],
        { stdio: 'inherit', env, cwd: PACKAGE_ROOT });
    } else {
      console.error('Error: tsx not found. Install it with: npm install tsx');
      process.exit(1);
    }
  }

  let viteProcess = null;

  if (useVite) {
    const viteBin = resolveBin('vite');
    if (!viteBin) {
      console.error('Error: vite not found. Install it with: npm install vite');
      process.exit(1);
    }
    viteProcess = spawn(viteBin, ['--config', path.join(PACKAGE_ROOT, 'vite.config.ts'), '--port', String(clientPort)],
      { stdio: 'inherit', env, cwd: PACKAGE_ROOT });
  }

  const dashboardUrl = useVite
    ? `http://localhost:${clientPort}`
    : `http://localhost:${serverPort}`;

  if (shouldOpen) {
    setTimeout(() => openBrowser(dashboardUrl), 2000);
  }

  let exiting = false;

  function cleanup() {
    if (exiting) return;
    exiting = true;
    serverProcess.kill();
    if (viteProcess) viteProcess.kill();
    process.exit(0);
  }
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  serverProcess.on('exit', (code) => {
    if (exiting) return;
    exiting = true;
    console.log(`Server exited with code ${code}`);
    if (viteProcess) viteProcess.kill();
    process.exit(code || 0);
  });
  if (viteProcess) {
    viteProcess.on('exit', (code) => {
      if (exiting) return;
      exiting = true;
      console.log(`Vite exited with code ${code}`);
      serverProcess.kill();
      process.exit(code || 0);
    });
  }
}

function cmdBuild() {
  console.log(`\nOrbital Command — build\n`);

  const viteBin = resolveBin('vite');
  if (!viteBin) {
    console.error('Error: vite not found. Install it with: npm install vite');
    process.exit(1);
  }
  const buildProcess = spawn(viteBin, ['build', '--config', path.join(PACKAGE_ROOT, 'vite.config.ts')],
    { stdio: 'inherit', cwd: PACKAGE_ROOT });

  buildProcess.on('exit', (code) => {
    process.exit(code || 0);
  });
}

function cmdEmit(args) {
  const type = args[0];
  const jsonStr = args.slice(1).join(' ');

  if (!type) {
    console.error('Usage: orbital emit <TYPE> <JSON>');
    process.exit(1);
  }

  const projectRoot = detectProjectRoot();
  const eventsDir = path.join(projectRoot, '.claude', 'orbital-events');
  if (!fs.existsSync(eventsDir)) fs.mkdirSync(eventsDir, { recursive: true });

  let payload;
  try {
    payload = jsonStr ? JSON.parse(jsonStr) : {};
  } catch (err) {
    console.error(`Invalid JSON: ${err.message}`);
    process.exit(1);
  }

  const eventId = crypto.randomUUID();
  const event = {
    ...payload,
    id: eventId,
    type,
    timestamp: new Date().toISOString(),
  };

  const filePath = path.join(eventsDir, `${eventId}.json`);
  fs.writeFileSync(filePath, JSON.stringify(event, null, 2) + '\n', 'utf8');

  console.log(`Event emitted: ${type} (${eventId})`);
  console.log(`  File: ${path.relative(projectRoot, filePath)}`);
}

async function cmdUpdate(args) {
  const projectRoot = detectProjectRoot();
  const dryRun = args.includes('--dry-run');

  const { runUpdate } = await loadSharedModule();
  runUpdate(projectRoot, { dryRun });

  if (!dryRun) stampTemplateVersion(projectRoot);
}

async function cmdUninstall(args) {
  const projectRoot = detectProjectRoot();
  const dryRun = args.includes('--dry-run');
  const keepConfig = args.includes('--keep-config');

  const { runUninstall } = await loadSharedModule();
  runUninstall(projectRoot, { dryRun, keepConfig });
}

// ---------------------------------------------------------------------------
// Manifest management commands
// ---------------------------------------------------------------------------

async function cmdValidate() {
  const projectRoot = detectProjectRoot();

  const mod = await loadSharedModule();
  const report = mod.validate(projectRoot, getPackageVersion());
  console.log(mod.formatValidationReport(report));
  process.exit(report.errors > 0 ? 1 : 0);
}

async function cmdStatus() {
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

async function cmdPin(args) {
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

async function cmdUnpin(args) {
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

async function cmdPins() {
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

async function cmdDiff(args) {
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

async function cmdReset(args) {
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

// ---------------------------------------------------------------------------
// Multi-project commands
// ---------------------------------------------------------------------------

function cmdRegister(args) {
  const targetPath = args[0] ? path.resolve(args[0]) : detectProjectRoot();
  const nameFlag = args.indexOf('--alias');
  const name = nameFlag >= 0 ? args[nameFlag + 1] : path.basename(targetPath);

  if (!fs.existsSync(ORBITAL_HOME)) fs.mkdirSync(ORBITAL_HOME, { recursive: true });

  if (!fs.existsSync(path.join(targetPath, '.claude'))) {
    console.error(`Error: ${targetPath} has not been initialized with Orbital Command.`);
    console.error(`Run \`orbital\` in that directory first.`);
    process.exit(1);
  }

  const registry = loadRegistry();

  if (registry.projects?.some(p => p.path === targetPath)) {
    console.log(`Project already registered: ${targetPath}`);
    return;
  }

  const COLORS = [
    '210 80% 55%', '340 75% 55%', '160 60% 45%', '30 90% 55%',
    '270 65% 55%', '50 85% 50%', '180 55% 45%', '0 70% 55%',
    '120 50% 42%', '300 60% 50%', '200 70% 50%', '15 80% 55%',
  ];
  const usedColors = (registry.projects || []).map(p => p.color);
  const color = COLORS.find(c => !usedColors.includes(c)) || COLORS[0];

  const baseSlug = path.basename(targetPath).toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'project';
  const existingIds = (registry.projects || []).map(p => p.id);
  const slug = existingIds.includes(baseSlug)
    ? `${baseSlug}-${crypto.createHash('sha256').update(targetPath).digest('hex').slice(0, 4)}`
    : baseSlug;

  const project = {
    id: slug,
    path: targetPath,
    name,
    color,
    registeredAt: new Date().toISOString(),
    enabled: true,
  };

  if (!registry.projects) registry.projects = [];
  registry.projects.push(project);
  writeRegistryAtomic(registry);

  console.log(`Registered project: ${name}`);
  console.log(`  ID:    ${slug}`);
  console.log(`  Path:  ${targetPath}`);
  console.log(`  Color: ${color}`);
}

function cmdUnregister(args) {
  const idOrPath = args[0];
  if (!idOrPath) {
    console.error('Usage: orbital unregister <id-or-path>');
    process.exit(1);
  }

  const absPath = path.isAbsolute(idOrPath) ? idOrPath : path.resolve(idOrPath);
  const registry = loadRegistry();
  const idx = (registry.projects || []).findIndex(p => p.id === idOrPath || p.path === absPath);

  if (idx === -1) {
    console.error(`Project not found: ${idOrPath}`);
    process.exit(1);
  }

  const removed = registry.projects.splice(idx, 1)[0];
  writeRegistryAtomic(registry);

  console.log(`Unregistered project: ${removed.name} (${removed.id})`);
  console.log(`  Project files in ${removed.path} are preserved.`);
}

function cmdProjects() {
  const registry = loadRegistry();
  const projects = registry.projects || [];

  if (projects.length === 0) {
    console.log('\nNo projects registered.');
    console.log('Run `orbital` in a project directory to get started.\n');
    return;
  }

  console.log(`\n  ${'ID'.padEnd(22)} ${'NAME'.padEnd(22)} ${'STATUS'.padEnd(10)} PATH`);
  console.log(`  ${'─'.repeat(22)} ${'─'.repeat(22)} ${'─'.repeat(10)} ${'─'.repeat(30)}`);
  for (const p of projects) {
    const status = p.enabled ? (fs.existsSync(p.path) ? 'active' : 'offline') : 'disabled';
    console.log(`  ${p.id.padEnd(22)} ${p.name.padEnd(22)} ${status.padEnd(10)} ${p.path}`);
  }
  console.log();
}

async function cmdConfig(args) {
  const { runConfigEditor } = await loadWizardModule();
  const projectRoot = detectProjectRoot();
  const version = getPackageVersion();
  await runConfigEditor(projectRoot, version, args);
}

async function cmdDoctor() {
  const { runDoctor } = await loadWizardModule();
  const projectRoot = detectProjectRoot();
  const version = getPackageVersion();
  await runDoctor(projectRoot, version);
}

function printHelp() {
  console.log(`
Orbital Command — mission control for Claude Code projects

Usage:
  orbital                Context-aware hub (setup, launch, config, etc.)
  orbital <command>      Run a specific command directly

Commands:
  config            Modify project settings interactively
  doctor            Health check and version diagnostics
  update            Sync templates and apply migrations
  status            Show template sync status

Template Management:
  validate          Check cross-references and consistency
  pin <path>        Lock a file from updates
  unpin <path>      Unlock a pinned file
  pins              List all pinned files
  diff <path>       Show diff between template and local file
  reset <path>      Restore a file from the current template

Project Management:
  register [path]   Register a project with the dashboard
  unregister <id>   Remove a project from the dashboard
  projects          List all registered projects

Development:
  dev               Start with Vite dev server (HMR)
  build             Production build of the dashboard frontend

Other:
  emit <TYPE> <JSON>  Emit an orbital event
  uninstall         Remove Orbital artifacts from the project

Update Options:
  --dry-run         Preview changes without applying them

Uninstall Options:
  --dry-run         Preview removal without applying
  --keep-config     Keep orbital.config.json for re-initialization

Examples:
  orbital              # hub menu — setup, launch, config, etc.
  orbital config       # modify project settings directly
  orbital update       # sync templates to latest version
`);
}

// ---------------------------------------------------------------------------
// Hub Flow — the primary entry point
// ---------------------------------------------------------------------------

async function runHubFlow() {
  if (!process.stdout.isTTY || process.env.CI) {
    printHelp();
    return;
  }

  const wiz = await loadWizardModule();
  const hubVersion = getPackageVersion();

  // First-time global setup — no menu, just run the wizard
  if (!orbitalSetupDone()) {
    await wiz.runSetupWizard(hubVersion);
    return;
  }

  // Need a git repo for everything else
  if (!isGitRepo()) {
    requireGitRepo(); // exits with error
    return;
  }

  const hubRoot = detectProjectRoot();
  const isInitialized = fs.existsSync(
    path.join(hubRoot, '.claude', 'orbital.config.json')
  );
  const hubRegistry = loadRegistry();
  const projectNames = (hubRegistry.projects || []).map(p => p.name);

  // Not initialized and no registered projects — just run setup wizard
  if (!isInitialized && projectNames.length === 0) {
    await wiz.runProjectSetup(hubRoot, hubVersion, []);
    stampTemplateVersion(hubRoot);
    return;
  }

  // Show hub menu (initialized OR has registered projects)
  const projects = (hubRegistry.projects || [])
    .filter(p => p.enabled !== false)
    .map(p => ({ name: p.name, path: p.path }));

  const hubResult = await wiz.runHub({
    packageVersion: hubVersion,
    isProjectInitialized: isInitialized,
    projectNames,
    itermPromptShown: hubRegistry.itermPromptShown === true,
    isMac: process.platform === 'darwin',
    lastUpdateCheck: hubRegistry.lastUpdateCheck,
    latestVersion: hubRegistry.latestVersion,
    projectPaths: projects,
  });

  // Persist registry changes in one write
  let registryChanged = false;
  if (hubResult.setItermPromptShown) {
    hubRegistry.itermPromptShown = true;
    registryChanged = true;
  }
  if (hubResult.updateCache) {
    hubRegistry.lastUpdateCheck = hubResult.updateCache.lastUpdateCheck;
    hubRegistry.latestVersion = hubResult.updateCache.latestVersion;
    registryChanged = true;
  }
  if (registryChanged) {
    writeRegistryAtomic(hubRegistry);
  }

  // Route the chosen action
  switch (hubResult.action) {
    case 'launch': cmdLaunchOrDev(false); break;
    case 'init':
      await wiz.runProjectSetup(hubRoot, hubVersion, []);
      stampTemplateVersion(hubRoot);
      break;
    case 'config': await cmdConfig([]); break;
    case 'doctor': await cmdDoctor(); break;
    case 'update': await cmdUpdate([]); break;
    case 'status': await cmdStatus(); break;
    case 'reset': {
      const { runInit } = await loadSharedModule();
      runInit(hubRoot, { force: true });
      stampTemplateVersion(hubRoot);
      break;
    }
    default:
      console.error(`Unknown action: ${hubResult.action}`);
      process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const [command, ...args] = process.argv.slice(2);

async function main() {
  switch (command) {
    // Deprecated commands — silently redirect to hub
    case 'init':
    case 'setup':
    case 'launch':
    case undefined:
      await runHubFlow();
      break;

    // Active commands
    case 'config':
      await cmdConfig(args);
      break;
    case 'doctor':
      await cmdDoctor();
      break;
    case 'dev':
      cmdLaunchOrDev(true);
      break;
    case 'register':
      cmdRegister(args);
      break;
    case 'unregister':
      cmdUnregister(args);
      break;
    case 'projects':
      cmdProjects();
      break;
    case 'build':
      cmdBuild();
      break;
    case 'emit':
      cmdEmit(args);
      break;
    case 'update':
      await cmdUpdate(args);
      break;
    case 'uninstall':
      await cmdUninstall(args);
      break;
    case 'status':
      await cmdStatus();
      break;
    case 'validate':
      await cmdValidate();
      break;
    case 'pin':
      await cmdPin(args);
      break;
    case 'unpin':
      await cmdUnpin(args);
      break;
    case 'pins':
      await cmdPins();
      break;
    case 'diff':
      await cmdDiff(args);
      break;
    case 'reset':
      await cmdReset(args);
      break;
    case 'private': {
      const registry = loadRegistry();
      const enable = args[0] !== 'off';
      registry.privateMode = enable;
      writeRegistryAtomic(registry);
      console.log(`Private mode ${enable ? 'enabled' : 'disabled'} globally.`);
      break;
    }
    case 'help':
    case '--help':
    case '-h':
      printHelp();
      break;
    default:
      console.error(`Unknown command: ${command}`);
      printHelp();
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
