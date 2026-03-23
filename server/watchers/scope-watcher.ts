import chokidar, { type FSWatcher } from 'chokidar';
import path from 'path';
import type { ScopeService } from '../services/scope-service.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('scope');

export function startScopeWatcher(
  scopesDir: string,
  scopeService: ScopeService
): FSWatcher {
  const watcher = chokidar.watch(scopesDir, {
    ignored: [/(^|[/\\])\../, /node_modules/, /_template\.md$/],
    persistent: true,
    ignoreInitial: true,
    depth: 2, // scopes/completed/*.md
  });

  watcher
    .on('add', (filePath: string) => {
      if (!filePath.endsWith('.md') || scopeService.isSuppressed(filePath)) return;
      log.info('Scope added', { file: path.basename(filePath) });
      scopeService.updateFromFile(filePath);
    })
    .on('change', (filePath: string) => {
      if (!filePath.endsWith('.md') || scopeService.isSuppressed(filePath)) return;
      log.debug('Scope changed', { file: path.basename(filePath) });
      scopeService.updateFromFile(filePath);
    })
    .on('unlink', (filePath: string) => {
      if (!filePath.endsWith('.md') || scopeService.isSuppressed(filePath)) return;
      log.info('Scope removed', { file: path.basename(filePath) });
      scopeService.removeByFilePath(filePath);
    })
    .on('error', (err: unknown) => log.error('Scope watcher error', { error: String(err) }));

  return watcher;
}
