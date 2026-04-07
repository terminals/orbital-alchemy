// ─── Sync State Types ───────────────────────────────────────

/** Sync mode for a single primitive file */
export type SyncMode = 'synced' | 'override';

/** Computed state after comparing manifest against actual files */
export type SyncState = 'synced' | 'override' | 'drifted' | 'absent';

/** Per-file sync record in the project manifest */
export interface SyncFileRecord {
  /** Current sync mode */
  mode: SyncMode;
  /** SHA-256 hash (first 16 hex chars) of the global file content when last synced */
  globalHash: string;
  /** SHA-256 hash of the project's local file content */
  localHash: string;
  /** ISO 8601 timestamp of last sync action */
  syncedAt: string;
  /** Present only when mode === 'override' */
  overriddenAt?: string;
  /** Optional human-readable reason for the override */
  reason?: string;
}

/** The full project sync manifest (.claude/orbital-sync.json) */
export interface OrbitalSyncManifest {
  version: 1;
  /** Files tracked by sync, keyed by relative path from .claude/ */
  files: Record<string, SyncFileRecord>;
  /** Workflow has its own record */
  workflow: SyncFileRecord;
  /** Policy for new global files */
  newFilesPolicy: 'auto-sync' | 'prompt';
}

// ─── Reports ────────────────────────────────────────────────

/** State of a single file in a single project */
export interface FileSyncStatus {
  relativePath: string;
  state: SyncState;
  globalHash: string | null;
  localHash: string | null;
  overriddenAt?: string;
  reason?: string;
}

/** Sync state report for a single project */
export interface SyncStateReport {
  projectId: string;
  projectPath: string;
  files: FileSyncStatus[];
  workflow: FileSyncStatus;
}

/** Sync state across all projects (matrix view) */
export interface GlobalSyncReport {
  /** All tracked file paths across all projects */
  files: string[];
  /** Per-project state for each file */
  projects: Array<{
    projectId: string;
    projectName: string;
    states: Record<string, SyncState>;
  }>;
}

// ─── Operation Results ──────────────────────────────────────

export interface PropagationResult {
  /** Projects that were updated */
  updated: string[];
  /** Projects that were skipped (override) */
  skipped: string[];
  /** Projects that failed */
  failed: Array<{ projectId: string; error: string }>;
}
