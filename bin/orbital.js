#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { spawn, execSync } from 'child_process';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PACKAGE_ROOT = path.resolve(__dirname, '..');
const TEMPLATES_DIR = path.join(PACKAGE_ROOT, 'templates');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function detectProjectRoot() {
  try {
    return execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim();
  } catch {
    return process.cwd();
  }
}

function loadConfig(projectRoot) {
  const configPath = path.join(projectRoot, '.claude', 'orbital.config.json');
  if (fs.existsSync(configPath)) {
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  }
  return { serverPort: 4444, clientPort: 4445 };
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    return true;
  }
  return false;
}

/**
 * Recursively copy a directory. If overwrite is false, existing files are
 * skipped and the skipped paths are returned.
 */
function copyDirSync(src, dest, { overwrite = false } = {}) {
  const created = [];
  const skipped = [];

  if (!fs.existsSync(src)) return { created, skipped };

  ensureDir(dest);

  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      const sub = copyDirSync(srcPath, destPath, { overwrite });
      created.push(...sub.created);
      skipped.push(...sub.skipped);
    } else {
      if (!overwrite && fs.existsSync(destPath)) {
        skipped.push(destPath);
      } else {
        ensureDir(path.dirname(destPath));
        fs.copyFileSync(srcPath, destPath);
        created.push(destPath);
      }
    }
  }
  return { created, skipped };
}

/**
 * Make all .sh files under a directory executable.
 */
function chmodScripts(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      chmodScripts(fullPath);
    } else if (entry.name.endsWith('.sh')) {
      fs.chmodSync(fullPath, 0o755);
    }
  }
}

/**
 * Deep-merge Claude Code settings-hooks into an existing settings.local.json.
 *
 * Algorithm:
 *  - For each lifecycle event (SessionStart, PreToolUse, etc.) in the source:
 *    - If it does not exist in the target, copy it wholesale.
 *    - If it exists, for each hook group (an entry in the array):
 *      - Add individual hook entries that carry `_orbital: true` and are not
 *        already present (matched by command string).
 *  - Non-hooks keys in the target are never touched.
 */
function mergeSettingsHooks(targetPath, sourcePath) {
  let target = {};
  if (fs.existsSync(targetPath)) {
    try {
      target = JSON.parse(fs.readFileSync(targetPath, 'utf8'));
    } catch {
      // Malformed JSON — start fresh but warn
      console.warn('  Warning: existing settings.local.json is malformed — creating new one');
      target = {};
    }
  }

  if (!fs.existsSync(sourcePath)) {
    console.warn('  Warning: settings-hooks template not found, skipping hook registration');
    return;
  }

  const source = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
  const sourceHooks = source.hooks || {};

  if (!target.hooks) target.hooks = {};

  for (const [event, sourceGroups] of Object.entries(sourceHooks)) {
    if (!target.hooks[event]) {
      // Event not in target — copy wholesale, tag every hook entry
      target.hooks[event] = tagOrbitalGroups(sourceGroups);
      continue;
    }

    // Event exists — merge each source group
    for (const sourceGroup of sourceGroups) {
      const sourceMatcher = sourceGroup.matcher || '__none__';
      // Find matching group in target (same matcher)
      const targetGroup = target.hooks[event].find(
        (g) => (g.matcher || '__none__') === sourceMatcher
      );

      if (!targetGroup) {
        // No matching group — add it
        target.hooks[event].push(tagOrbitalGroup(sourceGroup));
        continue;
      }

      // Group exists — add missing orbital hooks
      for (const hook of sourceGroup.hooks || []) {
        const taggedHook = { ...hook, _orbital: true };
        const alreadyPresent = (targetGroup.hooks || []).some(
          (h) => h.command === hook.command
        );
        if (!alreadyPresent) {
          if (!targetGroup.hooks) targetGroup.hooks = [];
          targetGroup.hooks.push(taggedHook);
        }
      }
    }
  }

  fs.writeFileSync(targetPath, JSON.stringify(target, null, 2) + '\n', 'utf8');
}

/** Tag all hooks in a group array with _orbital: true */
function tagOrbitalGroups(groups) {
  return groups.map(tagOrbitalGroup);
}

function tagOrbitalGroup(group) {
  return {
    ...group,
    hooks: (group.hooks || []).map((h) => ({ ...h, _orbital: true })),
  };
}

/**
 * Append Orbital-specific lines to .gitignore if not already present.
 */
function updateGitignore(projectRoot) {
  const gitignorePath = path.join(projectRoot, '.gitignore');
  const marker = '# Orbital Command';
  const lines = [
    '',
    marker,
    'scopes/',
    '.claude/orbital/',
    '.claude/orbital-events/',
    '.claude/config/workflow-manifest.sh',
    '',
  ];

  let existing = '';
  if (fs.existsSync(gitignorePath)) {
    existing = fs.readFileSync(gitignorePath, 'utf8');
  }

  if (existing.includes(marker)) {
    return false; // already present
  }

  fs.appendFileSync(gitignorePath, lines.join('\n'), 'utf8');
  return true;
}

/**
 * List all files that originated from the templates directory (by listing
 * what the template dir contains). Used by uninstall.
 */
function listTemplateFiles(templateSubdir, targetDir) {
  const files = [];
  if (!fs.existsSync(templateSubdir)) return files;

  for (const entry of fs.readdirSync(templateSubdir, { withFileTypes: true })) {
    const targetPath = path.join(targetDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listTemplateFiles(path.join(templateSubdir, entry.name), targetPath));
    } else {
      files.push(targetPath);
    }
  }
  return files;
}

/** Remove empty directories recursively (bottom-up). */
function cleanEmptyDirs(dir) {
  if (!fs.existsSync(dir)) return;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      cleanEmptyDirs(path.join(dir, entry.name));
    }
  }

  // After cleaning children, remove if now empty
  if (fs.readdirSync(dir).length === 0) {
    fs.rmdirSync(dir);
  }
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

function cmdInit(args) {
  const force = args.includes('--force');
  const projectRoot = detectProjectRoot();
  const claudeDir = path.join(projectRoot, '.claude');

  console.log(`\nOrbital Command — init`);
  console.log(`Project root: ${projectRoot}\n`);

  // 1. Create directories
  const dirs = [
    path.join(projectRoot, 'scopes', 'icebox'),
    path.join(claudeDir, 'orbital-events'),
    path.join(claudeDir, 'orbital'),
    path.join(claudeDir, 'config'),
    path.join(claudeDir, 'review-verdicts'),
  ];
  for (const dir of dirs) {
    const wasCreated = ensureDir(dir);
    console.log(`  ${wasCreated ? 'Created' : 'Exists '}  ${path.relative(projectRoot, dir)}/`);
  }

  // 2. Copy orbital.config.json template
  const configDest = path.join(claudeDir, 'orbital.config.json');
  const configSrc = path.join(TEMPLATES_DIR, 'orbital.config.json');
  if (!fs.existsSync(configDest)) {
    if (fs.existsSync(configSrc)) {
      fs.copyFileSync(configSrc, configDest);
      console.log(`  Created  .claude/orbital.config.json`);
    } else {
      // Write a sensible default
      const defaultConfig = {
        serverPort: 4444,
        clientPort: 4445,
        projectName: path.basename(projectRoot),
      };
      fs.writeFileSync(configDest, JSON.stringify(defaultConfig, null, 2) + '\n', 'utf8');
      console.log(`  Created  .claude/orbital.config.json (default)`);
    }
  } else {
    console.log(`  Exists   .claude/orbital.config.json`);
  }

  // 3. Copy hooks
  console.log('');
  const hooksSrc = path.join(TEMPLATES_DIR, 'hooks');
  const hooksDest = path.join(claudeDir, 'hooks');
  const hooksResult = copyDirSync(hooksSrc, hooksDest, { overwrite: force });
  console.log(`  Hooks    ${hooksResult.created.length} copied, ${hooksResult.skipped.length} skipped`);

  // 4. Copy skills
  const skillsSrc = path.join(TEMPLATES_DIR, 'skills');
  const skillsDest = path.join(claudeDir, 'skills');
  const skillsResult = copyDirSync(skillsSrc, skillsDest, { overwrite: force });
  console.log(`  Skills   ${skillsResult.created.length} copied, ${skillsResult.skipped.length} skipped`);

  // 5. Copy agents
  const agentsSrc = path.join(TEMPLATES_DIR, 'agents');
  const agentsDest = path.join(claudeDir, 'agents');
  const agentsResult = copyDirSync(agentsSrc, agentsDest, { overwrite: force });
  console.log(`  Agents   ${agentsResult.created.length} copied, ${agentsResult.skipped.length} skipped`);

  // 6. Copy workflow presets
  const presetsSrc = path.join(TEMPLATES_DIR, 'presets');
  const presetsDest = path.join(claudeDir, 'config', 'workflows');
  if (fs.existsSync(presetsSrc) && fs.readdirSync(presetsSrc).length > 0) {
    const presetsResult = copyDirSync(presetsSrc, presetsDest, { overwrite: force });
    console.log(`  Presets  ${presetsResult.created.length} copied, ${presetsResult.skipped.length} skipped`);
  }

  // 7. Copy agent-triggers.json
  const triggersSrc = path.join(TEMPLATES_DIR, 'config', 'agent-triggers.json');
  const triggersDest = path.join(claudeDir, 'config', 'agent-triggers.json');
  if (fs.existsSync(triggersSrc)) {
    if (force || !fs.existsSync(triggersDest)) {
      fs.copyFileSync(triggersSrc, triggersDest);
      console.log(`  Created  .claude/config/agent-triggers.json`);
    } else {
      console.log(`  Exists   .claude/config/agent-triggers.json`);
    }
  }

  // 8. Merge hook registrations into settings.local.json
  console.log('');
  const settingsTarget = path.join(claudeDir, 'settings.local.json');
  const settingsSrc = path.join(TEMPLATES_DIR, 'settings-hooks-reference.json');
  mergeSettingsHooks(settingsTarget, settingsSrc);
  console.log(`  Merged   hook registrations into .claude/settings.local.json`);

  // 9. Update .gitignore
  const gitignoreUpdated = updateGitignore(projectRoot);
  console.log(`  ${gitignoreUpdated ? 'Updated' : 'Exists '}  .gitignore (Orbital patterns)`);

  // 10. Make hook scripts executable
  chmodScripts(hooksDest);
  console.log(`  chmod    hook scripts set to executable`);

  // Summary
  const totalCreated = hooksResult.created.length + skillsResult.created.length + agentsResult.created.length;
  const totalSkipped = hooksResult.skipped.length + skillsResult.skipped.length + agentsResult.skipped.length;
  console.log(`\nDone. ${totalCreated} files installed, ${totalSkipped} skipped (use --force to overwrite).`);
  console.log(`Run \`orbital dev\` to start the development server.\n`);
}

function cmdDev() {
  const projectRoot = detectProjectRoot();
  const config = loadConfig(projectRoot);
  const serverPort = config.serverPort || 4444;
  const clientPort = config.clientPort || 4445;

  console.log(`\nOrbital Command — dev`);
  console.log(`Project root: ${projectRoot}`);
  console.log(`Server: http://localhost:${serverPort}`);
  console.log(`Client: http://localhost:${clientPort}\n`);

  const env = {
    ...process.env,
    ORBITAL_PROJECT_ROOT: projectRoot,
    PORT: String(serverPort),
  };

  // Start the API server
  const serverProcess = spawn(
    'npx',
    ['tsx', 'watch', path.join(PACKAGE_ROOT, 'server', 'index.ts')],
    { stdio: 'inherit', env, cwd: PACKAGE_ROOT }
  );

  // Start the Vite dev server
  const viteProcess = spawn(
    'npx',
    ['vite', '--config', path.join(PACKAGE_ROOT, 'vite.config.ts'), '--port', String(clientPort)],
    { stdio: 'inherit', cwd: PACKAGE_ROOT }
  );

  // Clean shutdown on SIGINT/SIGTERM
  function cleanup() {
    serverProcess.kill();
    viteProcess.kill();
    process.exit(0);
  }
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  // Exit if either process dies
  serverProcess.on('exit', (code) => {
    console.log(`Server exited with code ${code}`);
    viteProcess.kill();
    process.exit(code || 0);
  });
  viteProcess.on('exit', (code) => {
    console.log(`Vite exited with code ${code}`);
    serverProcess.kill();
    process.exit(code || 0);
  });
}

function cmdBuild() {
  console.log(`\nOrbital Command — build\n`);

  const buildProcess = spawn(
    'npx',
    ['vite', 'build', '--config', path.join(PACKAGE_ROOT, 'vite.config.ts')],
    { stdio: 'inherit', cwd: PACKAGE_ROOT }
  );

  buildProcess.on('exit', (code) => {
    process.exit(code || 0);
  });
}

function cmdEmit(args) {
  const type = args[0];
  const jsonStr = args.slice(1).join(' ');

  if (!type) {
    console.error('Usage: orbital emit <TYPE> <JSON>');
    process.exit(1);
  }

  const projectRoot = detectProjectRoot();
  const eventsDir = path.join(projectRoot, '.claude', 'orbital-events');
  ensureDir(eventsDir);

  let payload;
  try {
    payload = jsonStr ? JSON.parse(jsonStr) : {};
  } catch (err) {
    console.error(`Invalid JSON: ${err.message}`);
    process.exit(1);
  }

  const eventId = crypto.randomUUID();
  const event = {
    id: eventId,
    type,
    timestamp: new Date().toISOString(),
    ...payload,
  };

  const filePath = path.join(eventsDir, `${eventId}.json`);
  fs.writeFileSync(filePath, JSON.stringify(event, null, 2) + '\n', 'utf8');

  console.log(`Event emitted: ${type} (${eventId})`);
  console.log(`  File: ${path.relative(projectRoot, filePath)}`);
}

function cmdUpdate(args) {
  const includeExamples = args.includes('--include-examples');
  const projectRoot = detectProjectRoot();
  const claudeDir = path.join(projectRoot, '.claude');

  console.log(`\nOrbital Command — update`);
  console.log(`Project root: ${projectRoot}\n`);

  // 1. Copy hooks (overwrite)
  const hooksSrc = path.join(TEMPLATES_DIR, 'hooks');
  const hooksDest = path.join(claudeDir, 'hooks');
  const hooksResult = copyDirSync(hooksSrc, hooksDest, { overwrite: true });
  console.log(`  Hooks    ${hooksResult.created.length} updated`);

  // 2. Copy skills (overwrite)
  const skillsSrc = path.join(TEMPLATES_DIR, 'skills');
  const skillsDest = path.join(claudeDir, 'skills');
  const skillsResult = copyDirSync(skillsSrc, skillsDest, { overwrite: true });
  console.log(`  Skills   ${skillsResult.created.length} updated`);

  // 3. Copy agents (overwrite, skip domain-examples unless flag set)
  const agentsSrc = path.join(TEMPLATES_DIR, 'agents');
  const agentsDest = path.join(claudeDir, 'agents');

  if (includeExamples) {
    const agentsResult = copyDirSync(agentsSrc, agentsDest, { overwrite: true });
    console.log(`  Agents   ${agentsResult.created.length} updated (including examples)`);
  } else {
    // Copy everything except domain-examples/
    let agentsCount = 0;
    for (const entry of fs.readdirSync(agentsSrc, { withFileTypes: true })) {
      if (entry.name === 'domain-examples') continue;
      const srcPath = path.join(agentsSrc, entry.name);
      const destPath = path.join(agentsDest, entry.name);
      if (entry.isDirectory()) {
        const sub = copyDirSync(srcPath, destPath, { overwrite: true });
        agentsCount += sub.created.length;
      } else {
        ensureDir(path.dirname(destPath));
        fs.copyFileSync(srcPath, destPath);
        agentsCount++;
      }
    }
    console.log(`  Agents   ${agentsCount} updated (skipping domain-examples)`);
  }

  // 4. Re-merge settings hooks
  const settingsTarget = path.join(claudeDir, 'settings.local.json');
  const settingsSrc = path.join(TEMPLATES_DIR, 'settings-hooks-reference.json');
  mergeSettingsHooks(settingsTarget, settingsSrc);
  console.log(`  Merged   hook registrations into .claude/settings.local.json`);

  // 5. Make hook scripts executable
  chmodScripts(hooksDest);
  console.log(`  chmod    hook scripts set to executable`);

  console.log(`\nUpdate complete.\n`);
}

function cmdUninstall() {
  const projectRoot = detectProjectRoot();
  const claudeDir = path.join(projectRoot, '.claude');

  console.log(`\nOrbital Command — uninstall`);
  console.log(`Project root: ${projectRoot}\n`);

  let removedCount = 0;

  // 1. Remove orbital hooks from settings.local.json
  const settingsPath = path.join(claudeDir, 'settings.local.json');
  if (fs.existsSync(settingsPath)) {
    try {
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      if (settings.hooks) {
        for (const [event, groups] of Object.entries(settings.hooks)) {
          for (const group of groups) {
            if (group.hooks) {
              const before = group.hooks.length;
              group.hooks = group.hooks.filter((h) => !h._orbital);
              removedCount += before - group.hooks.length;
            }
          }
          // Remove empty groups
          settings.hooks[event] = settings.hooks[event].filter(
            (g) => g.hooks && g.hooks.length > 0
          );
          // Remove empty events
          if (settings.hooks[event].length === 0) {
            delete settings.hooks[event];
          }
        }
        // Remove hooks key entirely if empty
        if (Object.keys(settings.hooks).length === 0) {
          delete settings.hooks;
        }
        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n', 'utf8');
        console.log(`  Removed  ${removedCount} orbital hook registrations from settings.local.json`);
      }
    } catch {
      console.warn('  Warning: could not parse settings.local.json');
    }
  }

  // 2. Delete hooks that came from templates
  const hookFiles = listTemplateFiles(path.join(TEMPLATES_DIR, 'hooks'), path.join(claudeDir, 'hooks'));
  let hooksRemoved = 0;
  for (const f of hookFiles) {
    if (fs.existsSync(f)) {
      fs.unlinkSync(f);
      hooksRemoved++;
    }
  }
  console.log(`  Removed  ${hooksRemoved} hook scripts`);

  // 3. Delete skills that came from templates
  const skillFiles = listTemplateFiles(path.join(TEMPLATES_DIR, 'skills'), path.join(claudeDir, 'skills'));
  let skillsRemoved = 0;
  for (const f of skillFiles) {
    if (fs.existsSync(f)) {
      fs.unlinkSync(f);
      skillsRemoved++;
    }
  }
  // Clean up empty skill directories
  const skillsDest = path.join(claudeDir, 'skills');
  if (fs.existsSync(skillsDest)) {
    cleanEmptyDirs(skillsDest);
  }
  console.log(`  Removed  ${skillsRemoved} skill files`);

  // 4. Delete agents that came from templates
  const agentFiles = listTemplateFiles(path.join(TEMPLATES_DIR, 'agents'), path.join(claudeDir, 'agents'));
  let agentsRemoved = 0;
  for (const f of agentFiles) {
    if (fs.existsSync(f)) {
      fs.unlinkSync(f);
      agentsRemoved++;
    }
  }
  // Clean up empty agent directories
  const agentsDest = path.join(claudeDir, 'agents');
  if (fs.existsSync(agentsDest)) {
    cleanEmptyDirs(agentsDest);
  }
  console.log(`  Removed  ${agentsRemoved} agent files`);

  const total = removedCount + hooksRemoved + skillsRemoved + agentsRemoved;
  console.log(`\nUninstall complete. ${total} items removed.`);
  console.log(`Note: scopes/ and .claude/orbital-events/ were preserved.\n`);
}

function printHelp() {
  console.log(`
Orbital Command — CLI for the agentic project management system

Usage:
  orbital <command> [options]

Commands:
  init              Scaffold Orbital Command into the current project
  dev               Start the development server (API + Vite)
  build             Production build of the dashboard
  emit <TYPE> <JSON>  Emit an orbital event
  update            Re-copy hooks/skills/agents from package templates
  uninstall         Remove Orbital artifacts from the project

Init Options:
  --force           Overwrite existing hooks, skills, and agents
  --skip-plugins    Skip plugin installation
  --yes, -y         Auto-accept all prompts

Update Options:
  --include-examples  Include domain-examples/ agents

Examples:
  orbital init
  orbital init --force
  orbital dev
  orbital emit SCOPE_TRANSITION '{"scope":"042","from":"implementing","to":"review"}'
  orbital update
  orbital uninstall
`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const [command, ...args] = process.argv.slice(2);

switch (command) {
  case 'init':
    cmdInit(args);
    break;
  case 'dev':
    cmdDev();
    break;
  case 'build':
    cmdBuild();
    break;
  case 'emit':
    cmdEmit(args);
    break;
  case 'update':
    cmdUpdate(args);
    break;
  case 'uninstall':
    cmdUninstall();
    break;
  case 'help':
  case '--help':
  case '-h':
    printHelp();
    break;
  case undefined:
    printHelp();
    break;
  default:
    console.error(`Unknown command: ${command}`);
    printHelp();
    process.exit(1);
}
