import { Router } from 'express';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { WorkflowConfig } from '../../shared/workflow-config.js';
import type { WorkflowService } from '../services/workflow-service.js';
import { parseCcHooks } from '../utils/cc-hooks-parser.js';

interface WorkflowRouteDeps {
  workflowService: WorkflowService;
  projectRoot: string;
}

export function createWorkflowRoutes({ workflowService, projectRoot }: WorkflowRouteDeps): Router {
  const router = Router();

  // GET /workflow — returns active config
  router.get('/workflow', (_req, res) => {
    try {
      res.json({ success: true, data: workflowService.getActive() });
    } catch (err) {
      res.status(500).json({ success: false, error: errMsg(err) });
    }
  });

  // PUT /workflow — validate and update active config
  router.put('/workflow', (req, res) => {
    try {
      const config = req.body as WorkflowConfig;
      const result = workflowService.updateActive(config);
      if (!result.valid) {
        res.status(400).json({ success: false, error: 'Validation failed', data: result });
        return;
      }
      res.json({ success: true, data: result });
    } catch (err) {
      res.status(500).json({ success: false, error: errMsg(err) });
    }
  });

  // GET /workflow/presets — list all presets
  router.get('/workflow/presets', (_req, res) => {
    try {
      res.json({ success: true, data: workflowService.listPresets() });
    } catch (err) {
      res.status(500).json({ success: false, error: errMsg(err) });
    }
  });

  // POST /workflow/presets — save current config as named preset
  router.post('/workflow/presets', (req, res) => {
    try {
      const { name } = req.body as { name: string };
      if (!name) {
        res.status(400).json({ success: false, error: 'name is required' });
        return;
      }
      workflowService.savePreset(name);
      res.json({ success: true });
    } catch (err) {
      const msg = errMsg(err);
      const status = msg.includes('Cannot overwrite') || msg.includes('must be') ? 400 : 500;
      res.status(status).json({ success: false, error: msg });
    }
  });

  // GET /workflow/presets/:name — get specific preset
  router.get('/workflow/presets/:name', (req, res) => {
    try {
      const config = workflowService.getPreset(req.params.name);
      res.json({ success: true, data: config });
    } catch (err) {
      const msg = errMsg(err);
      const status = msg.includes('not found') ? 404 : 500;
      res.status(status).json({ success: false, error: msg });
    }
  });

  // DELETE /workflow/presets/:name — delete preset
  router.delete('/workflow/presets/:name', (req, res) => {
    try {
      workflowService.deletePreset(req.params.name);
      res.json({ success: true });
    } catch (err) {
      const msg = errMsg(err);
      const status = msg.includes('Cannot delete') ? 400 : msg.includes('not found') ? 404 : 500;
      res.status(status).json({ success: false, error: msg });
    }
  });

  // GET /workflow/hooks — returns all hooks with edge mapping
  router.get('/workflow/hooks', (_req, res) => {
    try {
      const engine = workflowService.getEngine();
      const hooks = engine.getAllHooks();
      const edgeHookMap: Record<string, string[]> = {};
      for (const edge of engine.getAllEdges()) {
        if (edge.hooks && edge.hooks.length > 0) {
          edgeHookMap[`${edge.from}:${edge.to}`] = edge.hooks;
        }
      }
      res.json({ success: true, data: { hooks, edgeHookMap } });
    } catch (err) {
      res.status(500).json({ success: false, error: errMsg(err) });
    }
  });

  // POST /workflow/preview — dry-run migration preview
  router.post('/workflow/preview', (req, res) => {
    try {
      const config = req.body as WorkflowConfig;
      const plan = workflowService.previewMigration(config);
      res.json({ success: true, data: plan });
    } catch (err) {
      res.status(500).json({ success: false, error: errMsg(err) });
    }
  });

  // GET /workflow/hooks/:id/source — read hook source file
  router.get('/workflow/hooks/:id/source', async (req, res) => {
    try {
      const hookId = req.params.id;
      const engine = workflowService.getEngine();
      const hook = engine.getAllHooks().find((h) => h.id === hookId);
      if (!hook) {
        res.status(404).json({ success: false, error: `Hook '${hookId}' not found` });
        return;
      }
      if (hook.target.includes('..')) {
        res.status(400).json({ success: false, error: 'Invalid hook target path' });
        return;
      }
      const filePath = path.resolve(projectRoot, hook.target);
      const content = await readFile(filePath, 'utf-8');
      const lineCount = content.split('\n').length;
      res.json({ success: true, data: { hookId, filePath: hook.target, content, lineCount } });
    } catch (err) {
      const msg = errMsg(err);
      const status = msg.includes('ENOENT') ? 404 : 500;
      res.status(status).json({ success: false, error: msg });
    }
  });

  // GET /workflow/claude-hooks — returns all Claude Code hooks from settings.local.json
  router.get('/workflow/claude-hooks', (_req, res) => {
    try {
      const settingsPath = path.resolve(projectRoot, '.claude/settings.local.json');
      const data = parseCcHooks(settingsPath);
      res.json({ success: true, data });
    } catch (err) {
      res.status(500).json({ success: false, error: errMsg(err) });
    }
  });

  // GET /workflow/hooks/source — read any hook source file by path
  router.get('/workflow/hooks/source', async (req, res) => {
    try {
      const hookPath = req.query.path as string | undefined;
      if (!hookPath) {
        res.status(400).json({ success: false, error: 'path query parameter is required' });
        return;
      }
      if (hookPath.includes('..')) {
        res.status(400).json({ success: false, error: 'Invalid path: directory traversal not allowed' });
        return;
      }
      const filePath = path.resolve(projectRoot, hookPath);
      const content = await readFile(filePath, 'utf-8');
      const lineCount = content.split('\n').length;
      res.json({ success: true, data: { filePath: hookPath, content, lineCount } });
    } catch (err) {
      const msg = errMsg(err);
      const status = msg.includes('ENOENT') ? 404 : 500;
      res.status(status).json({ success: false, error: msg });
    }
  });

  // POST /workflow/apply — apply new config with orphan mappings
  router.post('/workflow/apply', (req, res) => {
    try {
      const { config, orphanMappings } = req.body as {
        config: WorkflowConfig;
        orphanMappings: Record<string, string>;
      };
      const plan = workflowService.applyMigration(config, orphanMappings ?? {});
      res.json({ success: true, data: plan });
    } catch (err) {
      const msg = errMsg(err);
      const status = msg.includes('Missing orphan') || msg.includes('Validation failed') || msg.includes('not a valid') ? 400 : 500;
      res.status(status).json({ success: false, error: msg });
    }
  });

  return router;
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
