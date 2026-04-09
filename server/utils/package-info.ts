import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __selfDir = path.dirname(fileURLToPath(import.meta.url));

/**
 * Resolve the root directory of the orbital-command package itself.
 * Walks up from the current file until it finds package.json.
 */
export function getOrbitalRoot(): string {
  let dir = __selfDir;
  for (let i = 0; i < 6; i++) {
    if (fs.existsSync(path.join(dir, 'package.json'))) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  // Fallback: assume dev layout (server/utils/ → 2 levels up)
  return path.resolve(__selfDir, '../..');
}

/** Read package version from package.json in the given root, or the orbital root. */
export function getPackageVersion(rootDir?: string): string {
  try {
    const dir = rootDir ?? getOrbitalRoot();
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf-8'));
    return pkg.version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}
