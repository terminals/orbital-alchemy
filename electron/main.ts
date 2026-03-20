import { app, BrowserWindow, shell, dialog, Menu } from 'electron';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import type { ServerInstance } from '../server/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow: BrowserWindow | null = null;
let server: ServerInstance | null = null;

// ─── Project Resolution ──────────────────────────────────────

function getRecentProjectsPath(): string {
  return path.join(app.getPath('userData'), 'recent-projects.json');
}

function loadRecentProjects(): string[] {
  try {
    const data = fs.readFileSync(getRecentProjectsPath(), 'utf-8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

function saveRecentProject(projectRoot: string): void {
  const recent = loadRecentProjects().filter(p => p !== projectRoot);
  recent.unshift(projectRoot);
  // Keep last 10
  fs.writeFileSync(getRecentProjectsPath(), JSON.stringify(recent.slice(0, 10), null, 2));
}

function isOrbitalProject(dir: string): boolean {
  return fs.existsSync(path.join(dir, '.claude', 'orbital.config.json'));
}

function loadProjectConfig(projectRoot: string): { serverPort?: number; projectName?: string } {
  const configPath = path.join(projectRoot, '.claude', 'orbital.config.json');
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  } catch {
    return {};
  }
}

// ─── Resolve project root from CLI args or prompt user ───────

async function resolveProjectRoot(): Promise<string | null> {
  // 1. CLI arg: `orbital /path/to/project` or launched from a directory
  const cliArg = process.argv.find((arg, i) => i > 0 && !arg.startsWith('-') && fs.existsSync(arg));
  if (cliArg) {
    const resolved = path.resolve(cliArg);
    if (fs.statSync(resolved).isDirectory()) return resolved;
  }

  // 2. ORBITAL_PROJECT_ROOT env var
  if (process.env.ORBITAL_PROJECT_ROOT) {
    return path.resolve(process.env.ORBITAL_PROJECT_ROOT);
  }

  // 3. Show folder picker dialog
  const result = await dialog.showOpenDialog({
    title: 'Open Project — Orbital Command',
    message: 'Select a project directory to manage with Orbital Command',
    properties: ['openDirectory', 'createDirectory'],
    buttonLabel: 'Open Project',
  });

  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
}

// ─── Window Creation ─────────────────────────────────────────

async function createWindow(projectRoot: string) {
  const projectConfig = loadProjectConfig(projectRoot);
  const port = projectConfig.serverPort || 4444;
  const projectName = projectConfig.projectName || path.basename(projectRoot);

  // Start the Express + Socket.io server
  // Dynamic import to avoid loading server modules until needed
  const { startServer } = await import('../server/index.js');
  server = await startServer({ port, projectRoot });

  // Save to recent projects
  saveRecentProject(projectRoot);

  // Get the actual port the server is listening on
  const addr = server.httpServer.address();
  const actualPort = typeof addr === 'object' && addr ? addr.port : port;

  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: `Orbital Command — ${projectName}`,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: '#0a0a0a',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'), // compiled alongside main.js
    },
  });

  mainWindow.loadURL(`http://localhost:${actualPort}`);

  // Open external links in system browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://localhost:')) return { action: 'allow' };
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ─── Menu ────────────────────────────────────────────────────

function buildMenu(projectRoot?: string) {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'File',
      submenu: [
        {
          label: 'Open Project…',
          accelerator: 'CmdOrCtrl+O',
          click: async () => {
            const result = await dialog.showOpenDialog({
              title: 'Open Project',
              properties: ['openDirectory'],
              buttonLabel: 'Open Project',
            });
            if (!result.canceled && result.filePaths.length > 0) {
              // Restart with new project
              if (server) await server.shutdown();
              server = null;
              if (mainWindow) mainWindow.close();
              await createWindow(result.filePaths[0]);
              buildMenu(result.filePaths[0]);
            }
          },
        },
        { type: 'separator' },
        {
          label: 'Initialize Project',
          enabled: !!projectRoot && !isOrbitalProject(projectRoot),
          click: async () => {
            if (!projectRoot) return;
            try {
              const { runInit } = await import('../server/init.js');
              runInit(projectRoot, { force: false });
              dialog.showMessageBox({
                type: 'info',
                title: 'Project Initialized',
                message: 'Orbital Command has been set up for this project.',
                detail: 'Hooks, skills, agents, and workflow config have been installed.',
              });
              // Reload
              if (mainWindow) mainWindow.webContents.reload();
            } catch (err) {
              dialog.showErrorBox('Init Failed', (err as Error).message);
            }
          },
        },
        { type: 'separator' },
        { role: 'close' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { type: 'separator' },
        { role: 'front' },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ─── App Lifecycle ───────────────────────────────────────────

app.setName('Orbital Command');

app.whenReady().then(async () => {
  const projectRoot = await resolveProjectRoot();

  if (!projectRoot) {
    app.quit();
    return;
  }

  // Check if project is initialized
  if (!isOrbitalProject(projectRoot)) {
    const response = await dialog.showMessageBox({
      type: 'question',
      title: 'Set Up Project',
      message: `"${path.basename(projectRoot)}" hasn't been set up for Orbital Command yet.`,
      detail: 'Would you like to initialize it now? This will create hooks, skills, agents, and workflow configuration.',
      buttons: ['Set Up Now', 'Open Anyway', 'Cancel'],
      defaultId: 0,
      cancelId: 2,
    });

    if (response.response === 2) {
      app.quit();
      return;
    }

    if (response.response === 0) {
      try {
        const { runInit } = await import('../server/init.js');
        runInit(projectRoot, { force: false });
      } catch (err) {
        dialog.showErrorBox('Initialization Failed', (err as Error).message);
        app.quit();
        return;
      }
    }
  }

  buildMenu(projectRoot);
  await createWindow(projectRoot);
});

app.on('window-all-closed', async () => {
  if (server) {
    await server.shutdown();
    server = null;
  }
  app.quit();
});

app.on('activate', async () => {
  // macOS: re-create window when dock icon clicked
  if (BrowserWindow.getAllWindows().length === 0) {
    const recent = loadRecentProjects();
    if (recent.length > 0) {
      await createWindow(recent[0]);
    }
  }
});
