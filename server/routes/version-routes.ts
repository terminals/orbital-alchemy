import { Router } from 'express';
import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import type { Server } from 'socket.io';
import { createLogger } from '../utils/logger.js';

const log = createLogger('version');

const execFileAsync = promisify(execFile);

interface VersionRouteDeps {
  io: Server;
}

/** Resolve the root directory of the orbital-command package itself. */
function getOrbitalRoot(): string {
  const __selfDir = path.dirname(fileURLToPath(import.meta.url));
  // Walk up until we find package.json (handles both dev and compiled paths)
  let dir = __selfDir;
  for (let i = 0; i < 6; i++) {
    if (fs.existsSync(path.join(dir, 'package.json'))) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  // Fallback: assume dev layout (server/routes/ → 2 levels up)
  return path.resolve(__selfDir, '../..');
}

async function git(args: string[], cwd: string, timeoutMs = 15_000): Promise<string> {
  const { stdout } = await execFileAsync('git', args, { cwd, timeout: timeoutMs });
  return stdout.trim();
}

export function createVersionRoutes({ io }: VersionRouteDeps): Router {
  const router = Router();
  const orbitalRoot = getOrbitalRoot();

  // GET /version — current version info
  router.get('/version', async (_req, res) => {
    try {
      const pkgPath = path.join(orbitalRoot, 'package.json');
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));

      let commitSha = 'unknown';
      let branch = 'unknown';
      try {
        commitSha = await git(['rev-parse', '--short', 'HEAD'], orbitalRoot);
        branch = await git(['rev-parse', '--abbrev-ref', 'HEAD'], orbitalRoot);
      } catch {
        // Not a git repo (installed via npm) — version only
      }

      res.json({
        version: pkg.version,
        commitSha,
        branch,
      });
    } catch (err) {
      log.error('Version route error', { error: (err as Error).message });
      res.status(500).json({ error: `Failed to read version: ${(err as Error).message}` });
    }
  });

  // GET /version/check — fetch from remote and compare SHAs
  router.get('/version/check', async (_req, res) => {
    try {
      const branch = await git(['rev-parse', '--abbrev-ref', 'HEAD'], orbitalRoot);
      await git(['fetch', 'origin', branch, '--quiet'], orbitalRoot);

      const localSha = await git(['rev-parse', 'HEAD'], orbitalRoot);
      const remoteSha = await git(['rev-parse', `origin/${branch}`], orbitalRoot);

      let behindCount = 0;
      if (localSha !== remoteSha) {
        const countStr = await git(
          ['rev-list', '--count', `HEAD..origin/${branch}`],
          orbitalRoot,
        );
        behindCount = parseInt(countStr, 10) || 0;
      }

      res.json({
        updateAvailable: behindCount > 0,
        behindCount,
        localSha: localSha.slice(0, 7),
        remoteSha: remoteSha.slice(0, 7),
        branch,
      });
    } catch (err) {
      log.error('Version route error', { error: (err as Error).message });
      res.status(500).json({ error: `Failed to check for updates: ${(err as Error).message}` });
    }
  });

  // POST /version/update — git pull + npm install
  router.post('/version/update', async (req, res) => {
    if (req.headers['x-orbital-action'] !== 'update') {
      res.status(403).json({ error: 'Missing required X-Orbital-Action header' });
      return;
    }

    let stage = 'guard';
    try {
      // Guard: refuse if working tree is dirty
      const status = await git(['status', '--porcelain'], orbitalRoot);
      if (status.length > 0) {
        res.status(409).json({
          error: 'Working tree has uncommitted changes. Commit or stash before updating.',
          dirty: true,
        });
        return;
      }

      stage = 'pulling';
      io.emit('version:updating', { stage });

      await git(['pull', '--ff-only'], orbitalRoot);

      stage = 'installing';
      io.emit('version:updating', { stage });

      await execFileAsync('npm', ['install'], {
        cwd: orbitalRoot,
        timeout: 120_000,
      });

      io.emit('version:updated', { success: true });

      // Read updated version
      const pkg = JSON.parse(fs.readFileSync(path.join(orbitalRoot, 'package.json'), 'utf-8'));
      const commitSha = await git(['rev-parse', '--short', 'HEAD'], orbitalRoot);

      res.json({
        success: true,
        version: pkg.version,
        commitSha,
        message: 'Update complete. Restart the server to apply changes.',
      });
    } catch (err) {
      log.error('Version route error', { error: (err as Error).message });
      const recovery = stage === 'installing'
        ? ' Git pull succeeded — run `npm install` manually to finish.'
        : stage === 'pulling'
          ? ' No files were changed — safe to retry.'
          : '';
      io.emit('version:updated', { success: false, error: (err as Error).message });
      res.status(500).json({ error: `Update failed at stage "${stage}": ${(err as Error).message}.${recovery}` });
    }
  });

  return router;
}
