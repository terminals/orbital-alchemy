import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import type { SyncService } from '../services/sync-service.js';
import type { ProjectManager } from '../project-manager.js';
import { isValidRelativePath } from '../utils/route-helpers.js';
import { runInit, TEMPLATES_DIR } from '../init.js';
import { loadGlobalConfig } from '../global-config.js';
import { getPackageVersion } from '../utils/package-info.js';

interface SyncRouteDeps {
  syncService: SyncService;
  projectManager: ProjectManager;
}

export function createSyncRoutes({ syncService, projectManager }: SyncRouteDeps): Router {
  const router = Router();

  // ─── Sync State ─────────────────────────────────────────

  /** GET /sync/state/:projectId — sync state for a specific project */
  router.get('/sync/state/:projectId', (req, res) => {
    const ctx = projectManager.getContext(req.params.projectId);
    if (!ctx) return res.status(404).json({ error: 'Project not found' });

    const report = syncService.computeSyncState(ctx.id, ctx.config.projectRoot);
    res.json(report);
  });

  /** GET /sync/global-state — matrix view across all projects */
  router.get('/sync/global-state', (_req, res) => {
    const report = syncService.computeGlobalSyncState();
    res.json(report);
  });

  // ─── Override Operations ────────────────────────────────

  /** POST /sync/override — create an override for a file in a project */
  router.post('/sync/override', (req, res) => {
    const { projectId, relativePath, reason } = req.body as {
      projectId: string; relativePath: string; reason?: string;
    };
    if (!projectId || !relativePath) {
      return res.status(400).json({ error: 'projectId and relativePath required' });
    }
    if (!isValidRelativePath(relativePath)) {
      return res.status(400).json({ error: 'Invalid relativePath' });
    }

    const ctx = projectManager.getContext(projectId);
    if (!ctx) return res.status(404).json({ error: 'Project not found' });

    syncService.createOverride(ctx.config.projectRoot, relativePath, reason);
    res.json({ success: true });
  });

  /** POST /sync/revert — revert an override back to global */
  router.post('/sync/revert', (req, res) => {
    const { projectId, relativePath } = req.body as {
      projectId: string; relativePath: string;
    };
    if (!projectId || !relativePath) {
      return res.status(400).json({ error: 'projectId and relativePath required' });
    }
    if (!isValidRelativePath(relativePath)) {
      return res.status(400).json({ error: 'Invalid relativePath' });
    }

    const ctx = projectManager.getContext(projectId);
    if (!ctx) return res.status(404).json({ error: 'Project not found' });

    syncService.revertOverride(ctx.config.projectRoot, relativePath);
    res.json({ success: true });
  });

  /** POST /sync/promote — promote a project override to global */
  router.post('/sync/promote', (req, res) => {
    const { projectId, relativePath } = req.body as {
      projectId: string; relativePath: string;
    };
    if (!projectId || !relativePath) {
      return res.status(400).json({ error: 'projectId and relativePath required' });
    }
    if (!isValidRelativePath(relativePath)) {
      return res.status(400).json({ error: 'Invalid relativePath' });
    }

    const ctx = projectManager.getContext(projectId);
    if (!ctx) return res.status(404).json({ error: 'Project not found' });

    const result = syncService.promoteOverride(ctx.config.projectRoot, relativePath);
    res.json({ success: true, ...result });
  });

  /** POST /sync/resolve-drift — resolve a drifted file */
  router.post('/sync/resolve-drift', (req, res) => {
    const { projectId, relativePath, resolution } = req.body as {
      projectId: string; relativePath: string; resolution: 'pin-override' | 'reset-global';
    };
    if (!projectId || !relativePath || !resolution) {
      return res.status(400).json({ error: 'projectId, relativePath, and resolution required' });
    }
    if (!isValidRelativePath(relativePath)) {
      return res.status(400).json({ error: 'Invalid relativePath' });
    }

    const ctx = projectManager.getContext(projectId);
    if (!ctx) return res.status(404).json({ error: 'Project not found' });

    syncService.resolveDrift(ctx.config.projectRoot, relativePath, resolution);
    res.json({ success: true });
  });

  // ─── Impact Preview ─────────────────────────────────────

  /** GET /sync/impact?path=<relativePath> — preview impact of a global change */
  router.get('/sync/impact', (req, res) => {
    const relativePath = req.query.path as string;
    if (!relativePath) {
      return res.status(400).json({ error: 'path query parameter required' });
    }
    if (!isValidRelativePath(relativePath)) {
      return res.status(400).json({ error: 'Invalid path' });
    }

    const preview = syncService.getImpactPreview(relativePath);
    res.json(preview);
  });

  // ─── Project Management ─────────────────────────────────

  /** GET /projects — list all registered projects */
  router.get('/projects', (req, res) => {
    const include = req.query.include as string | undefined;
    res.json(projectManager.getProjectList({
      includeWorkflow: include?.includes('workflow'),
    }));
  });

  /** POST /projects — register a new project */
  router.post('/projects', async (req, res) => {
    const { path: projectPath, name, color } = req.body as {
      path: string; name?: string; color?: string;
    };
    if (!projectPath) {
      return res.status(400).json({ error: 'path required' });
    }

    try {
      const summary = await projectManager.addProject(projectPath, { name, color });
      res.status(201).json(summary);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  /** DELETE /projects/:id — unregister a project */
  router.delete('/projects/:id', async (req, res) => {
    const removed = await projectManager.removeProject(req.params.id);
    if (!removed) return res.status(404).json({ error: 'Project not found' });
    res.json({ success: true });
  });

  /** PATCH /projects/:id — update project metadata */
  router.patch('/projects/:id', async (req, res) => {
    const { name, color, enabled } = req.body as {
      name?: string; color?: string; enabled?: boolean;
    };

    if (name !== undefined && !name.trim()) {
      return res.status(400).json({ error: 'Name cannot be empty' });
    }

    const updated = await projectManager.updateProject(req.params.id, { name, color, enabled });
    if (!updated) return res.status(404).json({ error: 'Project not found' });
    res.json(updated);
  });

  // ─── Project Creation (Frontend Setup) ───────────────────

  /** POST /projects/browse — open native folder picker (macOS) */
  router.post('/projects/browse', (_req, res) => {
    if (process.platform !== 'darwin') {
      return res.json({ error: 'not_supported' });
    }

    execFile(
      'osascript',
      ['-e', 'POSIX path of (choose folder with prompt "Select your project folder")'],
      { timeout: 60_000 },
      (err, stdout) => {
        if (err) {
          // User pressed Cancel — osascript exits with code 1
          if (err.code === 1) {
            return res.json({ cancelled: true });
          }
          return res.json({ error: err.message });
        }
        const selectedPath = stdout.trim();
        if (!selectedPath) return res.json({ cancelled: true });
        res.json({ path: selectedPath });
      },
    );
  });

  /** POST /projects/check-path — validate a path and detect git status */
  router.post('/projects/check-path', (req, res) => {
    const { path: rawPath } = req.body as { path: string };
    if (!rawPath || !rawPath.trim()) {
      return res.json({ valid: false, error: 'Path is required' });
    }

    const absPath = path.resolve(rawPath.trim());

    if (!fs.existsSync(absPath)) {
      return res.json({ valid: false, absPath, error: 'Directory does not exist' });
    }

    try {
      const stat = fs.statSync(absPath);
      if (!stat.isDirectory()) {
        return res.json({ valid: false, absPath, error: 'Path must be a directory' });
      }
    } catch {
      return res.json({ valid: false, absPath, error: 'Cannot access path' });
    }

    const hasGit = fs.existsSync(path.join(absPath, '.git'));
    const suggestedName = path.basename(absPath)
      .replace(/[-_]/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase());

    // Check if already registered
    const config = loadGlobalConfig();
    const alreadyRegistered = config.projects.some(p => p.path === absPath);

    res.json({
      valid: true,
      absPath,
      hasGit,
      suggestedName,
      alreadyRegistered,
    });
  });

  /** POST /projects/create — full project initialization (init + register + seed) */
  router.post('/projects/create', async (req, res) => {
    const { path: rawPath, name, color, preset, initGit } = req.body as {
      path: string;
      name: string;
      color: string;
      preset?: string;
      initGit?: boolean;
    };

    if (!rawPath || !name || !color) {
      return res.status(400).json({ error: 'path, name, and color are required' });
    }

    const absPath = path.resolve(rawPath.trim());

    // Validate directory exists
    if (!fs.existsSync(absPath) || !fs.statSync(absPath).isDirectory()) {
      return res.status(400).json({ error: 'Path must be an existing directory' });
    }

    // Check if already registered
    const config = loadGlobalConfig();
    if (config.projects.some(p => p.path === absPath)) {
      return res.status(409).json({ error: 'A project is already registered at this path' });
    }

    try {
      // 1. Optional git init
      if (initGit && !fs.existsSync(path.join(absPath, '.git'))) {
        await new Promise<void>((resolve, reject) => {
          execFile('git', ['init'], { cwd: absPath, timeout: 10_000 }, (err) => {
            if (err) reject(new Error(`git init failed: ${err.message}`));
            else resolve();
          });
        });
      }

      // 2. Run full project init (templates, hooks, skills, agents, config, etc.)
      const selectedPreset = preset || 'default';
      runInit(absPath, {
        quiet: true,
        preset: selectedPreset,
        projectName: name,
      });

      // 3. Stamp template version
      const pkgVersion = getPackageVersion();
      const configPath = path.join(absPath, '.claude', 'orbital.config.json');
      if (fs.existsSync(configPath)) {
        try {
          const projConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
          projConfig.templateVersion = pkgVersion;
          const tmp = configPath + `.tmp.${process.pid}`;
          fs.writeFileSync(tmp, JSON.stringify(projConfig, null, 2) + '\n', 'utf8');
          fs.renameSync(tmp, configPath);
        } catch { /* ignore malformed config */ }
      }

      // 4. Register + initialize context + emit socket event
      const summary = await projectManager.addProject(absPath, { name, color });

      // 5. Seed welcome scope card
      seedWelcomeCard(absPath, selectedPreset);

      res.status(201).json(summary);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  return router;
}

// ─── Helpers ──────────────────────────────────────────────

function seedWelcomeCard(projectRoot: string, preset: string): void {
  // Determine the planning directory from the preset
  const presetsDir = path.join(TEMPLATES_DIR, 'presets');
  let planningDir = 'planning'; // default fallback

  try {
    const presetPath = path.join(presetsDir, `${preset}.json`);
    if (fs.existsSync(presetPath)) {
      const workflow = JSON.parse(fs.readFileSync(presetPath, 'utf8'));
      // Find the first list that has a directory and isn't an entry point
      const entryId = workflow.entryPoint;
      const entryList = workflow.lists?.find((l: { id: string }) => l.id === entryId);
      // Use the first forward target of the entry point, or the second list
      if (entryList?.forwardTargets?.[0]) {
        planningDir = entryList.forwardTargets[0];
      } else if (workflow.lists?.[1]?.hasDirectory) {
        planningDir = workflow.lists[1].id;
      }
    }
  } catch { /* use default */ }

  const scopesDir = path.join(projectRoot, 'scopes', planningDir);
  if (!fs.existsSync(scopesDir)) {
    fs.mkdirSync(scopesDir, { recursive: true });
  }

  const cardPath = path.join(scopesDir, '001-welcome.md');
  if (fs.existsSync(cardPath)) return; // don't overwrite

  const content = `---
title: Welcome to Orbital Command
status: ${planningDir}
priority: low
tags: [onboarding]
---

# Welcome to Orbital Command

Your project is set up and ready to go. Here are some things to try:

## Getting Started

1. **Create a scope** — Scopes are units of work. Use \`/scope-create\` in Claude Code or create a markdown file in the \`scopes/\` directory.
2. **Explore the dashboard** — Use the sidebar to navigate between views: Kanban, Primitives, Guards, Repo, Sessions, and Workflow.
3. **Launch a session** — Start a Claude Code session from the Sessions view to begin working on this scope.

## Key Concepts

- **Scopes** are markdown files with YAML frontmatter that track units of work
- **Workflow** defines the columns and transitions on your Kanban board
- **Guards** enforce quality gates before status transitions
- **Primitives** are the hooks, skills, and agents that power your setup

You can archive this card once you're comfortable with the basics.
`;

  fs.writeFileSync(cardPath, content, 'utf8');
}
