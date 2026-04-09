import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { createLogger } from './utils/logger.js';

const log = createLogger('global-config');

// ─── Types ──────────────────────────────────────────────────

export interface ProjectRegistration {
  /** Slug ID derived from directory name, e.g. "orbital-command" */
  id: string;
  /** Absolute path to project root */
  path: string;
  /** Human-readable display name */
  name: string;
  /** HSL color string for project badge, e.g. "210 80% 55%" */
  color: string;
  /** ISO 8601 timestamp of registration */
  registeredAt: string;
  /** Can be disabled without removal */
  enabled: boolean;
}

export interface OrbitalGlobalConfig {
  version: 1;
  projects: ProjectRegistration[];
  privateMode?: boolean;
}

// ─── Constants ──────────────────────────────────────────────

/** Global Orbital Command directory */
export const ORBITAL_HOME = path.join(os.homedir(), '.orbital');

/** Path to the global registry file */
export const REGISTRY_PATH = path.join(ORBITAL_HOME, 'config.json');

/** Path to global primitives directory */
export const GLOBAL_PRIMITIVES_DIR = path.join(ORBITAL_HOME, 'primitives');

/** Path to global workflow config */
export const GLOBAL_WORKFLOW_PATH = path.join(ORBITAL_HOME, 'workflow.json');

/** Import from shared — re-exported for convenience */
import { PROJECT_COLORS } from '../shared/project-colors.js';
export { PROJECT_COLORS };

// ─── Slug Generation ────────────────────────────────────────

/**
 * Generate a project slug from a filesystem path.
 * Uses the directory basename, lowercased, with non-alphanumeric chars
 * replaced by hyphens. Deduplicates against existing IDs with a 4-char hash.
 */
export function generateProjectId(projectRoot: string, existingIds: string[]): string {
  const base = path.basename(projectRoot)
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  const slug = base || 'project';
  if (!existingIds.includes(slug)) return slug;

  // Collision — append 4-char hash of the full path
  const hash = crypto.createHash('sha256').update(projectRoot).digest('hex').slice(0, 4);
  return `${slug}-${hash}`;
}

// ─── Registry I/O ───────────────────────────────────────────

/** Ensure ~/.orbital/ directory structure exists, including primitives subdirectories. */
export function ensureOrbitalHome(): void {
  if (!fs.existsSync(ORBITAL_HOME)) {
    fs.mkdirSync(ORBITAL_HOME, { recursive: true });
    log.info('Created ~/.orbital/', { path: ORBITAL_HOME });
  }
  // Ensure primitives subdirectories exist so the global watcher can start
  for (const sub of ['agents', 'skills', 'hooks', 'config']) {
    const dir = path.join(GLOBAL_PRIMITIVES_DIR, sub);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }
}

/** Load the global registry. Creates default if missing. */
export function loadGlobalConfig(): OrbitalGlobalConfig {
  ensureOrbitalHome();

  if (!fs.existsSync(REGISTRY_PATH)) {
    const config: OrbitalGlobalConfig = { version: 1, projects: [] };
    saveGlobalConfig(config);
    return config;
  }

  try {
    const raw = fs.readFileSync(REGISTRY_PATH, 'utf-8');
    return JSON.parse(raw) as OrbitalGlobalConfig;
  } catch (err) {
    log.error('Failed to read global config, creating fresh', { error: String(err) });
    const config: OrbitalGlobalConfig = { version: 1, projects: [] };
    saveGlobalConfig(config);
    return config;
  }
}

/** Save the global registry atomically. */
export function saveGlobalConfig(config: OrbitalGlobalConfig): void {
  ensureOrbitalHome();
  const tmpPath = REGISTRY_PATH + '.tmp';
  fs.writeFileSync(tmpPath, JSON.stringify(config, null, 2), 'utf-8');
  fs.renameSync(tmpPath, REGISTRY_PATH);
}

// ─── Project Registration ───────────────────────────────────

/** Pick the next unused color from the palette. */
function nextColor(usedColors: string[]): string {
  const available = PROJECT_COLORS.filter(c => !usedColors.includes(c));
  return available[0] ?? PROJECT_COLORS[0];
}

/** Register a project in the global config. Returns the registration. */
export function registerProject(
  projectRoot: string,
  options?: { name?: string; color?: string },
): ProjectRegistration {
  const absPath = path.resolve(projectRoot);
  const config = loadGlobalConfig();

  // Check if already registered
  const existing = config.projects.find(p => p.path === absPath);
  if (existing) {
    log.info('Project already registered', { id: existing.id, path: absPath });
    return existing;
  }

  const existingIds = config.projects.map(p => p.id);
  const usedColors = config.projects.map(p => p.color);

  const registration: ProjectRegistration = {
    id: generateProjectId(absPath, existingIds),
    path: absPath,
    name: options?.name ?? path.basename(absPath),
    color: options?.color ?? nextColor(usedColors),
    registeredAt: new Date().toISOString(),
    enabled: true,
  };

  config.projects.push(registration);
  saveGlobalConfig(config);
  log.info('Project registered', { id: registration.id, path: absPath });

  return registration;
}

/** Unregister a project by ID or path. Returns true if found. */
export function unregisterProject(idOrPath: string): boolean {
  const config = loadGlobalConfig();
  const absPath = path.isAbsolute(idOrPath) ? idOrPath : path.resolve(idOrPath);

  const idx = config.projects.findIndex(
    p => p.id === idOrPath || p.path === absPath,
  );
  if (idx === -1) return false;

  const removed = config.projects.splice(idx, 1)[0];
  saveGlobalConfig(config);
  log.info('Project unregistered', { id: removed.id, path: removed.path });

  return true;
}

/** Update a project's registration (color, name, enabled). */
export function updateProject(
  id: string,
  updates: Partial<Pick<ProjectRegistration, 'name' | 'color' | 'enabled'>>,
): ProjectRegistration | null {
  const config = loadGlobalConfig();
  const project = config.projects.find(p => p.id === id);
  if (!project) return null;

  if (updates.name !== undefined) project.name = updates.name;
  if (updates.color !== undefined) project.color = updates.color;
  if (updates.enabled !== undefined) project.enabled = updates.enabled;

  saveGlobalConfig(config);
  return project;
}

/** Get all registered projects. */
export function getRegisteredProjects(): ProjectRegistration[] {
  return loadGlobalConfig().projects;
}

/** Find a registered project by ID. */
export function findProject(id: string): ProjectRegistration | undefined {
  return loadGlobalConfig().projects.find(p => p.id === id);
}
