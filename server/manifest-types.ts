/**
 * Types for the Orbital Command primitive manifest system.
 *
 * The manifest (.claude/orbital-manifest.json) tracks provenance and status
 * of every file Orbital installs into a project. It replaces the implicit
 * "compare directories at runtime" approach with explicit tracking.
 */

// ─── File Tracking ──────────────────────────────────────────

/** Where the file originated */
export type FileOrigin = 'template' | 'user';

/**
 * Current tracking status of a managed file.
 *
 * - synced:     Template file, matches current template — safe to overwrite on update
 * - outdated:   Template file, user hasn't edited but template has a newer version — safe to auto-update
 * - modified:   Template file, user edited — skip on update (warn), needs manual review
 * - pinned:     Template file, user locked — skip on update, record new templateHash
 * - missing:    Template file, expected on disk but not found — needs restore
 * - user-owned: User-created file — never touched by update or uninstall
 */
export type FileStatus = 'synced' | 'outdated' | 'modified' | 'pinned' | 'missing' | 'user-owned';

/** Per-file record in the manifest */
export interface ManifestFile {
  origin: FileOrigin;
  status: FileStatus;
  /** SHA-256 hash (16 hex chars) of the template version when last installed/updated.
   *  Present only for template-origin files. Updated even for pinned files
   *  so users can diff against the latest template. */
  templateHash?: string;
  /** Hash of the file content when first installed or last synced to template. */
  installedHash: string;
  /** Relative symlink target for self-hosting mode (e.g. "../../templates/hooks/foo.sh"). */
  symlinkTarget?: string;
  /** ISO 8601 timestamp when pinned */
  pinnedAt?: string;
  /** Human-readable reason for pinning */
  pinnedReason?: string;
}

// ─── Manifest ───────────────────────────────────────────────

export interface OrbitalManifest {
  /** Schema version — bump when format changes */
  version: 2;
  /** ISO 8601 timestamp of first install */
  installedAt: string;
  /** ISO 8601 timestamp of last update */
  updatedAt: string;
  /** Package version that last wrote this manifest */
  packageVersion: string;
  /** Package version before the last update (for migration tracking) */
  previousPackageVersion?: string;
  /** Workflow preset the project was initialized with */
  preset: string;
  /** Tracked files, keyed by relative path from .claude/ (e.g. "hooks/init-session.sh") */
  files: Record<string, ManifestFile>;
  /** SHA-256 hash (16 hex chars) of the settings-hooks.json template last applied */
  settingsHooksChecksum: string;
  /** Config migration IDs already applied (e.g. ["0.1.0->0.2.0"]) */
  appliedMigrations: string[];
  /** Derived artifacts that are always regenerated, never tracked for user modification */
  generatedArtifacts: string[];
  /** Gitignore entries added by Orbital (for clean removal) */
  gitignoreEntries: string[];
}

// ─── Update Plan ────────────────────────────────────────────

/** A single rename operation */
export interface RenameEntry {
  from: string;
  to: string;
}

/** A file that will be skipped during update */
export interface SkipEntry {
  file: string;
  reason: 'modified' | 'pinned';
  /** New template hash (so manifest can be updated even if file isn't) */
  newTemplateHash: string;
}

/** The complete plan computed by the update planner */
export interface UpdatePlan {
  /** New template files not in manifest */
  toAdd: string[];
  /** Synced files whose template hash changed */
  toUpdate: string[];
  /** Files in manifest but no longer in templates */
  toRemove: string[];
  /** Files that were renamed between versions */
  toRename: RenameEntry[];
  /** Modified or pinned files that won't be touched */
  toSkip: SkipEntry[];
  /** Settings hook changes */
  settingsChanges: {
    hooksToAdd: string[];
    hooksToRemove: string[];
  };
  /** Config migration IDs to apply */
  pendingMigrations: string[];
  /** Whether anything actually needs to change */
  isEmpty: boolean;
}

// ─── Config Migration ───────────────────────────────────────

export interface ConfigMigration {
  /** Version range identifier, e.g. "0.2.0->0.3.0" */
  id: string;
  /** Human-readable description of the migration */
  description: string;
  /** Idempotent transform function — checks before applying */
  migrate: (config: Record<string, unknown>) => Record<string, unknown>;
}

// ─── Validation ─────────────────────────────────────────────

export type ValidationSeverity = 'error' | 'warning' | 'info';

export interface ValidationResult {
  severity: ValidationSeverity;
  message: string;
  file?: string;
  detail?: string;
}

// ─── Settings Hook Types ────────────────────────────────────

export interface SettingsHookEntry {
  type?: string;
  command: string;
  _orbital?: boolean;
}

export interface SettingsHookGroup {
  matcher?: string;
  hooks?: SettingsHookEntry[];
}

export type SettingsHooks = Record<string, SettingsHookGroup[]>;
