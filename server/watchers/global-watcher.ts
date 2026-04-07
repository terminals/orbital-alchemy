import chokidar, { type FSWatcher } from 'chokidar';
import path from 'path';
import fs from 'fs';
import type { Server } from 'socket.io';
import { GLOBAL_PRIMITIVES_DIR } from '../global-config.js';
import type { SyncService } from '../services/sync-service.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('global-watcher');

/**
 * Watch ~/.orbital/primitives/ for changes and propagate to synced projects.
 *
 * On file change: copies to all synced projects' .claude/ directories.
 * On file create: copies to projects with auto-sync policy.
 * On file delete: removes from synced projects, preserves overrides.
 */
export function startGlobalWatcher(
  syncService: SyncService,
  io: Server,
): FSWatcher | null {
  if (!fs.existsSync(GLOBAL_PRIMITIVES_DIR)) {
    log.info('Global primitives directory does not exist, skipping watcher');
    return null;
  }

  const watcher = chokidar.watch(GLOBAL_PRIMITIVES_DIR, {
    ignored: [/(^|[/\\])\../, /\.tmp$/, /\.sync-tmp$/],
    persistent: true,
    ignoreInitial: true,
    depth: 10,
    awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 },
  });

  function relativePath(absPath: string): string {
    return path.relative(GLOBAL_PRIMITIVES_DIR, absPath);
  }

  watcher.on('change', (filePath) => {
    const rel = relativePath(filePath);
    log.info('Global primitive changed', { file: rel });
    const result = syncService.propagateGlobalChange(rel);
    io.to('all-projects').emit('sync:file:updated', {
      relativePath: rel,
      projects: result.updated,
    });
  });

  watcher.on('add', (filePath) => {
    const rel = relativePath(filePath);
    log.info('Global primitive added', { file: rel });
    const result = syncService.handleNewGlobalFile(rel);
    io.to('all-projects').emit('sync:file:created', {
      relativePath: rel,
      autoSynced: result.updated,
      pending: result.skipped,
    });
  });

  watcher.on('unlink', (filePath) => {
    const rel = relativePath(filePath);
    log.info('Global primitive deleted', { file: rel });
    const result = syncService.handleGlobalFileDeletion(rel);
    io.to('all-projects').emit('sync:file:deleted', {
      relativePath: rel,
      removed: result.removed,
      preserved: result.preserved,
    });
  });

  watcher.on('error', (err) => {
    log.error('Global watcher error', { error: String(err) });
  });

  log.info('Global primitives watcher started', { dir: GLOBAL_PRIMITIVES_DIR });
  return watcher;
}
