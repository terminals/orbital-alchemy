import { Router } from 'express';
import type { SprintService, SprintStatus, GroupTargetColumn, GroupType } from '../services/sprint-service.js';
import type { SprintOrchestrator } from '../services/sprint-orchestrator.js';
import type { BatchOrchestrator } from '../services/batch-orchestrator.js';

interface SprintRouteDeps {
  sprintService: SprintService;
  sprintOrchestrator: SprintOrchestrator;
  batchOrchestrator: BatchOrchestrator;
}

export function createSprintRoutes({ sprintService, sprintOrchestrator, batchOrchestrator }: SprintRouteDeps): Router {
  const router = Router();

  router.post('/sprints', (req, res) => {
    const { name, target_column, group_type } = req.body as {
      name?: string; target_column?: GroupTargetColumn; group_type?: GroupType;
    };
    if (!name || !name.trim()) {
      res.status(400).json({ error: 'name is required' });
      return;
    }
    const sprint = sprintService.create(name.trim(), { target_column, group_type });
    res.status(201).json(sprint);
  });

  router.get('/sprints', (req, res) => {
    const status = req.query.status as string | undefined;
    const targetColumn = req.query.target_column as string | undefined;
    const sprints = sprintService.getAll(
      status as SprintStatus | undefined,
      targetColumn as GroupTargetColumn | undefined,
    );
    res.json(sprints);
  });

  router.get('/sprints/:id', (req, res) => {
    const sprint = sprintService.getById(Number(req.params.id));
    if (!sprint) {
      res.status(404).json({ error: 'Sprint not found' });
      return;
    }
    res.json(sprint);
  });

  router.delete('/sprints/:id', (req, res) => {
    const deleted = sprintService.delete(Number(req.params.id));
    if (!deleted) {
      res.status(400).json({ error: 'Cannot delete sprint (must be assembling)' });
      return;
    }
    res.json({ ok: true });
  });

  router.post('/sprints/:id/scopes', (req, res) => {
    const { scope_ids } = req.body as { scope_ids?: number[] };
    if (!Array.isArray(scope_ids) || scope_ids.length === 0) {
      res.status(400).json({ error: 'scope_ids must be a non-empty array' });
      return;
    }
    const result = sprintService.addScopes(Number(req.params.id), scope_ids);
    if (!result) {
      res.status(400).json({ error: 'Sprint not found or not in assembling state' });
      return;
    }
    res.json(result);
  });

  router.delete('/sprints/:id/scopes', (req, res) => {
    const { scope_ids } = req.body as { scope_ids?: number[] };
    if (!Array.isArray(scope_ids) || scope_ids.length === 0) {
      res.status(400).json({ error: 'scope_ids must be a non-empty array' });
      return;
    }
    const removed = sprintService.removeScopes(Number(req.params.id), scope_ids);
    if (!removed) {
      res.status(400).json({ error: 'Sprint not found or not in assembling state' });
      return;
    }
    res.json({ ok: true });
  });

  router.post('/sprints/:id/dispatch', async (req, res) => {
    const id = Number(req.params.id);
    const sprint = sprintService.getById(id);
    if (!sprint) {
      res.status(404).json({ error: 'Sprint not found' });
      return;
    }

    if (sprint.group_type === 'batch') {
      const result = await batchOrchestrator.dispatch(id);
      if (!result.ok) {
        res.status(400).json({ error: result.error });
        return;
      }
      res.json({ ok: true });
    } else {
      const result = await sprintOrchestrator.startSprint(id);
      if (!result.ok) {
        res.status(400).json({ error: result.error });
        return;
      }
      res.json({ ok: true, layers: result.layers });
    }
  });

  router.post('/sprints/:id/cancel', (req, res) => {
    const cancelled = sprintOrchestrator.cancelSprint(Number(req.params.id));
    if (!cancelled) {
      res.status(400).json({ error: 'Sprint not found or cannot be cancelled' });
      return;
    }
    res.json({ ok: true });
  });

  router.get('/sprints/:id/graph', (req, res) => {
    const graph = sprintOrchestrator.getExecutionGraph(Number(req.params.id));
    if (!graph) {
      res.status(404).json({ error: 'Sprint not found' });
      return;
    }
    res.json(graph);
  });

  return router;
}
