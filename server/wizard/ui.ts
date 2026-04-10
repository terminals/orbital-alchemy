/**
 * Shared UI helpers, concept notes, and formatting for the wizard.
 */

import pc from 'picocolors';

// ─── Concept Notes ──────────────────────────────────────────────

export const NOTES = {
  // Phase 1: Setup wizard (runs on install / first use)
  setupWelcome: `Orbital Command is a mission control layer for Claude Code.

It gives your projects a real-time dashboard with a Kanban board,
${pc.cyan('scopes')} (work items), ${pc.cyan('workflow stages')}, ${pc.cyan('quality gates')},
${pc.cyan('dispatches')} (automated Claude sessions), and a ${pc.cyan('sprint orchestrator')}.

Everything is driven by config files and hooks inside your project's
${pc.cyan('.claude/')} directory — no database or external service required.`,

  setupComplete: `${pc.bold('Setup complete.')}

  ${pc.cyan('orbital')}                 Add a project or launch the dashboard
  ${pc.cyan('orbital doctor')}          Health check & version info`,

  addProject: `You can add projects now or later by running ${pc.cyan('orbital')} in a project directory.
Each project gets its own workflow, scopes, and quality gates.`,

  // Phase 2: Project setup (runs per-project)
  reconfigure: `This project is already initialized with Orbital Command.
You can reconfigure settings or select ${pc.cyan('Reset to defaults')} from the hub menu.`,

  projectConfig: `${pc.bold('Project Config')} ${pc.dim('(.claude/orbital.config.json)')}

Each project gets its own config inside ${pc.cyan('.claude/')}. The project
config controls the name shown in the dashboard, ports, build commands
used by quality gates, and agent definitions.`,

  workflow: `${pc.bold('Workflows')} ${pc.dim('(Scopes, Lists, Dispatches)')}

Orbital organizes work into ${pc.cyan('scopes')} (cards) that move through
${pc.cyan('lists')} (Kanban columns). Transitions between lists can trigger
commands, quality gates, and Claude Code sessions (${pc.cyan('dispatches')}).

Choose a preset to start — you can customize it later from the
dashboard's workflow editor or by editing ${pc.cyan('.claude/config/workflow.json')}.`,

  postInstall: (counts: { hooks: number; skills: number; agents: number }) =>
    `${pc.bold('What was just created')}

${pc.cyan('Hooks')} (${counts.hooks})     Lifecycle scripts that enforce rules on transitions
${pc.cyan('Skills')} (${counts.skills})    Slash commands for Claude (/scope-create, /git-commit, etc.)
${pc.cyan('Agents')} (${counts.agents})    Team specifications for code review, architecture, security
${pc.cyan('Workflow')}      Your selected preset defining lists and transitions
${pc.cyan('Quality Gates')}  Automated checks (lint, typecheck, tests) before transitions`,

  nextSteps: `${pc.bold('Next Steps')}

  1. Run ${pc.cyan('orbital')} and select ${pc.bold('Launch dashboard')}
  2. Create a scope from the board or use ${pc.cyan('/scope-create')}
  3. Use ${pc.cyan('/scope-implement')} to start working on a scope

${pc.bold('Useful Commands')}

  ${pc.cyan('orbital')}           Hub menu — launch, config, doctor, etc.
  ${pc.cyan('orbital status')}    See template sync status
  ${pc.cyan('orbital config')}    Modify project settings
  ${pc.cyan('orbital update')}    Sync to latest templates`,
};

// ─── Formatting Helpers ─────────────────────────────────────────

export function formatDetectedCommands(commands: Record<string, string | null>): string {
  const entries = Object.entries(commands).filter(([, v]) => v !== null);
  if (entries.length === 0) return pc.dim('  No commands detected');

  return entries
    .map(([key, val]) => `  ${pc.cyan(key.padEnd(12))} ${val}`)
    .join('\n');
}

export function formatSummary(state: {
  projectName?: string;
  workflowPreset?: string;
  serverPort?: number;
  clientPort?: number;
}): string {
  return [
    `  Project:    ${pc.cyan(state.projectName || 'Unknown')}`,
    `  Workflow:   ${pc.cyan(state.workflowPreset || 'default')}`,
    `  Ports:      ${pc.cyan(String(state.serverPort || 4444))} (server) / ${pc.cyan(String(state.clientPort || 4445))} (client)`,
  ].join('\n');
}
