import chokidar, { type FSWatcher } from 'chokidar';
import path from 'path';
import type { ScopeService } from '../services/scope-service.js';

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
      if (!filePath.endsWith('.md')) return;
      // eslint-disable-next-line no-console
      console.log(`[Orbital] Scope added: ${path.basename(filePath)}`);
      scopeService.updateFromFile(filePath);
    })
    .on('change', (filePath: string) => {
      if (!filePath.endsWith('.md')) return;
      // eslint-disable-next-line no-console
      console.log(`[Orbital] Scope changed: ${path.basename(filePath)}`);
      scopeService.updateFromFile(filePath);
    })
    .on('unlink', (filePath: string) => {
      if (!filePath.endsWith('.md')) return;
      // eslint-disable-next-line no-console
      console.log(`[Orbital] Scope removed: ${path.basename(filePath)}`);
      scopeService.removeByFilePath(filePath);
    })
    .on('error', (err: unknown) => console.error('[Orbital] Scope watcher error:', err));

  return watcher;
}
