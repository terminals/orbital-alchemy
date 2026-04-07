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

function detectProjectRoot() {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
  } catch {
    return process.cwd();
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

function checkTemplatesStaleness(projectRoot) {
  const configPath = path.join(projectRoot, '.claude', 'orbital.config.json');
  if (!fs.existsSync(configPath)) return;

  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const projectVersion = config.templateVersion || null;
    const packageVersion = getPackageVersion();

    if (projectVersion && projectVersion === packageVersion) return;

    if (projectVersion) {
      console.log(`\n  ⚠ Templates outdated (project: v${projectVersion}, package: v${packageVersion})`);
    } else {
      console.log(`\n  ⚠ Templates have no version stamp`);
    }
    console.log(`    Run \`orbital update\` to refresh templates.\n`);
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
    // Production: compiled JS (tsconfig.server.json outputs to dist/server/server/)
    return await import('../dist/server/server/init.js');
  } catch {
    try {
      // Dev: TypeScript source loaded via tsx
      return await import('../server/init.js');
    } catch {
      console.error('Error: Orbital Command server module not found.');
      console.error('Try reinstalling: npm install -g orbital-command');
      console.error('For local development: npm run build:server');
      process.exit(1);
    }
  }
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

async function cmdInit(args) {
  const force = args.includes('--force');
  const projectRoot = detectProjectRoot();

  const { runInit } = await loadSharedModule();
  runInit(projectRoot, { force });

  stampTemplateVersion(projectRoot);

  // Auto-register with central server if ~/.orbital/ exists
  if (fs.existsSync(ORBITAL_HOME)) {
    const registry = loadRegistry();
    const alreadyRegistered = (registry.projects || []).some(p => p.path === projectRoot);
    if (!alreadyRegistered) {
      cmdRegister([projectRoot]);
      console.log(`  Auto-registered with Orbital Command central server.`);
    }
  }

  console.log(`Run \`orbital launch\` to start the dashboard.\n`);
}

function cmdDev() {
  const shouldOpen = process.argv.includes('--open');
  const forceVite = process.argv.includes('--vite');
  const projectRoot = detectProjectRoot();
  const config = loadConfig(projectRoot);
  const serverPort = config.serverPort || 4444;
  const clientPort = config.clientPort || 4445;

  // Detect packaged mode: dist/index.html exists → serve pre-built frontend
  const hasPrebuiltFrontend = fs.existsSync(path.join(PACKAGE_ROOT, 'dist', 'index.html'));
  const useVite = forceVite || !hasPrebuiltFrontend;

  console.log(`\nOrbital Command — dev`);
  console.log(`Project root: ${projectRoot}`);
  if (useVite) {
    console.log(`Server: http://localhost:${serverPort}`);
    console.log(`Client: http://localhost:${clientPort} (Vite dev server)\n`);
  } else {
    console.log(`Dashboard: http://localhost:${serverPort}\n`);
  }

  checkTemplatesStaleness(projectRoot);

  const env = {
    ...process.env,
    ORBITAL_PROJECT_ROOT: projectRoot,
    ORBITAL_SERVER_PORT: String(serverPort),
  };

  // Start the API server (serves pre-built frontend from dist/ when available)
  const tsxBin = resolveBin('tsx');
  const serverProcess = tsxBin
    ? spawn(tsxBin, ['watch', path.join(PACKAGE_ROOT, 'server', 'index.ts')],
        { stdio: 'inherit', env, cwd: PACKAGE_ROOT })
    : spawn('npx', ['tsx', 'watch', path.join(PACKAGE_ROOT, 'server', 'index.ts')],
        { stdio: 'inherit', env, cwd: PACKAGE_ROOT });

  let viteProcess = null;

  if (useVite) {
    // Development mode: spawn Vite for HMR
    const viteBin = resolveBin('vite');
    viteProcess = viteBin
      ? spawn(viteBin, ['--config', path.join(PACKAGE_ROOT, 'vite.config.ts'), '--port', String(clientPort)],
          { stdio: 'inherit', env, cwd: PACKAGE_ROOT })
      : spawn('npx', ['vite', '--config', path.join(PACKAGE_ROOT, 'vite.config.ts'), '--port', String(clientPort)],
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
  const buildProcess = viteBin
    ? spawn(viteBin, ['build', '--config', path.join(PACKAGE_ROOT, 'vite.config.ts')],
        { stdio: 'inherit', cwd: PACKAGE_ROOT })
    : spawn('npx', ['vite', 'build', '--config', path.join(PACKAGE_ROOT, 'vite.config.ts')],
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

async function cmdUpdate() {
  const projectRoot = detectProjectRoot();

  const { runUpdate } = await loadSharedModule();
  runUpdate(projectRoot);

  stampTemplateVersion(projectRoot);
}

async function cmdUninstall() {
  const projectRoot = detectProjectRoot();

  const { runUninstall } = await loadSharedModule();
  runUninstall(projectRoot);
}

// ---------------------------------------------------------------------------
// Multi-project commands
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

async function cmdLaunch() {
  const shouldOpen = process.argv.includes('--open');
  const projectRoot = detectProjectRoot();

  // Ensure ~/.orbital/ exists
  if (!fs.existsSync(ORBITAL_HOME)) fs.mkdirSync(ORBITAL_HOME, { recursive: true });

  const registry = loadRegistry();
  const projectCount = registry.projects?.length || 0;

  console.log(`\nOrbital Command — launch`);
  console.log(`Projects registered: ${projectCount}`);
  if (projectCount === 0) {
    console.log(`Auto-registering current project: ${projectRoot}`);
  }
  console.log();

  // Use tsx to run the server with the central server entry
  const env = {
    ...process.env,
    ORBITAL_LAUNCH_MODE: 'central',
    ORBITAL_AUTO_REGISTER: projectCount === 0 ? projectRoot : '',
    ORBITAL_SERVER_PORT: String(process.env.ORBITAL_SERVER_PORT || '4444'),
  };

  const tsxBin = resolveBin('tsx');
  const serverScript = path.join(PACKAGE_ROOT, 'server', 'launch.ts');

  // Check if launch.ts exists, fall back to inline startup
  const serverProcess = tsxBin
    ? spawn(tsxBin, ['watch', serverScript], { stdio: 'inherit', env, cwd: PACKAGE_ROOT })
    : spawn('npx', ['tsx', 'watch', serverScript], { stdio: 'inherit', env, cwd: PACKAGE_ROOT });

  if (shouldOpen) {
    const port = env.ORBITAL_SERVER_PORT;
    setTimeout(() => openBrowser(`http://localhost:${port}`), 2500);
  }

  let exiting = false;
  function cleanup() {
    if (exiting) return;
    exiting = true;
    serverProcess.kill();
    process.exit(0);
  }
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  serverProcess.on('exit', (code) => {
    if (!exiting) process.exit(code || 0);
  });
}

function cmdRegister(args) {
  const targetPath = args[0] ? path.resolve(args[0]) : detectProjectRoot();
  const nameFlag = args.indexOf('--alias');
  const name = nameFlag >= 0 ? args[nameFlag + 1] : path.basename(targetPath);

  // Ensure ~/.orbital/ exists
  if (!fs.existsSync(ORBITAL_HOME)) fs.mkdirSync(ORBITAL_HOME, { recursive: true });

  // Check the project has been initialized
  if (!fs.existsSync(path.join(targetPath, '.claude'))) {
    console.error(`Error: ${targetPath} has not been initialized with Orbital Command.`);
    console.error(`Run \`orbital init\` in that directory first.`);
    process.exit(1);
  }

  const registry = loadRegistry();

  // Check if already registered
  if (registry.projects?.some(p => p.path === targetPath)) {
    console.log(`Project already registered: ${targetPath}`);
    return;
  }

  // Color palette
  const COLORS = [
    '210 80% 55%', '340 75% 55%', '160 60% 45%', '30 90% 55%',
    '270 65% 55%', '50 85% 50%', '180 55% 45%', '0 70% 55%',
    '120 50% 42%', '300 60% 50%', '200 70% 50%', '15 80% 55%',
  ];
  const usedColors = (registry.projects || []).map(p => p.color);
  const color = COLORS.find(c => !usedColors.includes(c)) || COLORS[0];

  // Generate slug
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
  fs.writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2), 'utf8');

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
  fs.writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2), 'utf8');

  console.log(`Unregistered project: ${removed.name} (${removed.id})`);
  console.log(`  Project files in ${removed.path} are preserved.`);
}

function cmdProjects() {
  const registry = loadRegistry();
  const projects = registry.projects || [];

  if (projects.length === 0) {
    console.log('\nNo projects registered.');
    console.log('Use `orbital register` or `orbital init` to add a project.\n');
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

function printHelp() {
  console.log(`
Orbital Command — CLI for the agentic project management system

Usage:
  orbital <command> [options]

Commands:
  launch            Start Orbital Command (multi-project central server)
  init              Scaffold Orbital Command into the current project
  dev               Start single-project dashboard (legacy, use 'launch' instead)
  register [path]   Register a project with the central server
  unregister <id>   Remove a project from the central server
  projects          List all registered projects
  build             Production build of the dashboard
  emit <TYPE> <JSON>  Emit an orbital event
  update            Re-copy hooks/skills/agents from package templates
  uninstall         Remove Orbital artifacts from the project

Launch Options:
  --open            Open the dashboard in the default browser

Init Options:
  --force           Overwrite existing hooks, skills, and agents
  --skip-plugins    Skip plugin installation
  --yes, -y         Auto-accept all prompts

Dev Options:
  --open            Open the dashboard in the default browser
  --vite            Force Vite dev server (for local development with HMR)

Examples:
  orbital launch
  orbital launch --open
  orbital init
  orbital register ~/code/my-project
  orbital dev
  orbital dev --open
  orbital emit SCOPE_TRANSITION '{"scope":"042","from":"implementing","to":"review"}'
  orbital update
  orbital uninstall
`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const [command, ...args] = process.argv.slice(2);

async function main() {
  switch (command) {
    case 'launch':
      await cmdLaunch();
      break;
    case 'init':
      await cmdInit(args);
      break;
    case 'dev':
      cmdDev();
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
      await cmdUpdate();
      break;
    case 'uninstall':
      await cmdUninstall();
      break;
    case 'help':
    case '--help':
    case '-h':
      printHelp();
      break;
    case undefined:
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
