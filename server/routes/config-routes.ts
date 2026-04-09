import { Router } from 'express';
import type { Emitter } from '../project-emitter.js';
import { ConfigService, isValidPrimitiveType } from '../services/config-service.js';
import type { ConfigPrimitiveType } from '../services/config-service.js';
import type { WorkflowService } from '../services/workflow-service.js';
import { errMsg } from '../utils/route-helpers.js';

interface ConfigRouteDeps {
  projectRoot: string;
  workflowService: WorkflowService;
  io: Emitter;
}

export function createConfigRoutes({ projectRoot, workflowService: _workflowService, io }: ConfigRouteDeps): Router {
  const router = Router();
  const configService = new ConfigService(projectRoot);

  /** Validate :type param and return the primitive type, or send 400 */
  function parseType(typeParam: string, res: import('express').Response): ConfigPrimitiveType | null {
    if (!isValidPrimitiveType(typeParam)) {
      res.status(400).json({ success: false, error: `Invalid type "${typeParam}". Must be one of: agents, skills, hooks` });
      return null;
    }
    return typeParam;
  }

  // GET /config/:type/tree — directory tree with frontmatter
  router.get('/config/:type/tree', (req, res) => {
    const type = parseType(req.params.type, res);
    if (!type) return;

    try {
      const basePath = configService.getBasePath(type);
      const tree = configService.scanDirectory(basePath);
      res.json({ success: true, data: tree });
    } catch (err) {
      res.status(500).json({ success: false, error: errMsg(err) });
    }
  });

  // GET /config/:type/file?path=<relative> — file content
  router.get('/config/:type/file', (req, res) => {
    const type = parseType(req.params.type, res);
    if (!type) return;

    const filePath = req.query.path as string | undefined;
    if (!filePath) {
      res.status(400).json({ success: false, error: 'path query parameter is required' });
      return;
    }

    try {
      const basePath = configService.getBasePath(type);
      const content = configService.readFile(basePath, filePath);
      res.json({ success: true, data: { path: filePath, content } });
    } catch (err) {
      const msg = errMsg(err);
      const status = msg.includes('traversal') ? 403 : msg.includes('ENOENT') || msg.includes('not found') ? 404 : 500;
      res.status(status).json({ success: false, error: msg });
    }
  });

  // PUT /config/:type/file — save file { path, content }
  router.put('/config/:type/file', (req, res) => {
    const type = parseType(req.params.type, res);
    if (!type) return;

    const { path: filePath, content } = req.body as { path?: string; content?: string };
    if (!filePath || content === undefined) {
      res.status(400).json({ success: false, error: 'path and content are required' });
      return;
    }

    try {
      const basePath = configService.getBasePath(type);
      configService.writeFile(basePath, filePath, content);
      io.emit(`config:${type}:changed`, { action: 'updated', path: filePath });
      res.json({ success: true });
    } catch (err) {
      const msg = errMsg(err);
      const status = msg.includes('traversal') ? 403 : msg.includes('not found') ? 404 : 500;
      res.status(status).json({ success: false, error: msg });
    }
  });

  // POST /config/:type/file — create file { path, content }
  router.post('/config/:type/file', (req, res) => {
    const type = parseType(req.params.type, res);
    if (!type) return;

    const { path: filePath, content } = req.body as { path?: string; content?: string };
    if (!filePath || content === undefined) {
      res.status(400).json({ success: false, error: 'path and content are required' });
      return;
    }

    try {
      const basePath = configService.getBasePath(type);
      configService.createFile(basePath, filePath, content);
      io.emit(`config:${type}:changed`, { action: 'created', path: filePath });
      res.status(201).json({ success: true });
    } catch (err) {
      const msg = errMsg(err);
      const status = msg.includes('traversal') ? 403 : msg.includes('already exists') ? 409 : 500;
      res.status(status).json({ success: false, error: msg });
    }
  });

  // DELETE /config/:type/file?path=<relative> — delete file
  router.delete('/config/:type/file', (req, res) => {
    const type = parseType(req.params.type, res);
    if (!type) return;

    const filePath = req.query.path as string | undefined;
    if (!filePath) {
      res.status(400).json({ success: false, error: 'path query parameter is required' });
      return;
    }

    try {
      const basePath = configService.getBasePath(type);
      configService.deleteFile(basePath, filePath);
      io.emit(`config:${type}:changed`, { action: 'deleted', path: filePath });
      res.json({ success: true });
    } catch (err) {
      const msg = errMsg(err);
      const status = msg.includes('traversal') ? 403 : msg.includes('not found') ? 404 : msg.includes('directory') ? 400 : 500;
      res.status(status).json({ success: false, error: msg });
    }
  });

  // POST /config/:type/rename — rename { oldPath, newPath }
  router.post('/config/:type/rename', (req, res) => {
    const type = parseType(req.params.type, res);
    if (!type) return;

    const { oldPath, newPath } = req.body as { oldPath?: string; newPath?: string };
    if (!oldPath || !newPath) {
      res.status(400).json({ success: false, error: 'oldPath and newPath are required' });
      return;
    }

    try {
      const basePath = configService.getBasePath(type);
      configService.renameFile(basePath, oldPath, newPath);
      io.emit(`config:${type}:changed`, { action: 'renamed', oldPath, newPath });
      res.json({ success: true });
    } catch (err) {
      const msg = errMsg(err);
      const status = msg.includes('traversal') ? 403 : msg.includes('not found') ? 404 : msg.includes('already exists') ? 409 : 500;
      res.status(status).json({ success: false, error: msg });
    }
  });

  // POST /config/:type/folder — create folder { path }
  router.post('/config/:type/folder', (req, res) => {
    const type = parseType(req.params.type, res);
    if (!type) return;

    const { path: folderPath } = req.body as { path?: string };
    if (!folderPath) {
      res.status(400).json({ success: false, error: 'path is required' });
      return;
    }

    try {
      const basePath = configService.getBasePath(type);
      configService.createFolder(basePath, folderPath);
      io.emit(`config:${type}:changed`, { action: 'folder-created', path: folderPath });
      res.status(201).json({ success: true });
    } catch (err) {
      const msg = errMsg(err);
      const status = msg.includes('traversal') ? 403 : msg.includes('already exists') ? 409 : 500;
      res.status(status).json({ success: false, error: msg });
    }
  });

  return router;
}

