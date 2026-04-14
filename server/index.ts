import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createVersionRoutes } from './routes/version-routes.js';
import { createAggregateRoutes } from './routes/aggregate-routes.js';
import { createLogger, setLogLevel } from './utils/logger.js';
import type { LogLevel } from './utils/logger.js';

import type http from 'http';

// ─── Central Server ─────────────────────────────────────────

import { ProjectManager } from './project-manager.js';
import { SyncService } from './services/sync-service.js';
import { startGlobalWatcher } from './watchers/global-watcher.js';
import { createSyncRoutes } from './routes/sync-routes.js';
import { seedGlobalPrimitives } from './init.js';
import {
  ensureOrbitalHome,
  loadGlobalConfig,
  registerProject as registerProjectGlobal,
  GLOBAL_PRIMITIVES_DIR,
  ORBITAL_HOME,
} from './global-config.js';

export interface CentralServerOverrides {
  port?: number;
  clientPort?: number;
  /** If set, auto-register this project on first launch */
  autoRegisterPath?: string;
}

export interface CentralServerInstance {
  app: express.Application;
  io: Server;
  projectManager: ProjectManager;
  syncService: SyncService;
  httpServer: http.Server;
  shutdown: () => Promise<void>;
}

export async function startCentralServer(overrides?: CentralServerOverrides): Promise<CentralServerInstance> {
  ensureOrbitalHome();

  const envLevel = process.env.ORBITAL_LOG_LEVEL;
  if (envLevel && ['debug', 'info', 'warn', 'error'].includes(envLevel)) {
    setLogLevel(envLevel as LogLevel);
  }
  const log = createLogger('central');
  const port = overrides?.port ?? (Number(process.env.ORBITAL_SERVER_PORT) || 4444);
  const clientPort = overrides?.clientPort ?? (Number(process.env.ORBITAL_CLIENT_PORT) || 4445);

  // Auto-register current project if registry is empty
  const globalConfig = loadGlobalConfig();
  if (globalConfig.projects.length === 0 && overrides?.autoRegisterPath) {
    registerProjectGlobal(overrides.autoRegisterPath);
    log.info('Auto-registered current project', { path: overrides.autoRegisterPath });
  }

  const app = express();
  const httpServer = createServer(app);

  const io = new Server(httpServer, {
    cors: {
      origin: (origin, callback) => {
        if (!origin || origin.startsWith('http://localhost:')) {
          callback(null, true);
        } else {
          callback(new Error('CORS not allowed'));
        }
      },
      methods: ['GET', 'POST'],
    },
  });

  app.use(express.json());

  // ─── Bind port early ──────────────────────────────────────
  // Listen before async init so Vite's proxy doesn't get ECONNREFUSED
  const actualPort = await new Promise<number>((resolve, reject) => {
    let attempt = 0;
    const maxAttempts = 10;

    httpServer.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE' && attempt < maxAttempts) {
        attempt++;
        httpServer.listen(port + attempt);
      } else {
        reject(new Error(`Failed to start server: ${err.message}`));
      }
    });

    httpServer.on('listening', () => {
      const addr = httpServer.address();
      resolve(typeof addr === 'object' && addr ? addr.port : port);
    });

    httpServer.listen(port);
  });

  // Initialize ProjectManager and boot all registered projects
  const projectManager = new ProjectManager(io);
  await projectManager.initializeAll();

  // Seed global primitives if empty (lazy fallback for first launch)
  const globalPrimitivesEmpty = ['agents', 'skills', 'hooks'].every(t => {
    const dir = path.join(GLOBAL_PRIMITIVES_DIR, t);
    return !fs.existsSync(dir) || fs.readdirSync(dir).filter(f => !f.startsWith('.')).length === 0;
  });
  if (globalPrimitivesEmpty) {
    seedGlobalPrimitives();
    log.info('Seeded global primitives from package templates');
  }

  // Initialize SyncService and global watcher
  const syncService = new SyncService();
  const globalWatcher = startGlobalWatcher(syncService, io);

  // ─── Routes ──────────────────────────────────────────────

  // Health check
  app.get('/api/orbital/health', (_req, res) => {
    res.json({ status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() });
  });

  // Project management + sync routes (top-level)
  app.use('/api/orbital', createSyncRoutes({ syncService, projectManager }));
  app.use('/api/orbital', createVersionRoutes({ io }));

  // Per-project routes — dynamic middleware that resolves :projectId
  app.use('/api/orbital/projects/:projectId', (req, res, next) => {
    const projectId = req.params.projectId;
    const router = projectManager.getRouter(projectId);
    if (!router) {
      const ctx = projectManager.getContext(projectId);
      if (!ctx) return res.status(404).json({ error: `Project '${projectId}' not found` });
      return res.status(503).json({ error: `Project '${projectId}' is offline` });
    }
    router(req, res, next);
  });

  // Aggregate endpoints (cross-project)
  app.use('/api/orbital', createAggregateRoutes({ projectManager, io, syncService }));

  // ─── Static File Serving ─────────────────────────────────

  const __selfDir = path.dirname(fileURLToPath(import.meta.url));
  // Find package root — works from both source (server/) and compiled (dist/server/server/)
  let pkgRoot = __selfDir;
  while (pkgRoot !== path.dirname(pkgRoot)) {
    if (fs.existsSync(path.join(pkgRoot, 'package.json'))) break;
    pkgRoot = path.dirname(pkgRoot);
  }
  const distDir = path.join(pkgRoot, 'dist');
  const hasBuiltFrontend = fs.existsSync(path.join(distDir, 'index.html'));
  const devMode = !hasBuiltFrontend;
  if (hasBuiltFrontend) {
    app.use(express.static(distDir));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/') || req.path.startsWith('/socket.io')) return next();
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    app.get('/', (_req, res) => res.redirect(`http://localhost:${clientPort}`));
  }

  // ─── Socket.io ───────────────────────────────────────────

  io.on('connection', (socket) => {
    log.debug('Client connected', { socketId: socket.id });

    socket.on('subscribe', (payload: { projectId?: string; scope?: string }) => {
      if (payload.scope === 'all') {
        socket.join('all-projects');
      } else if (payload.projectId) {
        socket.join(`project:${payload.projectId}`);
      }
    });

    socket.on('unsubscribe', (payload: { projectId?: string; scope?: string }) => {
      if (payload.scope === 'all') {
        socket.leave('all-projects');
      } else if (payload.projectId) {
        socket.leave(`project:${payload.projectId}`);
      }
    });

    socket.on('disconnect', () => {
      log.debug('Client disconnected', { socketId: socket.id });
    });
  });

  // ─── Error Handling Middleware ─────────────────────────────
  // Catches unhandled errors thrown from route handlers.

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    log.error('Unhandled route error', { error: err.message, stack: err.stack });
    if (!res.headersSent) {
      res.status(500).json({ ok: false, error: 'Internal server error' });
    }
  });

  // ─── Startup Banner ──────────────────────────────────────

  const projectList = projectManager.getProjectList();
  const projectLines = projectList.map(p =>
    `║  ${p.status === 'active' ? '●' : '○'} ${p.name.padEnd(20)} ${String(p.scopeCount).padStart(3)} scopes    ${p.status.padEnd(8)} ║`
  ).join('\n');

  const dashboardPort = devMode ? clientPort : actualPort;

  // eslint-disable-next-line no-console
  console.log(`
╔══════════════════════════════════════════════════════╗
║         Orbital Command — Central Server             ║
║                                                      ║
║  >>> Open: http://localhost:${String(dashboardPort).padEnd(25)} <<<║
║                                                      ║
╠══════════════════════════════════════════════════════╣
${projectLines}
╠══════════════════════════════════════════════════════╣
║  API:       http://localhost:${actualPort}/api/orbital/*       ║
║  Socket.io: ws://localhost:${actualPort}                      ║
║  Home:      ${ORBITAL_HOME.padEnd(39)} ║
╚══════════════════════════════════════════════════════╝
`);

  // ─── Graceful Shutdown ───────────────────────────────────

  let shuttingDown = false;
  async function shutdown(): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info('Shutting down central server');

    if (globalWatcher) await globalWatcher.close();
    await projectManager.shutdownAll();

    return new Promise<void>((resolve) => {
      const forceTimeout = setTimeout(resolve, 2000);
      io.close(() => {
        clearTimeout(forceTimeout);
        resolve();
      });
    });
  }

  return { app, io, projectManager, syncService, httpServer, shutdown };
}

// ─── Direct Execution (backward compat: tsx watch server/index.ts) ───

const isDirectRun = process.argv[1] && (
  process.argv[1].endsWith('server/index.ts') ||
  process.argv[1].endsWith('server/index.js') ||
  process.argv[1].endsWith('server')
);

if (isDirectRun) {
  const projectRoot = process.env.ORBITAL_PROJECT_ROOT || process.cwd();
  startCentralServer({
    port: Number(process.env.ORBITAL_SERVER_PORT) || 4444,
    autoRegisterPath: projectRoot,
  }).then(({ shutdown }) => {
    process.on('SIGINT', async () => {
      await shutdown();
      process.exit(0);
    });
    process.on('SIGTERM', async () => {
      await shutdown();
      process.exit(0);
    });
  }).catch((err) => {
    createLogger('server').error('Failed to start server', { error: err.message });
    process.exit(1);
  });
}
