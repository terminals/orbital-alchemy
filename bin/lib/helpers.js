import fs from 'fs';
import path from 'path';
import { execFileSync, spawn } from 'child_process';
import { fileURLToPath } from 'url';

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const PACKAGE_ROOT = path.resolve(__dirname, '..', '..');

// ---------------------------------------------------------------------------
// Multi-project registry paths
// ---------------------------------------------------------------------------
export const ORBITAL_HOME = path.join(process.env.HOME || process.env.USERPROFILE || '~', '.orbital');
export const REGISTRY_PATH = path.join(ORBITAL_HOME, 'config.json');

// ---------------------------------------------------------------------------
// CLI Helpers
// ---------------------------------------------------------------------------

export function getFlagValue(args, flag) {
  const idx = args.indexOf(flag);
  return idx !== -1 && idx + 1 < args.length ? args[idx + 1] : undefined;
}

/**
 * Resolve a package binary (e.g. 'tsx', 'vite') to an absolute path.
 * Checks PACKAGE_ROOT/node_modules/.bin first (global installs, non-hoisted),
 * then the parent node_modules/.bin (hoisted local installs where deps are
 * lifted to <project>/node_modules/.bin/). Returns null to fall back to npx.
 */
export function resolveBin(name) {
  const local = path.join(PACKAGE_ROOT, 'node_modules', '.bin', name);
  if (fs.existsSync(local)) return local;
  const hoisted = path.join(PACKAGE_ROOT, '..', '.bin', name);
  if (fs.existsSync(hoisted)) return path.resolve(hoisted);
  return null;
}

export function detectProjectRoot() {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8', stdio: 'pipe' }).trim();
  } catch {
    return process.cwd();
  }
}

export function loadConfig(projectRoot) {
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

export function getPackageVersion() {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(PACKAGE_ROOT, 'package.json'), 'utf8'));
    return pkg.version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

export function openBrowser(url) {
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
// Shared Module Loaders
// ---------------------------------------------------------------------------

/**
 * Load the shared init module. Tries compiled JS first (production/global
 * installs via npm publish), then TypeScript source (dev via tsx).
 */
export async function loadSharedModule() {
  try {
    return await import('../../dist/server/server/init.js');
  } catch {
    try {
      return await import('../../server/init.js');
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
export async function loadWizardModule() {
  try {
    return await import('../../dist/server/server/wizard/index.js');
  } catch {
    try {
      return await import('../../server/wizard/index.js');
    } catch {
      console.error('Error: Wizard module not found.');
      console.error('Try reinstalling: npm install -g orbital-command');
      process.exit(1);
    }
  }
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export function loadRegistry() {
  if (!fs.existsSync(REGISTRY_PATH)) return { version: 1, projects: [] };
  try {
    return JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
  } catch {
    return { version: 1, projects: [] };
  }
}

export function writeRegistryAtomic(registry) {
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

export function orbitalSetupDone() {
  return fs.existsSync(path.join(ORBITAL_HOME, 'config.json'));
}

export function printHelp() {
  console.log(`
Orbital Command — mission control for Claude Code projects

Usage:
  orbital                Context-aware hub (setup, launch, config, etc.)
  orbital <command>      Run a specific command directly

Commands:
  launch            Launch the dashboard directly
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
