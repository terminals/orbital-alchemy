import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';

export interface ConfigFileNode {
  name: string;
  path: string;      // relative path from base
  type: 'file' | 'folder';
  children?: ConfigFileNode[];
  frontmatter?: Record<string, unknown>;
}

export type ConfigPrimitiveType = 'agents' | 'skills' | 'hooks';

const VALID_TYPES = new Set<ConfigPrimitiveType>(['agents', 'skills', 'hooks']);

export function isValidPrimitiveType(type: string): type is ConfigPrimitiveType {
  return VALID_TYPES.has(type as ConfigPrimitiveType);
}

export class ConfigService {
  constructor(private projectRoot: string) {}

  /** Resolve the base directory for a primitive type */
  getBasePath(type: ConfigPrimitiveType): string {
    switch (type) {
      case 'agents':  return path.join(this.projectRoot, '.claude', 'agents');
      case 'skills':  return path.join(this.projectRoot, '.claude', 'skills');
      case 'hooks':   return path.join(this.projectRoot, '.claude', 'hooks');
    }
  }

  /** Scan a directory tree and parse SKILL.md / agent frontmatter */
  scanDirectory(basePath: string, parseFrontmatter = true): ConfigFileNode[] {
    if (!fs.existsSync(basePath)) return [];
    return this.walkDir(basePath, basePath, parseFrontmatter);
  }

  readFile(basePath: string, relativePath: string): string {
    const resolved = this.validatePath(basePath, relativePath);
    return fs.readFileSync(resolved, 'utf-8');
  }

  writeFile(basePath: string, relativePath: string, content: string): void {
    const resolved = this.validatePath(basePath, relativePath);
    if (!fs.existsSync(resolved)) {
      throw new Error('File not found');
    }
    // Atomic write: write to .tmp, then rename
    const tmpPath = resolved + '.tmp';
    fs.writeFileSync(tmpPath, content, 'utf-8');
    fs.renameSync(tmpPath, resolved);
  }

  createFile(basePath: string, relativePath: string, content: string): void {
    const resolved = this.validatePath(basePath, relativePath);
    if (fs.existsSync(resolved)) {
      throw new Error('File already exists');
    }
    const dir = path.dirname(resolved);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(resolved, content, 'utf-8');
  }

  deleteFile(basePath: string, relativePath: string): void {
    const resolved = this.validatePath(basePath, relativePath);
    if (!fs.existsSync(resolved)) {
      throw new Error('File not found');
    }
    const stat = fs.statSync(resolved);
    if (stat.isDirectory()) {
      throw new Error('Cannot delete a directory');
    }
    fs.unlinkSync(resolved);
  }

  renameFile(basePath: string, oldPath: string, newPath: string): void {
    const resolvedOld = this.validatePath(basePath, oldPath);
    const resolvedNew = this.validatePath(basePath, newPath);
    if (!fs.existsSync(resolvedOld)) {
      throw new Error('Source file not found');
    }
    if (fs.existsSync(resolvedNew)) {
      throw new Error('Destination already exists');
    }
    const destDir = path.dirname(resolvedNew);
    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
    fs.renameSync(resolvedOld, resolvedNew);
  }

  createFolder(basePath: string, relativePath: string): void {
    const resolved = this.validatePath(basePath, relativePath);
    if (fs.existsSync(resolved)) {
      throw new Error('Folder already exists');
    }
    fs.mkdirSync(resolved, { recursive: true });
  }

  // ─── Private Helpers ────────────────────────────────────

  /** Path traversal validation — ensure resolved path is within basePath */
  private validatePath(basePath: string, relativePath: string): string {
    const resolvedBase = path.resolve(basePath);
    const resolved = path.resolve(basePath, relativePath);
    if (resolved !== resolvedBase && !resolved.startsWith(resolvedBase + path.sep)) {
      throw new Error('Path traversal detected');
    }
    return resolved;
  }

  /** Recursively walk a directory and build a file tree */
  private walkDir(currentPath: string, basePath: string, parseFrontmatter: boolean): ConfigFileNode[] {
    const entries = fs.readdirSync(currentPath, { withFileTypes: true });
    const nodes: ConfigFileNode[] = [];

    for (const entry of entries) {
      // Skip hidden files/dirs (e.g. .DS_Store)
      if (entry.name.startsWith('.')) continue;

      const fullPath = path.join(currentPath, entry.name);
      const relPath = path.relative(basePath, fullPath);

      // Resolve symlinks: Dirent.isDirectory() returns false for symlinks-to-dirs.
      // Self-hosted projects symlink .claude/agents/*, .claude/hooks/*, etc. into templates/.
      let stat: fs.Stats;
      try {
        stat = fs.statSync(fullPath);
      } catch {
        continue; // broken symlink — skip silently
      }

      if (stat.isDirectory()) {
        const children = this.walkDir(fullPath, basePath, parseFrontmatter);
        nodes.push({ name: entry.name, path: relPath, type: 'folder', children });
      } else {
        const node: ConfigFileNode = { name: entry.name, path: relPath, type: 'file' };
        if (parseFrontmatter && entry.name.endsWith('.md')) {
          try {
            const content = fs.readFileSync(fullPath, 'utf-8');
            const parsed = matter(content);
            if (Object.keys(parsed.data).length > 0) {
              node.frontmatter = parsed.data;
            }
          } catch {
            // Skip frontmatter parsing errors
          }
        }
        nodes.push(node);
      }
    }

    // Sort: folders first, then files, alphabetical within each group
    nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    return nodes;
  }
}
