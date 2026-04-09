# Getting Started with Orbital Command

Orbital Command is a real-time project management dashboard for Claude Code projects. It provides a visual Kanban board, sprint orchestration, workflow engine, quality gates, agent reviews, deploy pipeline, and session timeline — all driven by a file-based event bus that works even when the server is offline. Scopes (units of work) are markdown files with YAML frontmatter, tracked in git alongside your code.

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Initialization](#initialization)
- [Starting the Dashboard](#starting-the-dashboard)
- [Configuration](#configuration)
- [Workflow Presets](#workflow-presets)
- [Scopes](#scopes)
- [Skills (Slash Commands)](#skills-slash-commands)
- [Agent System](#agent-system)
- [Hooks](#hooks)
- [Multi-Project Support](#multi-project-support)
- [CLI Reference](#cli-reference)
- [Template Maintenance](#template-maintenance)

---

## Prerequisites

- **Node.js** 18 or later
- **Claude Code** CLI installed and authenticated
- A **git** repository (Orbital uses git to detect the project root)

---

## Installation

```bash
npm install orbital-command
```

This installs the `orbital` CLI. After installing, initialize your project:

```bash
npx orbital init
```

---

## Initialization

The init wizard has two phases:

### Phase 1: Global Setup (first time only)

Creates `~/.orbital/` with a project registry (`config.json`) and seeds a global primitives library (hooks, skills, agents) to `~/.orbital/primitives/`. This phase runs once and is skipped on subsequent projects.

### Phase 2: Project Setup

An interactive wizard collects:

1. **Project name** — auto-detected from your directory name
2. **Build commands** — auto-detected from `package.json` scripts (`typecheck`, `lint`, `build`, `test`). You can override any of them.
3. **Ports** — defaults to 4444 (API server) and 4445 (dev client). The wizard detects conflicts if those ports are in use.
4. **Workflow preset** — choose one of four presets (see [Workflow Presets](#workflow-presets))

After confirming, init scaffolds the following into your project:

| Directory / File | Purpose |
|---|---|
| `.claude/orbital.config.json` | Project configuration |
| `.claude/orbital-events/` | Event bus directory (JSON files) |
| `.claude/orbital/` | SQLite database for events, sessions, gates |
| `.claude/config/workflow.json` | Active workflow definition |
| `.claude/config/workflows/` | All workflow presets |
| `.claude/config/workflow-manifest.sh` | Generated bash helpers for hooks |
| `.claude/config/agent-triggers.json` | Agent auto-invoke rules |
| `.claude/hooks/` | 33 lifecycle hook scripts |
| `.claude/skills/` | 17 skill templates (slash commands) |
| `.claude/agents/` | Agent definitions and team workflows |
| `.claude/quick/` | Quick-reference rule files |
| `.claude/anti-patterns/` | Anti-pattern documentation |
| `.claude/settings.local.json` | Hook registrations for Claude Code |
| `.claude/orbital-manifest.json` | File tracking manifest for updates |
| `.claude/INDEX.md` | Auto-generated project index |
| `scopes/` | Scope directories (one per workflow column that has `hasDirectory`) |
| `scopes/_template.md` | Template for creating new scopes |

The wizard also appends Orbital patterns to `.gitignore` and registers the project in `~/.orbital/config.json`.

### Non-Interactive Init

```bash
npx orbital init --yes
```

Accepts all auto-detected defaults. Useful in CI or scripted setups. Additional flags:

| Flag | Description |
|---|---|
| `--force` | Re-initialize an already-initialized project |
| `--private` | Disable telemetry for this project |
| `--preset <name>` | Choose workflow preset (`default`, `minimal`, `development`, `gitflow`) |
| `--project-name <name>` | Override project name |
| `--server-port <port>` | Override API server port |
| `--client-port <port>` | Override dev client port |

---

## Starting the Dashboard

```bash
npx orbital launch --open
```

Starts the Express API server and serves the pre-built frontend. The `--open` flag opens your browser automatically. By default, the dashboard runs on **http://localhost:4444**.

For development with hot module replacement:

```bash
npx orbital dev
```

This starts the API server on port 4444 and a Vite dev server on port 4445 with HMR. The Vite server proxies `/api/orbital` and `/socket.io` requests to the API server.

---

## Configuration

Project configuration lives at `.claude/orbital.config.json`. You can edit it directly or use the interactive editor:

```bash
npx orbital config          # Interactive editor
npx orbital config show     # Print current config
npx orbital config set <key> <value>
```

### All Options

| Option | Type | Default | Description |
|---|---|---|---|
| `projectName` | string | Directory name | Display name in the dashboard header |
| `scopesDir` | string | `"scopes"` | Directory for scope documents |
| `eventsDir` | string | `".claude/orbital-events"` | Directory for event bus files |
| `dbDir` | string | `".claude/orbital"` | Directory for the SQLite database |
| `configDir` | string | `".claude/config"` | Directory for workflow config files |
| `serverPort` | integer | `4444` | API server port (1-65535) |
| `clientPort` | integer | `4445` | Vite dev server port (1-65535) |
| `logLevel` | string | `"info"` | Logging level: `debug`, `info`, `warn`, `error` |

### Terminal

```json
"terminal": {
  "adapter": "auto",
  "profilePrefix": "Orbital"
}
```

- `adapter` — Terminal adapter for dispatching Claude Code sessions: `auto` (detect best), `iterm2`, `subprocess`, or `none`
- `profilePrefix` — Prefix for iTerm2 dynamic profiles

### Claude Code CLI

```json
"claude": {
  "executable": "claude",
  "flags": ["--dangerously-skip-permissions"]
}
```

- `executable` — Path or name of the Claude Code CLI binary
- `flags` — Default flags passed to dispatched Claude sessions

### Build Commands

```json
"commands": {
  "typeCheck": "npm run typecheck",
  "lint": "npm run lint",
  "build": "npm run build",
  "test": "npm run test"
}
```

Set any command to `null` to skip that check. Additional optional commands: `validateTemplates`, `validateDocs`, `checkRules`.

### Categories

```json
"categories": ["feature", "bugfix", "refactor", "infrastructure", "docs"]
```

Categories available when creating scopes. Shown as filters and swim lanes on the board.

### Agents

```json
"agents": [
  { "id": "attacker", "label": "Attacker", "emoji": "...", "color": "#ff1744" },
  { "id": "chaos", "label": "Chaos", "emoji": "...", "color": "#F97316" },
  { "id": "frontend-designer", "label": "Frontend Designer", "emoji": "...", "color": "#EC4899" },
  { "id": "architect", "label": "Architect", "emoji": "...", "color": "#536dfe" },
  { "id": "rules-enforcer", "label": "Rules Enforcer", "emoji": "...", "color": "#6B7280" }
]
```

Each agent has an `id` (kebab-case), `label` (display name), `emoji`, and `color` (hex). These appear as badges in the dashboard.

### Health Checks (Optional)

```json
"healthChecks": {
  "staging": "https://staging.example.com/health",
  "production": "https://example.com/health"
}
```

URLs the deploy pipeline pings to verify deployments.

### Telemetry

```json
"telemetry": {
  "enabled": true,
  "url": "https://...",
  "headers": {}
}
```

Anonymous usage telemetry. Disable with `"enabled": false` or by setting `ORBITAL_TELEMETRY=false`.

### Environment Variables

| Variable | Description |
|---|---|
| `ORBITAL_PROJECT_ROOT` | Override project root detection |
| `ORBITAL_SERVER_PORT` | Override server port |
| `ORBITAL_CLIENT_PORT` | Override client port |
| `ORBITAL_LOG_LEVEL` | Override log level |
| `ORBITAL_TELEMETRY` | Set to `false` to disable telemetry |

---

## Workflow Presets

The workflow engine defines your Kanban columns, allowed transitions between them, branching strategy, and lifecycle hooks. Choose a preset during `orbital init` or switch later via the dashboard's Workflow Visualizer.

### Default (7 columns, trunk-based)

```
Icebox -> Planning -> Backlog -> Implementing -> Review -> Completed -> Main
```

The standard workflow. Scopes move through planning, implementation, review, and merge to main. Trunk-based branching — all work happens on the main branch.

### Minimal (3 columns, trunk-based)

```
To Do -> In Progress -> Done
```

Lightweight workflow for small projects or quick prototyping. No hooks, no branching. Fast transitions.

### Development (5 columns, trunk-based)

```
Backlog -> Implementing -> Review -> Completed -> Dev
```

Single-developer workflow with a review step. Work merges to a `dev` branch. Includes hooks for blocking unauthorized commits during implementation.

### Gitflow (9 columns, worktree branching)

```
Icebox -> Planning -> Backlog -> Implementing -> Review -> Completed -> Dev -> Staging -> Production
```

Full multi-branch workflow. Uses git worktrees for isolated feature branches. Includes comprehensive hooks for lifecycle gates, compliance checks, and deployment tracking. Each scope gets its own branch, merged through dev, staging, and production.

---

## Scopes

Scopes are the atomic units of work in Orbital Command. Each scope is a markdown file with YAML frontmatter, stored in `scopes/` subdirectories matching the workflow columns.

### Creating a Scope

In a Claude Code session:

```
/scope-create
```

Or manually create a file like `scopes/planning/001-my-feature.md`.

### File Format

**Filename convention:** `NNN-description.md` where `NNN` is a numeric ID (e.g., `042-add-auth.md`).

**Frontmatter fields:**

```yaml
---
id: 42
title: "Add user authentication"
status: planning
priority: medium        # critical | high | medium | low
effort_estimate: "1-4H" # <1H | 1-4H | 4H+
category: feature       # from categories in orbital.config.json
created: 2026-04-09
updated: 2026-04-09
spec_locked: false      # true after backlog — locks the specification
blocked_by: [38, 41]   # scope IDs this depends on
blocks: [45]           # scope IDs waiting on this
tags: [auth, api]
sessions: {}           # auto-populated: {implementScope: [...uuids], reviewGate: [...], ...}
---
```

### Scope Structure

Each scope document has three main parts:

1. **Dashboard** — Quick status, progress table, recent activity, and next actions. Updated continuously as work progresses.
2. **Specification** — The authoritative contract for what to build: requirements, technical approach, implementation phases, files summary, success criteria, risk assessment, and definition of done. Locked after the scope moves past planning.
3. **Process** — Claude's working memory: exploration log, decisions and reasoning, implementation log, and deviation notes. Collapsible sections meant for reference.

An **Agent Review** section at the end captures findings from automated agent analysis (blockers, warnings, suggestions).

### Scope Lifecycle

The typical lifecycle follows the workflow columns:

1. **Create** — `/scope-create` scaffolds a new scope in `planning/`
2. **Plan** — Fill in the specification, get approval, move to `backlog`
3. **Implement** — `/scope-implement` executes the phases defined in the spec
4. **Review** — `/scope-post-review` runs the agent team for code review
5. **Fix** — `/scope-fix-review` addresses any findings
6. **Merge** — `/git-commit` and `/git-main` (or `/git-dev`, `/git-staging`, etc.)

Scopes move between columns via drag-and-drop on the dashboard or through skills/hooks that trigger transitions.

---

## Skills (Slash Commands)

Skills are slash commands you invoke in Claude Code sessions. They provide structured workflows for common operations.

### Scope Lifecycle

| Skill | Description |
|---|---|
| `/scope-create` | Create a new scope document with structured template |
| `/scope-implement` | Execute a scope's implementation phases end-to-end |
| `/scope-pre-review` | Run the full agent team analysis before implementation |
| `/scope-post-review` | Orchestrate post-implementation quality gates and code review |
| `/scope-verify` | Formal review gate — checks spec compliance and test results |
| `/scope-fix-review` | Execute all code review findings from the agent team |

### Git Operations

| Skill | Description |
|---|---|
| `/git-commit` | Commit work (workflow-aware, routes to trunk or worktree strategy) |
| `/git-main` | Push or PR scope work to the main branch |
| `/git-dev` | Merge feature branch into dev |
| `/git-staging` | Create PR from dev to staging |
| `/git-production` | Create release PR from staging to main |
| `/git-hotfix` | Emergency fix branching from main |

### Testing & Quality

| Skill | Description |
|---|---|
| `/test-checks` | Run quality gates (typecheck, lint, build, tests, rule checks, etc.) |
| `/test-code-review` | Full validation suite including agent-driven code review |
| `/test-scaffold` | Generate test scaffolding for new code |

### Session Management

| Skill | Description |
|---|---|
| `/session-init` | Initialize a work session with project context |
| `/session-resume` | Resume a previous session with saved context |

---

## Agent System

Orbital Command ships with 5 AI agents organized into teams. Agents are auto-triggered by hooks during scope transitions and can also be invoked manually via `/scope-pre-review`.

### Red Team (Adversarial)

| Agent | Trigger | Focus |
|---|---|---|
| **Attacker** | Security-sensitive changes | Exploits vulnerabilities: injection vectors, credential exposure, API over-exposure, resource exhaustion, state corruption |
| **Chaos** | New features, state changes, external calls | Tests failure modes: partial completion, concurrent access, stale data, orphaned locks, queue backups |

### Blue Team (Domain Experts)

| Agent | Trigger | Focus |
|---|---|---|
| **Frontend Designer** | Frontend file changes, user-facing features | Reviews React components, UX patterns, style consistency, accessibility, real-time update correctness |

### Green Team (Engineering Standards)

| Agent | Trigger | Focus |
|---|---|---|
| **Architect** | New features, structural changes | Evaluates patterns, module boundaries, code structure, scalability |
| **Rules Enforcer** | Always runs before commits | Enforces project rules, linting standards, conventions, quality thresholds |

Agent definitions live in `.claude/agents/` as markdown files. Auto-invoke rules are configured in `.claude/config/agent-triggers.json`.

---

## Hooks

Hooks are shell scripts in `.claude/hooks/` that integrate with Claude Code's lifecycle events. They fire automatically based on trigger points defined in `.claude/settings.local.json`.

### Hook Triggers

| Trigger | When | Example Hooks |
|---|---|---|
| **SessionStart** | Claude Code session begins | `init-session.sh` — caches session ID |
| **SessionEnd** | Claude Code session ends | `end-session.sh` — emits SESSION_END event |
| **PreToolUse (Bash)** | Before a bash command runs | `block-push.sh` — prevents commits during workflows |
| **PreToolUse (Skill)** | Before a skill invocation | `git-commit-guard.sh` — guards against unauthorized commits |
| **PreToolUse (Edit/Write)** | Before file modifications | `scope-create-gate.sh` — validates scope structure |
| **PostToolUse (Bash)** | After a bash command | `scope-commit-logger.sh` — logs commits mentioning scope IDs |
| **PostToolUse (Grep/Glob)** | After search operations | `exploration-logger.sh` — tracks search patterns |

### How Hooks Work

Hooks communicate through the file-based event bus. When something significant happens (a scope transitions, a commit is made, a session starts), the hook writes a JSON event to `.claude/orbital-events/`. The server watches this directory, ingests events into SQLite, and pushes real-time updates to the dashboard via Socket.IO.

This architecture means hooks work even when the dashboard is offline — events queue as files and are processed when the server starts.

---

## Multi-Project Support

Orbital Command can manage multiple projects from a single dashboard.

### Registering Projects

```bash
# Register the current project
npx orbital register

# Register with an alias
npx orbital register /path/to/project --alias my-app

# List all registered projects
npx orbital projects

# Remove a project
npx orbital unregister <id>
```

Projects are tracked in `~/.orbital/config.json`. Each gets a unique ID (derived from directory name), a color for visual distinction, and an enabled/disabled toggle.

### Central Dashboard

When you run `orbital launch`, the dashboard shows all registered projects. You can:

- Switch between projects using the project selector
- View scopes across all projects with cross-project swim lanes
- Filter the board by project

---

## CLI Reference

| Command | Description |
|---|---|
| `npx orbital init` (or `setup`) | Interactive project setup wizard |
| `npx orbital launch [--open]` | Start the dashboard server |
| `npx orbital dev` | Start with Vite dev server (HMR) |
| `npx orbital config` | Interactive config editor |
| `npx orbital config show` | Print current config |
| `npx orbital config set <key> <value>` | Set a config value |
| `npx orbital doctor` | Health check and diagnostics |
| `npx orbital status` | Show template sync status |
| `npx orbital update [--dry-run]` | Sync templates to latest version |
| `npx orbital validate` | Check cross-references and consistency |
| `npx orbital build` | Production build of frontend |
| `npx orbital emit <TYPE> <JSON>` | Emit an event to the event bus |
| `npx orbital register [path] [--alias]` | Register a project with the dashboard |
| `npx orbital unregister <id>` | Remove a project from the dashboard |
| `npx orbital projects` | List all registered projects |
| `npx orbital pin <path> [--reason "..."]` | Lock a file from template updates |
| `npx orbital unpin <path>` | Unlock a pinned file |
| `npx orbital pins` | List all pinned files |
| `npx orbital diff <path>` | Show diff between local file and template |
| `npx orbital reset <path>` | Restore a file from its template |
| `npx orbital private [off]` | Toggle global private mode |
| `npx orbital uninstall [--dry-run] [--keep-config]` | Remove Orbital artifacts |

---

## Template Maintenance

Orbital tracks every file it installs via a manifest (`.claude/orbital-manifest.json`). This enables safe updates without overwriting your customizations.

### Updating

```bash
npx orbital update
```

This compares your installed files against the latest templates. Files you haven't modified are updated automatically. Files you've edited are left alone (status: `modified`). Use `--dry-run` to preview changes.

### Checking Status

```bash
npx orbital status
```

Shows the sync status of all managed files, grouped by type (hooks, skills, agents, config). Statuses:

| Status | Meaning |
|---|---|
| `synced` | Matches current template version |
| `outdated` | Template is newer, but you haven't edited the file |
| `modified` | You've edited the file — won't auto-update |
| `pinned` | You've locked this file — never auto-updated |
| `missing` | Expected file not found on disk |

### Pinning Files

```bash
# Lock a file from updates
npx orbital pin .claude/hooks/my-hook.sh --reason "Custom logic for our CI"

# View all pins
npx orbital pins

# Unlock
npx orbital unpin .claude/hooks/my-hook.sh
```

### Comparing and Resetting

```bash
# See what changed between your file and the template
npx orbital diff .claude/hooks/init-session.sh

# Restore a file to the template version
npx orbital reset .claude/hooks/init-session.sh
```

### Running Diagnostics

```bash
npx orbital doctor
```

Checks that your installation is healthy: verifies config, templates, hooks, permissions, and reports any issues.
