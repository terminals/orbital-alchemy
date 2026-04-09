import { execFile as execFileCb } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { createLogger } from './logger.js';

const execFile = promisify(execFileCb);
const log = createLogger('worktree');

export interface WorktreeInfo {
  path: string;
  branch: string;
  scopeId: number;
}

export async function createWorktree(projectRoot: string, scopeId: number): Promise<WorktreeInfo> {
  const wtPath = path.join(projectRoot, '.worktrees', `scope-${scopeId}`);
  const branch = `feat/scope-${scopeId}`;

  log.info('Creating worktree', { scopeId, branch });
  await execFile('git', ['worktree', 'add', wtPath, '-b', branch], { cwd: projectRoot });

  // Ensure scopes/ and .claude/ are in .gitignore (for user projects)
  const gitignorePath = path.join(projectRoot, '.gitignore');
  try {
    const content = await fs.readFile(gitignorePath, 'utf-8');
    const lines = content.split('\n');
    const toAdd: string[] = [];
    if (!lines.some((l) => l.trim() === 'scopes/')) toAdd.push('scopes/');
    if (!lines.some((l) => l.trim() === '.claude/')) toAdd.push('.claude/');
    if (toAdd.length > 0) {
      await fs.appendFile(gitignorePath, '\n' + toAdd.join('\n') + '\n');
    }
  } catch {
    // .gitignore doesn't exist — create it
    await fs.writeFile(gitignorePath, 'scopes/\n.claude/\n');
  }

  // Remove real scopes/ and .claude/ from worktree (git checkout creates them if tracked)
  const scopesWt = path.join(wtPath, 'scopes');
  const claudeWt = path.join(wtPath, '.claude');
  try { await fs.rm(scopesWt, { recursive: true, force: true }); } catch { /* ok */ }
  try { await fs.rm(claudeWt, { recursive: true, force: true }); } catch { /* ok */ }

  // Create symlinks
  await fs.symlink(path.join(projectRoot, 'scopes'), scopesWt);
  await fs.symlink(path.join(projectRoot, '.claude'), claudeWt);

  return { path: wtPath, branch, scopeId };
}

export async function removeWorktree(projectRoot: string, scopeId: number): Promise<void> {
  const wtPath = path.join(projectRoot, '.worktrees', `scope-${scopeId}`);
  const branch = `feat/scope-${scopeId}`;

  log.info('Removing worktree', { scopeId });
  try {
    await execFile('git', ['worktree', 'remove', wtPath, '--force'], { cwd: projectRoot });
  } catch { log.debug('Worktree already removed', { scopeId }); }

  try {
    await execFile('git', ['branch', '-d', branch], { cwd: projectRoot });
  } catch { log.debug('Branch not deleted', { branch, scopeId }); }
}

export async function listWorktrees(projectRoot: string): Promise<WorktreeInfo[]> {
  const { stdout } = await execFile('git', ['worktree', 'list', '--porcelain'], { cwd: projectRoot });
  const results: WorktreeInfo[] = [];
  let currentPath = '';
  let currentBranch = '';

  for (const line of stdout.split('\n')) {
    if (line.startsWith('worktree ')) {
      currentPath = line.slice(9);
    } else if (line.startsWith('branch ')) {
      currentBranch = line.slice(7);
    } else if (line === '' && currentPath) {
      const match = currentPath.match(/scope-(\d+)$/);
      if (match) {
        results.push({ path: currentPath, branch: currentBranch, scopeId: parseInt(match[1], 10) });
      }
      currentPath = '';
      currentBranch = '';
    }
  }
  if (currentPath) {
    const match = currentPath.match(/scope-(\d+)$/);
    if (match) {
      results.push({ path: currentPath, branch: currentBranch, scopeId: parseInt(match[1], 10) });
    }
  }

  return results;
}

export async function cleanupStaleWorktrees(projectRoot: string): Promise<number> {
  const worktrees = await listWorktrees(projectRoot);
  let cleaned = 0;
  for (const wt of worktrees) {
    try {
      await fs.access(wt.path);
    } catch {
      log.info('Cleaning stale worktree', { scopeId: wt.scopeId, path: wt.path });
      await removeWorktree(projectRoot, wt.scopeId);
      cleaned++;
    }
  }
  return cleaned;
}
