/**
 * Shared init logic — used by both the CLI (`orbital init`) and
 * programmatic callers (e.g. tests).
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Walk up from __dirname until we find the package root (identified by templates/).
// Handles both dev (server/ → 1 hop) and compiled (dist/server/server/ → 3 hops).
function resolvePackageRoot(startDir: string): string {
  let dir = startDir;
  for (let i = 0; i < 5; i++) {
    if (fs.existsSync(path.join(dir, 'templates'))) return dir;
    dir = path.resolve(dir, '..');
  }
  return path.resolve(startDir, '..');
}

const PACKAGE_ROOT = resolvePackageRoot(__dirname);
const TEMPLATES_DIR = path.join(PACKAGE_ROOT, 'templates');

// ─── Helpers ─────────────────────────────────────────────────

function ensureDir(dirPath: string): boolean {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    return true;
  }
  return false;
}

function copyDirSync(src: string, dest: string, opts: { overwrite?: boolean } = {}): { created: string[]; skipped: string[] } {
  const created: string[] = [];
  const skipped: string[] = [];

  if (!fs.existsSync(src)) return { created, skipped };

  ensureDir(dest);

  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      const sub = copyDirSync(srcPath, destPath, opts);
      created.push(...sub.created);
      skipped.push(...sub.skipped);
    } else {
      if (!opts.overwrite && fs.existsSync(destPath)) {
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

function chmodScripts(dir: string): void {
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

function pruneStaleEntries(sourceDir: string, targetDir: string): number {
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

function mergeSettingsHooks(targetPath: string, sourcePath: string): void {
  let target: Record<string, unknown> = {};
  if (fs.existsSync(targetPath)) {
    try {
      target = JSON.parse(fs.readFileSync(targetPath, 'utf8'));
    } catch {
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

  if (!(target as Record<string, Record<string, unknown[]>>).hooks) {
    (target as Record<string, unknown>).hooks = {};
  }
  const targetHooks = (target as Record<string, Record<string, unknown[]>>).hooks;

  for (const [event, sourceGroups] of Object.entries(sourceHooks)) {
    if (!targetHooks[event]) {
      targetHooks[event] = tagOrbitalGroups(sourceGroups as HookGroup[]);
      continue;
    }

    for (const sourceGroup of sourceGroups as HookGroup[]) {
      const sourceMatcher = sourceGroup.matcher || '__none__';
      const targetGroup = (targetHooks[event] as HookGroup[]).find(
        (g) => (g.matcher || '__none__') === sourceMatcher
      );

      if (!targetGroup) {
        (targetHooks[event] as HookGroup[]).push(tagOrbitalGroup(sourceGroup));
        continue;
      }

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

interface HookEntry {
  command: string;
  _orbital?: boolean;
  [key: string]: unknown;
}

interface HookGroup {
  matcher?: string;
  hooks?: HookEntry[];
  [key: string]: unknown;
}

function tagOrbitalGroups(groups: HookGroup[]): HookGroup[] {
  return groups.map(tagOrbitalGroup);
}

function tagOrbitalGroup(group: HookGroup): HookGroup {
  return {
    ...group,
    hooks: (group.hooks || []).map((h) => ({ ...h, _orbital: true })),
  };
}

function updateGitignore(projectRoot: string): boolean {
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
    return false;
  }

  fs.appendFileSync(gitignorePath, lines.join('\n'), 'utf8');
  return true;
}

function generateManifest(config: Record<string, unknown>): string {
  const lines: string[] = [];
  const lists = ((config.lists as Array<Record<string, unknown>>) || []).sort(
    (a, b) => ((a.order as number) ?? 0) - ((b.order as number) ?? 0)
  );

  lines.push('#!/bin/bash');
  lines.push('# Auto-generated by WorkflowEngine — DO NOT EDIT');
  lines.push(`# Generated: ${new Date().toISOString()}`);
  lines.push(`# Workflow: "${config.name}" (version ${config.version})`);
  lines.push('');

  lines.push('# ─── Branching mode (trunk or worktree) ───');
  lines.push(`WORKFLOW_BRANCHING_MODE="${(config.branchingMode as string) ?? 'trunk'}"`);
  lines.push('');

  lines.push('# ─── Valid statuses (space-separated) ───');
  lines.push(`WORKFLOW_STATUSES="${lists.map((l) => l.id).join(' ')}"`);
  lines.push('');

  lines.push('# ─── Statuses that have a scopes/ subdirectory ───');
  const dirStatuses = lists.filter((l) => l.hasDirectory).map((l) => l.id);
  lines.push(`WORKFLOW_DIR_STATUSES="${dirStatuses.join(' ')}"`);
  lines.push('');

  lines.push('# ─── Terminal statuses ───');
  const terminalStatuses = (config.terminalStatuses as string[]) || [];
  lines.push(`WORKFLOW_TERMINAL_STATUSES="${terminalStatuses.join(' ')}"`);
  lines.push('');

  lines.push('# ─── Entry point status ───');
  lines.push(`WORKFLOW_ENTRY_STATUS="${(config.entryPoint as string) || (lists[0]?.id as string) || 'todo'}"`);
  lines.push('');

  const listMap = new Map(lists.map((l) => [l.id, l]));

  lines.push('# ─── Transition edges (from:to:sessionKey) ───');
  lines.push('WORKFLOW_EDGES=(');
  for (const edge of (config.edges as Array<Record<string, unknown>>) || []) {
    const targetList = listMap.get(edge.to as string);
    const sessionKey = (targetList?.sessionKey as string) ?? '';
    lines.push(`  "${edge.from}:${edge.to}:${sessionKey}"`);
  }
  lines.push(')');
  lines.push('');

  lines.push('# ─── Branch-to-transition mapping (gitBranch:from:to:sessionKey) ───');
  lines.push('WORKFLOW_BRANCH_MAP=(');
  for (const edge of (config.edges as Array<Record<string, unknown>>) || []) {
    const targetList = listMap.get(edge.to as string);
    if (targetList?.gitBranch) {
      const sessionKey = (targetList.sessionKey as string) ?? '';
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

function writeManifest(claudeDir: string): boolean {
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

function generateIndexMd(projectRoot: string, claudeDir: string): string {
  let projectName = path.basename(projectRoot);
  const configPath = path.join(claudeDir, 'orbital.config.json');
  if (fs.existsSync(configPath)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (cfg.projectName) projectName = cfg.projectName;
    } catch { /* use fallback */ }
  }

  const skillsDir = path.join(claudeDir, 'skills');
  const skills: string[] = [];
  if (fs.existsSync(skillsDir)) {
    for (const entry of fs.readdirSync(skillsDir, { withFileTypes: true })) {
      if (entry.isDirectory()) skills.push(entry.name);
    }
  }

  const workflowPath = path.join(claudeDir, 'config', 'workflow.json');
  let stages: string[] = [];
  if (fs.existsSync(workflowPath)) {
    try {
      const wf = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));
      stages = (wf.lists || [])
        .sort((a: Record<string, unknown>, b: Record<string, unknown>) =>
          ((a.order as number) ?? 0) - ((b.order as number) ?? 0))
        .map((l: Record<string, unknown>) => l.id as string);
    } catch { /* skip */ }
  }

  const skillCategories: Record<string, string[]> = {
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

  return `# ${projectName} — AI Agent Index

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
}

// ─── Helpers used by CLI commands ────────────────────────────

function listTemplateFiles(templateSubdir: string, targetDir: string): string[] {
  const files: string[] = [];
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

function cleanEmptyDirs(dir: string): void {
  if (!fs.existsSync(dir)) return;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      cleanEmptyDirs(path.join(dir, entry.name));
    }
  }

  if (fs.readdirSync(dir).length === 0) {
    fs.rmdirSync(dir);
  }
}

// ─── Exports ─────────────────────────────────────────────────

export { TEMPLATES_DIR, ensureDir };

export interface InitOptions {
  force?: boolean;
}

export function runInit(projectRoot: string, options: InitOptions = {}): void {
  const force = options.force ?? false;
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
  let scopeDirs = ['icebox'];
  try {
    const preset = JSON.parse(fs.readFileSync(defaultPresetPath, 'utf8'));
    if (preset.lists && Array.isArray(preset.lists)) {
      scopeDirs = preset.lists.filter((l: Record<string, unknown>) => l.hasDirectory).map((l: Record<string, unknown>) => l.id as string);
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
  const configIsNew = !fs.existsSync(configDest);
  if (configIsNew) {
    if (fs.existsSync(configSrc)) {
      fs.copyFileSync(configSrc, configDest);
      console.log(`  Created  .claude/orbital.config.json`);
    } else {
      const defaultConfig = {
        serverPort: 4444,
        clientPort: 4445,
        projectName: path.basename(projectRoot),
      };
      fs.writeFileSync(configDest, JSON.stringify(defaultConfig, null, 2) + '\n', 'utf8');
      console.log(`  Created  .claude/orbital.config.json (default)`);
    }

    // Auto-detect project commands from package.json
    const pkgJsonPath = path.join(projectRoot, 'package.json');
    if (fs.existsSync(pkgJsonPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
        const scripts = pkg.scripts || {};
        const config = JSON.parse(fs.readFileSync(configDest, 'utf8'));
        if (!config.commands) config.commands = {};
        let detected = 0;

        if (scripts.typecheck || scripts['type-check']) {
          config.commands.typeCheck = `npm run ${scripts.typecheck ? 'typecheck' : 'type-check'}`;
          detected++;
        }
        if (scripts.lint) { config.commands.lint = 'npm run lint'; detected++; }
        if (scripts.build) { config.commands.build = 'npm run build'; detected++; }
        if (scripts.test) { config.commands.test = 'npm run test'; detected++; }

        if (detected > 0) {
          fs.writeFileSync(configDest, JSON.stringify(config, null, 2) + '\n', 'utf8');
          console.log(`  Detected ${detected} project command(s) from package.json`);
        }
      } catch { /* leave defaults */ }
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

  // 7b. Copy quick/ templates
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

export function runUpdate(projectRoot: string): void {
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

export function runUninstall(projectRoot: string): void {
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
        for (const [event] of Object.entries(settings.hooks)) {
          for (const group of settings.hooks[event]) {
            if (group.hooks) {
              const before = group.hooks.length;
              group.hooks = group.hooks.filter((h: HookEntry) => !h._orbital);
              removedCount += before - group.hooks.length;
            }
          }
          settings.hooks[event] = settings.hooks[event].filter(
            (g: HookGroup) => g.hooks && g.hooks.length > 0
          );
          if (settings.hooks[event].length === 0) {
            delete settings.hooks[event];
          }
        }
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
  const skillsDest = path.join(claudeDir, 'skills');
  if (fs.existsSync(skillsDest)) cleanEmptyDirs(skillsDest);
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
  const agentsDest = path.join(claudeDir, 'agents');
  if (fs.existsSync(agentsDest)) cleanEmptyDirs(agentsDest);
  console.log(`  Removed  ${agentsRemoved} agent files`);

  const total = removedCount + hooksRemoved + skillsRemoved + agentsRemoved;
  console.log(`\nUninstall complete. ${total} items removed.`);
  console.log(`Note: scopes/ and .claude/orbital-events/ were preserved.\n`);
}
