/**
 * Config migration runner for orbital.config.json.
 *
 * Applies incremental, idempotent migrations when upgrading between
 * package versions. Also fills schema defaults for new fields that
 * don't require explicit migration logic.
 */

import fs from 'fs';
import type { ConfigMigration } from './manifest-types.js';

// ─── Migration Registry ─────────────────────────────────────

/**
 * All config migrations, ordered by target version.
 *
 * Rules:
 * - Each migration MUST be idempotent (safe to run twice)
 * - Each migration MUST check before applying (don't blindly overwrite)
 * - ID format: "fromVersion->toVersion"
 */
const MIGRATIONS: ConfigMigration[] = [
  // Future migrations go here. Example:
  // {
  //   id: '0.2.0->0.3.0',
  //   description: 'Add notifications config section',
  //   migrate: (config) => {
  //     if (!('notifications' in config)) {
  //       config.notifications = { enabled: false };
  //     }
  //     return config;
  //   },
  // },
];

// ─── Schema Defaults ────────────────────────────────────────

/** Default values from the schema, keyed by property path. */
const SCHEMA_DEFAULTS: Record<string, unknown> = {
  projectName: 'My Project',
  scopesDir: 'scopes',
  eventsDir: '.claude/orbital-events',
  dbDir: '.claude/orbital',
  configDir: '.claude/config',
  serverPort: 4444,
  clientPort: 4445,
  logLevel: 'info',
  categories: ['feature', 'bugfix', 'refactor', 'infrastructure', 'docs'],
};

const NESTED_DEFAULTS: Record<string, Record<string, unknown>> = {
  terminal: {
    adapter: 'auto',
    profilePrefix: 'Orbital',
  },
  claude: {
    executable: 'claude',
    flags: ['--dangerously-skip-permissions'],
  },
  commands: {
    typeCheck: null,
    lint: null,
    build: null,
    test: null,
  },
};

// ─── Public API ─────────────────────────────────────────────

export interface MigrationResult {
  applied: string[];
  defaultsFilled: string[];
  errors: string[];
}

/**
 * Run all pending config migrations and fill schema defaults.
 *
 * @param configPath - Path to orbital.config.json
 * @param appliedMigrations - IDs already recorded in the manifest
 * @returns List of migration IDs that were applied
 */
export function migrateConfig(
  configPath: string,
  appliedMigrations: string[],
): MigrationResult {
  const result: MigrationResult = { applied: [], defaultsFilled: [], errors: [] };

  if (!fs.existsSync(configPath)) return result;

  let config: Record<string, unknown>;
  try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  } catch {
    result.errors.push('Failed to parse orbital.config.json');
    return result;
  }

  const appliedSet = new Set(appliedMigrations);

  // Apply explicit migrations in order
  for (const migration of MIGRATIONS) {
    if (appliedSet.has(migration.id)) continue;

    try {
      config = migration.migrate(config);
      result.applied.push(migration.id);
    } catch (err) {
      result.errors.push(`Migration ${migration.id} failed: ${String(err)}`);
    }
  }

  // Fill schema defaults for missing top-level properties
  for (const [key, defaultValue] of Object.entries(SCHEMA_DEFAULTS)) {
    if (!(key in config)) {
      config[key] = defaultValue;
      result.defaultsFilled.push(key);
    }
  }

  // Fill nested defaults
  for (const [section, defaults] of Object.entries(NESTED_DEFAULTS)) {
    if (!(section in config)) {
      config[section] = { ...defaults };
      result.defaultsFilled.push(section);
    } else if (typeof config[section] === 'object' && config[section] !== null) {
      const sectionObj = config[section] as Record<string, unknown>;
      for (const [key, defaultValue] of Object.entries(defaults)) {
        if (!(key in sectionObj)) {
          sectionObj[key] = defaultValue;
          result.defaultsFilled.push(`${section}.${key}`);
        }
      }
    }
  }

  // Write back if any changes were made
  if (result.applied.length > 0 || result.defaultsFilled.length > 0) {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
  }

  return result;
}

/**
 * Get all migration IDs that haven't been applied yet.
 */
export function getPendingMigrations(appliedMigrations: string[]): string[] {
  const appliedSet = new Set(appliedMigrations);
  return MIGRATIONS
    .filter(m => !appliedSet.has(m.id))
    .map(m => m.id);
}

/**
 * Get all registered migrations (for display/debug).
 */
export function getAllMigrations(): Array<{ id: string; description: string }> {
  return MIGRATIONS.map(m => ({ id: m.id, description: m.description }));
}
