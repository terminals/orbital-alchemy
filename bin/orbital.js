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
  console.log(`Run \`orbital dev\` to start the development server.\n`);
}

function cmdDev() {
  const shouldOpen = process.argv.includes('--open');
  const projectRoot = detectProjectRoot();
  const config = loadConfig(projectRoot);
  const serverPort = config.serverPort || 4444;
  const clientPort = config.clientPort || 4445;

  console.log(`\nOrbital Command — dev`);
  console.log(`Project root: ${projectRoot}`);
  console.log(`Server: http://localhost:${serverPort}`);
  console.log(`Client: http://localhost:${clientPort}\n`);

  checkTemplatesStaleness(projectRoot);

  const env = {
    ...process.env,
    ORBITAL_PROJECT_ROOT: projectRoot,
    ORBITAL_SERVER_PORT: String(serverPort),
  };

  // Start the API server
  const tsxBin = resolveBin('tsx');
  const serverProcess = tsxBin
    ? spawn(tsxBin, ['watch', path.join(PACKAGE_ROOT, 'server', 'index.ts')],
        { stdio: 'inherit', env, cwd: PACKAGE_ROOT })
    : spawn('npx', ['tsx', 'watch', path.join(PACKAGE_ROOT, 'server', 'index.ts')],
        { stdio: 'inherit', env, cwd: PACKAGE_ROOT });

  // Start the Vite dev server
  const viteBin = resolveBin('vite');
  const viteProcess = viteBin
    ? spawn(viteBin, ['--config', path.join(PACKAGE_ROOT, 'vite.config.ts'), '--port', String(clientPort)],
        { stdio: 'inherit', env, cwd: PACKAGE_ROOT })
    : spawn('npx', ['vite', '--config', path.join(PACKAGE_ROOT, 'vite.config.ts'), '--port', String(clientPort)],
        { stdio: 'inherit', env, cwd: PACKAGE_ROOT });

  if (shouldOpen) {
    setTimeout(() => openBrowser(`http://localhost:${clientPort}`), 2000);
  }

  let exiting = false;

  function cleanup() {
    if (exiting) return;
    exiting = true;
    serverProcess.kill();
    viteProcess.kill();
    process.exit(0);
  }
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  serverProcess.on('exit', (code) => {
    if (exiting) return;
    exiting = true;
    console.log(`Server exited with code ${code}`);
    viteProcess.kill();
    process.exit(code || 0);
  });
  viteProcess.on('exit', (code) => {
    if (exiting) return;
    exiting = true;
    console.log(`Vite exited with code ${code}`);
    serverProcess.kill();
    process.exit(code || 0);
  });
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

function printHelp() {
  console.log(`
Orbital Command — CLI for the agentic project management system

Usage:
  orbital <command> [options]

Commands:
  init              Scaffold Orbital Command into the current project
  dev               Start the development server (API + Vite)
  build             Production build of the dashboard
  emit <TYPE> <JSON>  Emit an orbital event
  update            Re-copy hooks/skills/agents from package templates
  uninstall         Remove Orbital artifacts from the project

Init Options:
  --force           Overwrite existing hooks, skills, and agents
  --skip-plugins    Skip plugin installation
  --yes, -y         Auto-accept all prompts

Dev Options:
  --open            Open the dashboard in the default browser

Examples:
  orbital init
  orbital init --force
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
    case 'init':
      await cmdInit(args);
      break;
    case 'dev':
      cmdDev();
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
