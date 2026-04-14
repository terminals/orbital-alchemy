import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import {
  PACKAGE_ROOT,
  resolveBin,
  detectProjectRoot,
  loadConfig,
  openBrowser,
} from '../lib/helpers.js';

export function cmdLaunchOrDev(forceViteFlag) {
  const shouldOpen = !process.argv.includes('--no-open');
  const forceVite = forceViteFlag || process.argv.includes('--vite');
  const projectRoot = detectProjectRoot();
  const config = loadConfig(projectRoot);
  const serverPort = config.serverPort || 4444;
  const clientPort = config.clientPort || 4445;

  // Detect packaged mode: dist/index.html exists -> serve pre-built frontend
  const hasPrebuiltFrontend = fs.existsSync(path.join(PACKAGE_ROOT, 'dist', 'index.html'));
  const useVite = forceVite || !hasPrebuiltFrontend;

  // Detect compiled server: dist/server/server/launch.js exists -> run with node
  const compiledServer = path.join(PACKAGE_ROOT, 'dist', 'server', 'server', 'launch.js');
  const hasCompiledServer = fs.existsSync(compiledServer);
  const useCompiledServer = hasCompiledServer && !useVite;

  console.log(`\nOrbital Command — ${useVite ? 'dev' : 'launch'}`);
  console.log(`Project root: ${projectRoot}`);
  if (useVite) {
    console.log(`Server: http://localhost:${serverPort}`);
    console.log(`Client: http://localhost:${clientPort} (Vite dev server)\n`);
  } else {
    console.log(`Dashboard: http://localhost:${serverPort}\n`);
  }

  const env = {
    ...process.env,
    ORBITAL_LAUNCH_MODE: 'central',
    ORBITAL_SERVER_PORT: String(serverPort),
  };

  let serverProcess;

  if (useCompiledServer) {
    serverProcess = spawn(process.execPath, [compiledServer],
      { stdio: 'inherit', env, cwd: PACKAGE_ROOT });
  } else {
    const tsxBin = resolveBin('tsx');
    const serverScript = path.join(PACKAGE_ROOT, 'server', 'launch.ts');
    if (tsxBin) {
      serverProcess = spawn(tsxBin, ['watch', serverScript],
        { stdio: 'inherit', env, cwd: PACKAGE_ROOT });
    } else {
      console.error('Error: tsx not found. Install it with: npm install tsx');
      process.exit(1);
    }
  }

  let viteProcess = null;

  if (useVite) {
    const viteBin = resolveBin('vite');
    if (!viteBin) {
      console.error('Error: vite not found. Install it with: npm install vite');
      process.exit(1);
    }
    viteProcess = spawn(viteBin, ['--config', path.join(PACKAGE_ROOT, 'vite.config.ts'), '--port', String(clientPort)],
      { stdio: 'inherit', env, cwd: PACKAGE_ROOT });
  }

  const dashboardUrl = useVite
    ? `http://localhost:${clientPort}`
    : `http://localhost:${serverPort}`;

  if (shouldOpen) {
    setTimeout(() => openBrowser(dashboardUrl), 2000);
  }

  let exiting = false;

  function cleanup() {
    if (exiting) return;
    exiting = true;
    serverProcess.kill();
    if (viteProcess) viteProcess.kill();
    process.exit(0);
  }
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  serverProcess.on('exit', (code) => {
    if (exiting) return;
    exiting = true;
    console.log(`Server exited with code ${code}`);
    if (viteProcess) viteProcess.kill();
    process.exit(code || 0);
  });
  if (viteProcess) {
    viteProcess.on('exit', (code) => {
      if (exiting) return;
      exiting = true;
      console.log(`Vite exited with code ${code}`);
      serverProcess.kill();
      process.exit(code || 0);
    });
  }
}

export function cmdBuild() {
  console.log(`\nOrbital Command — build\n`);

  const viteBin = resolveBin('vite');
  if (!viteBin) {
    console.error('Error: vite not found. Install it with: npm install vite');
    process.exit(1);
  }
  const buildProcess = spawn(viteBin, ['build', '--config', path.join(PACKAGE_ROOT, 'vite.config.ts')],
    { stdio: 'inherit', cwd: PACKAGE_ROOT });

  buildProcess.on('exit', (code) => {
    process.exit(code || 0);
  });
}
