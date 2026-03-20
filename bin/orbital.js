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

/**
 * Resolve a package binary (e.g. 'tsx', 'vite') to an absolute path.
 * Checks PACKAGE_ROOT/node_modules/.bin first (global installs, non-hoisted),
 * then the parent node_modules/.bin (hoisted local installs where deps are
 * lifted to <project>/node_modules/.bin/). Returns null to fall back to npx.
 */
function resolveBin(name) {
  // Package-local (global installs, or deps nested under this package)
  const local = path.join(PACKAGE_ROOT, 'node_modules', '.bin', name);
  if (fs.existsSync(local)) return local;
  // Hoisted (local dep installs: PACKAGE_ROOT is <project>/node_modules/orbital-command/)
  const hoisted = path.join(PACKAGE_ROOT, '..', '.bin', name);
  if (fs.existsSync(hoisted)) return path.resolve(hoisted);
  return null;
}

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
    try {
      return JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch (err) {
      console.warn(`Warning: could not parse ${configPath}: ${err.message}`);
    }
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

/**
 * Remove entries in targetDir that don't exist in sourceDir.
 * Compares top-level entries only (files and directories).
 * Used during --force init and update to prune renamed/deleted templates.
 */
function pruneStaleEntries(sourceDir, targetDir) {
  if (!fs.existsSync(targetDir) || !fs.existsSync(sourceDir)) return 0;

  const sourceEntries = new Set(fs.readdirSync(sourceDir));
  let removed = 0;

  for (const entry of fs.readdirSync(targetDir, { withFileTypes: true })) {
    if (!sourceEntries.has(entry.name)) {
      const fullPath = path.join(targetDir, entry.name);
      fs.rmSync(fullPath, { recursive: true, force: true });
      removed++;
    }
  }
  return removed;
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
// Manifest & INDEX generation
// ---------------------------------------------------------------------------

/**
 * Generate a bash workflow manifest from a workflow config JSON.
 * Mirrors the output of WorkflowEngine.generateShellManifest() in shared/workflow-engine.ts.
 */
function generateManifest(config) {
  const lines = [];
  const lists = (config.lists || []).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  lines.push('#!/bin/bash');
  lines.push('# Auto-generated by WorkflowEngine — DO NOT EDIT');
  lines.push(`# Generated: ${new Date().toISOString()}`);
  lines.push(`# Workflow: "${config.name}" (version ${config.version})`);
  lines.push('');

  lines.push('# ─── Branching mode (trunk or worktree) ───');
  lines.push(`WORKFLOW_BRANCHING_MODE="${config.branchingMode ?? 'trunk'}"`);
  lines.push('');

  lines.push('# ─── Valid statuses (space-separated) ───');
  lines.push(`WORKFLOW_STATUSES="${lists.map((l) => l.id).join(' ')}"`);
  lines.push('');

  lines.push('# ─── Statuses that have a scopes/ subdirectory ───');
  const dirStatuses = lists.filter((l) => l.hasDirectory).map((l) => l.id);
  lines.push(`WORKFLOW_DIR_STATUSES="${dirStatuses.join(' ')}"`);
  lines.push('');

  lines.push('# ─── Terminal statuses ───');
  const terminalStatuses = config.terminalStatuses || [];
  lines.push(`WORKFLOW_TERMINAL_STATUSES="${terminalStatuses.join(' ')}"`);
  lines.push('');

  lines.push('# ─── Entry point status ───');
  lines.push(`WORKFLOW_ENTRY_STATUS="${config.entryPoint || lists[0]?.id || 'todo'}"`);
  lines.push('');

  // Build a lookup map for lists by id
  const listMap = new Map(lists.map((l) => [l.id, l]));

  lines.push('# ─── Transition edges (from:to:sessionKey) ───');
  lines.push('WORKFLOW_EDGES=(');
  for (const edge of config.edges || []) {
    const targetList = listMap.get(edge.to);
    const sessionKey = targetList?.sessionKey ?? '';
    lines.push(`  "${edge.from}:${edge.to}:${sessionKey}"`);
  }
  lines.push(')');
  lines.push('');

  lines.push('# ─── Branch-to-transition mapping (gitBranch:from:to:sessionKey) ───');
  lines.push('WORKFLOW_BRANCH_MAP=(');
  for (const edge of config.edges || []) {
    const targetList = listMap.get(edge.to);
    if (targetList?.gitBranch) {
      const sessionKey = targetList.sessionKey ?? '';
      lines.push(`  "${targetList.gitBranch}:${edge.from}:${edge.to}:${sessionKey}"`);
    }
  }
  lines.push(')');
  lines.push('');

  lines.push('# ─── Helper functions ──────────────────────────────');
  lines.push('');
  lines.push('status_to_dir() {');
  lines.push('  local scope_status="$1"');
  lines.push('  for s in $WORKFLOW_DIR_STATUSES; do');
  lines.push('    [ "$s" = "$scope_status" ] && echo "$scope_status" && return 0');
  lines.push('  done');
  lines.push('  echo "$WORKFLOW_ENTRY_STATUS"');
  lines.push('}');
  lines.push('');
  lines.push('status_to_branch() {');
  lines.push('  local status="$1"');
  lines.push('  for entry in "${WORKFLOW_BRANCH_MAP[@]}"; do');
  lines.push("    IFS=':' read -r branch from to skey <<< \"$entry\"");
  lines.push('    [ "$to" = "$status" ] && echo "$branch" && return 0');
  lines.push('  done');
  lines.push('  echo ""');
  lines.push('}');
  lines.push('');
  lines.push('is_valid_status() {');
  lines.push('  local status="$1"');
  lines.push('  for s in $WORKFLOW_STATUSES; do');
  lines.push('    [ "$s" = "$status" ] && return 0');
  lines.push('  done');
  lines.push('  return 1');
  lines.push('}');

  return lines.join('\n') + '\n';
}

/**
 * Write the workflow manifest shell script from the active workflow config.
 */
function writeManifest(claudeDir) {
  const workflowPath = path.join(claudeDir, 'config', 'workflow.json');
  if (!fs.existsSync(workflowPath)) return false;

  try {
    const config = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));
    const manifest = generateManifest(config);
    const manifestPath = path.join(claudeDir, 'config', 'workflow-manifest.sh');
    fs.writeFileSync(manifestPath, manifest, 'utf8');
    fs.chmodSync(manifestPath, 0o755);
    return true;
  } catch {
    console.warn('  Warning: could not generate workflow manifest');
    return false;
  }
}

/**
 * Generate a project INDEX.md from the installed skills and workflow config.
 */
function generateIndexMd(projectRoot, claudeDir) {
  // Read project name from config
  let projectName = path.basename(projectRoot);
  const configPath = path.join(claudeDir, 'orbital.config.json');
  if (fs.existsSync(configPath)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (cfg.projectName) projectName = cfg.projectName;
    } catch { /* use fallback */ }
  }

  // Discover installed skills
  const skillsDir = path.join(claudeDir, 'skills');
  const skills = [];
  if (fs.existsSync(skillsDir)) {
    for (const entry of fs.readdirSync(skillsDir, { withFileTypes: true })) {
      if (entry.isDirectory()) skills.push(entry.name);
    }
  }

  // Read workflow stages
  const workflowPath = path.join(claudeDir, 'config', 'workflow.json');
  let stages = [];
  if (fs.existsSync(workflowPath)) {
    try {
      const wf = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));
      stages = (wf.lists || [])
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        .map((l) => l.id);
    } catch { /* skip */ }
  }

  // Build skill table
  const skillCategories = {
    'Git': skills.filter((s) => s.startsWith('git-')),
    'Scope': skills.filter((s) => s.startsWith('scope-')),
    'Session': skills.filter((s) => s.startsWith('session-')),
    'Quality': skills.filter((s) => s.startsWith('test-')),
  };

  let skillTable = '';
  for (const [cat, list] of Object.entries(skillCategories)) {
    if (list.length > 0) {
      skillTable += `| ${cat} | ${list.map((s) => '`/' + s + '`').join(', ')} |\n`;
    }
  }

  const content = `# ${projectName} — AI Agent Index

---
tokens: ~1K
load-when: Always load first
last-verified: ${new Date().toISOString().split('T')[0]}
---

## 30-Second Orientation

**Project**: ${projectName}
**Managed by**: Orbital Command

### Critical Commands

\`\`\`bash
# Run configured quality gates (from orbital.config.json)
# Typical: type-check, lint, build, test
\`\`\`

---

## Decision Tree: Where Should I Look?

\`\`\`
What are you trying to do?
|
+-- "I want to IMPLEMENT a scope"
|   +-- Create new scope      -> /scope-create
|   +-- Implement scope       -> /scope-implement
|   +-- Review scope          -> /scope-pre-review
|
+-- "I want to COMMIT/DEPLOY"
|   +-- Commit work           -> /git-commit
|   +-- Push to main          -> /git-main
${stages.includes('dev') ? '|   +-- Merge to dev          -> /git-dev\n' : ''}${stages.includes('staging') ? '|   +-- PR to staging         -> /git-staging\n' : ''}${stages.includes('production') ? '|   +-- PR to production      -> /git-production\n' : ''}|   +-- Emergency fix         -> /git-hotfix
|
+-- "I want to RUN CHECKS"
|   +-- Quality gates         -> /test-checks
|   +-- Code review           -> /test-code-review
|   +-- Post-impl review      -> /scope-post-review
|
+-- "I need SESSION help"
|   +-- Continue work         -> /session-resume
|
+-- "What should I AVOID?"
|   +-- anti-patterns/dangerous-shortcuts.md
|
+-- "QUICK REFERENCES"
    +-- Rules                 -> quick/rules.md
    +-- Lessons learned       -> lessons-learned.md
\`\`\`

---

## Skills

| Category | Skills |
|----------|--------|
${skillTable || '| (none installed) | |\n'}
---

## Scope System (Three-Part Documents)

Scopes live in directories matching their pipeline stage.

\`\`\`
scopes/
+-- _template.md           # Copy for new scopes
${stages.map((s) => `+-- ${s}/`).join('\n')}
\`\`\`

**Three-Part Structure**:
- **PART 1: DASHBOARD** — Quick status, progress table, recent activity
- **PART 2: SPECIFICATION** — Feature lock (locked after review, any agent can implement)
- **PART 3: PROCESS** — Working memory (exploration, decisions, uncertainties, impl log)
- **AGENT REVIEW** — Synthesized findings from agent team review

**Lifecycle**: ${stages.join(' → ')}

---

## File Organization

\`\`\`
.claude/
+-- INDEX.md              <- You are here
+-- lessons-learned.md    # Institutional memory
+-- skills/               # Invokable skills
+-- quick/                # Quick reference docs
|   +-- rules.md          # Project rules with verify commands
+-- agents/               # Agent specifications
+-- anti-patterns/        # What NOT to do
+-- hooks/                # Claude Code lifecycle hooks
+-- config/               # Workflow config and presets
|   +-- workflow.json     # Active workflow
|   +-- workflow-manifest.sh  # Shell variables (auto-generated)
|   +-- workflows/        # Available presets
+-- orbital.config.json   # Project configuration
\`\`\`

---

## When In Doubt

1. **Check rules**: \`quick/rules.md\`
2. **Follow existing patterns**: Look at similar code in codebase
3. **Ask**: Use clarifying questions before making assumptions
4. **Verify**: Run quality gates before committing
`;

  return content;
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

async function cmdInit(args) {
  const force = args.includes('--force');
  const projectRoot = detectProjectRoot();

  // Use the shared init module (TypeScript compiled to JS, or loaded via tsx at dev time)
  try {
    const { runInit } = await import('../server/init.js');
    runInit(projectRoot, { force });
  } catch {
    // Fallback: if server/init.js isn't compiled yet, use inline init logic
    cmdInitFallback(args);
  }

  console.log(`Run \`orbital dev\` to start the development server.\n`);
}

function cmdInitFallback(args) {
  const force = args.includes('--force');
  const projectRoot = detectProjectRoot();
  const claudeDir = path.join(projectRoot, '.claude');

  console.log(`\nOrbital Command — init`);
  console.log(`Project root: ${projectRoot}\n`);

  // 1. Create directories
  const dirs = [
    path.join(claudeDir, 'orbital-events'),
    path.join(claudeDir, 'orbital'),
    path.join(claudeDir, 'config'),
    path.join(claudeDir, 'review-verdicts'),
  ];
  for (const dir of dirs) {
    const wasCreated = ensureDir(dir);
    console.log(`  ${wasCreated ? 'Created' : 'Exists '}  ${path.relative(projectRoot, dir)}/`);
  }

  // 1b. Create scopes/ subdirectories from the default workflow preset
  const defaultPresetPath = path.join(TEMPLATES_DIR, 'presets', 'default.json');
  let scopeDirs = ['icebox']; // fallback if preset can't be loaded
  try {
    const preset = JSON.parse(fs.readFileSync(defaultPresetPath, 'utf8'));
    if (preset.lists && Array.isArray(preset.lists)) {
      scopeDirs = preset.lists.filter((l) => l.hasDirectory).map((l) => l.id);
    }
  } catch {
    console.warn('  Warning: could not load default preset, creating scopes/icebox/ only');
  }
  for (const dirId of scopeDirs) {
    const scopeDir = path.join(projectRoot, 'scopes', dirId);
    const wasCreated = ensureDir(scopeDir);
    console.log(`  ${wasCreated ? 'Created' : 'Exists '}  scopes/${dirId}/`);
  }

  // 1c. Copy scope template
  const scopeTemplateSrc = path.join(TEMPLATES_DIR, 'scopes', '_template.md');
  const scopeTemplateDest = path.join(projectRoot, 'scopes', '_template.md');
  if (fs.existsSync(scopeTemplateSrc)) {
    if (force || !fs.existsSync(scopeTemplateDest)) {
      fs.copyFileSync(scopeTemplateSrc, scopeTemplateDest);
      console.log(`  ${force ? 'Reset  ' : 'Created'}  scopes/_template.md`);
    } else {
      console.log(`  Exists   scopes/_template.md`);
    }
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
  if (force) {
    const pruned = pruneStaleEntries(hooksSrc, hooksDest);
    if (pruned > 0) console.log(`  Pruned   ${pruned} stale hook entries`);
  }
  const hooksResult = copyDirSync(hooksSrc, hooksDest, { overwrite: force });
  console.log(`  Hooks    ${hooksResult.created.length} copied, ${hooksResult.skipped.length} skipped`);

  // 4. Copy skills
  const skillsSrc = path.join(TEMPLATES_DIR, 'skills');
  const skillsDest = path.join(claudeDir, 'skills');
  if (force) {
    const pruned = pruneStaleEntries(skillsSrc, skillsDest);
    if (pruned > 0) console.log(`  Pruned   ${pruned} stale skill entries`);
  }
  const skillsResult = copyDirSync(skillsSrc, skillsDest, { overwrite: force });
  console.log(`  Skills   ${skillsResult.created.length} copied, ${skillsResult.skipped.length} skipped`);

  // 5. Copy agents
  const agentsSrc = path.join(TEMPLATES_DIR, 'agents');
  const agentsDest = path.join(claudeDir, 'agents');
  if (force) {
    const pruned = pruneStaleEntries(agentsSrc, agentsDest);
    if (pruned > 0) console.log(`  Pruned   ${pruned} stale agent entries`);
  }
  const agentsResult = copyDirSync(agentsSrc, agentsDest, { overwrite: force });
  console.log(`  Agents   ${agentsResult.created.length} copied, ${agentsResult.skipped.length} skipped`);

  // 6. Copy workflow presets
  const presetsSrc = path.join(TEMPLATES_DIR, 'presets');
  const presetsDest = path.join(claudeDir, 'config', 'workflows');
  if (fs.existsSync(presetsSrc) && fs.readdirSync(presetsSrc).length > 0) {
    if (force) {
      const pruned = pruneStaleEntries(presetsSrc, presetsDest);
      if (pruned > 0) console.log(`  Pruned   ${pruned} stale preset entries`);
    }
    const presetsResult = copyDirSync(presetsSrc, presetsDest, { overwrite: force });
    console.log(`  Presets  ${presetsResult.created.length} copied, ${presetsResult.skipped.length} skipped`);
  }

  // 6b. Reset active workflow config when --force, or create if missing
  const activeWorkflowDest = path.join(claudeDir, 'config', 'workflow.json');
  if (force) {
    fs.copyFileSync(defaultPresetPath, activeWorkflowDest);
    console.log(`  Reset    .claude/config/workflow.json (default workflow)`);
  } else if (!fs.existsSync(activeWorkflowDest)) {
    fs.copyFileSync(defaultPresetPath, activeWorkflowDest);
    console.log(`  Created  .claude/config/workflow.json`);
  } else {
    console.log(`  Exists   .claude/config/workflow.json`);
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

  // 7b. Copy quick/ templates (rules.md etc.)
  const quickSrc = path.join(TEMPLATES_DIR, 'quick');
  const quickDest = path.join(claudeDir, 'quick');
  if (fs.existsSync(quickSrc)) {
    const quickResult = copyDirSync(quickSrc, quickDest, { overwrite: force });
    console.log(`  Quick    ${quickResult.created.length} copied, ${quickResult.skipped.length} skipped`);
  }

  // 7c. Copy anti-patterns/ templates
  const antiSrc = path.join(TEMPLATES_DIR, 'anti-patterns');
  const antiDest = path.join(claudeDir, 'anti-patterns');
  if (fs.existsSync(antiSrc)) {
    const antiResult = copyDirSync(antiSrc, antiDest, { overwrite: force });
    console.log(`  Anti-pat ${antiResult.created.length} copied, ${antiResult.skipped.length} skipped`);
  }

  // 7d. Copy lessons-learned.md
  const lessonsSrc = path.join(TEMPLATES_DIR, 'lessons-learned.md');
  const lessonsDest = path.join(claudeDir, 'lessons-learned.md');
  if (fs.existsSync(lessonsSrc)) {
    if (force || !fs.existsSync(lessonsDest)) {
      fs.copyFileSync(lessonsSrc, lessonsDest);
      console.log(`  Created  .claude/lessons-learned.md`);
    } else {
      console.log(`  Exists   .claude/lessons-learned.md`);
    }
  }

  // 7e. Generate workflow manifest
  const manifestOk = writeManifest(claudeDir);
  console.log(`  ${manifestOk ? 'Created' : 'Skipped'}  .claude/config/workflow-manifest.sh`);

  // 7f. Generate INDEX.md
  const indexDest = path.join(claudeDir, 'INDEX.md');
  if (force || !fs.existsSync(indexDest)) {
    const indexContent = generateIndexMd(projectRoot, claudeDir);
    fs.writeFileSync(indexDest, indexContent, 'utf8');
    console.log(`  ${force ? 'Reset  ' : 'Created'}  .claude/INDEX.md`);
  } else {
    console.log(`  Exists   .claude/INDEX.md`);
  }

  // 8. Merge hook registrations into settings.local.json
  console.log('');
  const settingsTarget = path.join(claudeDir, 'settings.local.json');
  const settingsSrc = path.join(TEMPLATES_DIR, 'settings-hooks.json');
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
    ORBITAL_SERVER_PORT: String(serverPort),
  };

  // Start the API server
  const tsxBin = resolveBin('tsx');
  const serverProcess = tsxBin
    ? spawn(tsxBin, ['watch', path.join(PACKAGE_ROOT, 'server', 'index.ts')],
        { stdio: 'inherit', env, cwd: PACKAGE_ROOT })
    : spawn('npx', ['tsx', 'watch', path.join(PACKAGE_ROOT, 'server', 'index.ts')],
        { stdio: 'inherit', env, cwd: PACKAGE_ROOT });

  // Start the Vite dev server
  const viteBin = resolveBin('vite');
  const viteProcess = viteBin
    ? spawn(viteBin, ['--config', path.join(PACKAGE_ROOT, 'vite.config.ts'), '--port', String(clientPort)],
        { stdio: 'inherit', env, cwd: PACKAGE_ROOT })
    : spawn('npx', ['vite', '--config', path.join(PACKAGE_ROOT, 'vite.config.ts'), '--port', String(clientPort)],
        { stdio: 'inherit', env, cwd: PACKAGE_ROOT });

  let exiting = false;

  // Clean shutdown on SIGINT/SIGTERM
  function cleanup() {
    if (exiting) return;
    exiting = true;
    serverProcess.kill();
    viteProcess.kill();
    process.exit(0);
  }
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  // Exit if either process dies
  serverProcess.on('exit', (code) => {
    if (exiting) return;
    exiting = true;
    console.log(`Server exited with code ${code}`);
    viteProcess.kill();
    process.exit(code || 0);
  });
  viteProcess.on('exit', (code) => {
    if (exiting) return;
    exiting = true;
    console.log(`Vite exited with code ${code}`);
    serverProcess.kill();
    process.exit(code || 0);
  });
}

function cmdBuild() {
  console.log(`\nOrbital Command — build\n`);

  const viteBin = resolveBin('vite');
  const buildProcess = viteBin
    ? spawn(viteBin, ['build', '--config', path.join(PACKAGE_ROOT, 'vite.config.ts')],
        { stdio: 'inherit', cwd: PACKAGE_ROOT })
    : spawn('npx', ['vite', 'build', '--config', path.join(PACKAGE_ROOT, 'vite.config.ts')],
        { stdio: 'inherit', cwd: PACKAGE_ROOT });

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
    ...payload,
    id: eventId,
    type,
    timestamp: new Date().toISOString(),
  };

  const filePath = path.join(eventsDir, `${eventId}.json`);
  fs.writeFileSync(filePath, JSON.stringify(event, null, 2) + '\n', 'utf8');

  console.log(`Event emitted: ${type} (${eventId})`);
  console.log(`  File: ${path.relative(projectRoot, filePath)}`);
}

function cmdUpdate(args) {
  const projectRoot = detectProjectRoot();
  const claudeDir = path.join(projectRoot, '.claude');

  console.log(`\nOrbital Command — update`);
  console.log(`Project root: ${projectRoot}\n`);

  // 1. Copy hooks (overwrite) — prune stale entries first
  const hooksSrc = path.join(TEMPLATES_DIR, 'hooks');
  const hooksDest = path.join(claudeDir, 'hooks');
  const hooksPruned = pruneStaleEntries(hooksSrc, hooksDest);
  if (hooksPruned > 0) console.log(`  Pruned   ${hooksPruned} stale hook entries`);
  const hooksResult = copyDirSync(hooksSrc, hooksDest, { overwrite: true });
  console.log(`  Hooks    ${hooksResult.created.length} updated`);

  // 2. Copy skills (overwrite) — prune stale entries first
  const skillsSrc = path.join(TEMPLATES_DIR, 'skills');
  const skillsDest = path.join(claudeDir, 'skills');
  const skillsPruned = pruneStaleEntries(skillsSrc, skillsDest);
  if (skillsPruned > 0) console.log(`  Pruned   ${skillsPruned} stale skill entries`);
  const skillsResult = copyDirSync(skillsSrc, skillsDest, { overwrite: true });
  console.log(`  Skills   ${skillsResult.created.length} updated`);

  // 3. Copy agents (overwrite) — prune stale entries first
  const agentsSrc = path.join(TEMPLATES_DIR, 'agents');
  const agentsDest = path.join(claudeDir, 'agents');
  const agentsPruned = pruneStaleEntries(agentsSrc, agentsDest);
  if (agentsPruned > 0) console.log(`  Pruned   ${agentsPruned} stale agent entries`);
  const agentsResult = copyDirSync(agentsSrc, agentsDest, { overwrite: true });
  console.log(`  Agents   ${agentsResult.created.length} updated`);

  // 4. Update workflow presets — prune stale entries first
  const presetsSrc = path.join(TEMPLATES_DIR, 'presets');
  const presetsDest = path.join(claudeDir, 'config', 'workflows');
  if (fs.existsSync(presetsSrc) && fs.readdirSync(presetsSrc).length > 0) {
    const presetsPruned = pruneStaleEntries(presetsSrc, presetsDest);
    if (presetsPruned > 0) console.log(`  Pruned   ${presetsPruned} stale preset entries`);
    const presetsResult = copyDirSync(presetsSrc, presetsDest, { overwrite: true });
    console.log(`  Presets  ${presetsResult.created.length} updated`);
  }

  // 5. Update quick/, anti-patterns/, lessons-learned, scope template
  const quickSrc = path.join(TEMPLATES_DIR, 'quick');
  const quickDest = path.join(claudeDir, 'quick');
  if (fs.existsSync(quickSrc)) {
    const quickResult = copyDirSync(quickSrc, quickDest, { overwrite: true });
    console.log(`  Quick    ${quickResult.created.length} updated`);
  }

  const antiSrc = path.join(TEMPLATES_DIR, 'anti-patterns');
  const antiDest = path.join(claudeDir, 'anti-patterns');
  if (fs.existsSync(antiSrc)) {
    const antiResult = copyDirSync(antiSrc, antiDest, { overwrite: true });
    console.log(`  Anti-pat ${antiResult.created.length} updated`);
  }

  const lessonsSrc = path.join(TEMPLATES_DIR, 'lessons-learned.md');
  const lessonsDest = path.join(claudeDir, 'lessons-learned.md');
  if (fs.existsSync(lessonsSrc) && !fs.existsSync(lessonsDest)) {
    fs.copyFileSync(lessonsSrc, lessonsDest);
    console.log(`  Created  .claude/lessons-learned.md`);
  }

  const scopeTemplateSrc = path.join(TEMPLATES_DIR, 'scopes', '_template.md');
  const scopeTemplateDest = path.join(projectRoot, 'scopes', '_template.md');
  if (fs.existsSync(scopeTemplateSrc)) {
    ensureDir(path.join(projectRoot, 'scopes'));
    fs.copyFileSync(scopeTemplateSrc, scopeTemplateDest);
    console.log(`  Updated  scopes/_template.md`);
  }

  // 5b. Regenerate workflow manifest
  const manifestOk = writeManifest(claudeDir);
  console.log(`  ${manifestOk ? 'Updated' : 'Skipped'}  .claude/config/workflow-manifest.sh`);

  // 6. Re-merge settings hooks
  const settingsTarget = path.join(claudeDir, 'settings.local.json');
  const settingsSrc = path.join(TEMPLATES_DIR, 'settings-hooks.json');
  mergeSettingsHooks(settingsTarget, settingsSrc);
  console.log(`  Merged   hook registrations into .claude/settings.local.json`);

  // 7. Make hook scripts executable
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
