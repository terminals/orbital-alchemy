# Orbital Command

**Mission control for Claude Code projects.**

---

Orbital Command is a real-time project management dashboard purpose-built for [Claude Code](https://docs.anthropic.com/en/docs/claude-code). It gives you a visual Kanban board, sprint orchestration, a workflow DAG editor, quality gates, and a deploy pipeline -- all driven by file-based events that work even when the server is offline. Think of it as the control tower that turns a collection of AI-assisted coding sessions into a coordinated engineering operation.

## Features

- :satellite: **Kanban Board** -- Drag-and-drop scope cards across a fully customizable column layout (icebox, planning, backlog, implementing, review, completed, dev, staging, production).
- :rocket: **Sprint Orchestration** -- Batch-dispatch multiple scopes to parallel Claude Code sessions with preflight checks and progress tracking.
- :wrench: **Workflow Engine** -- Visual DAG editor to define your own columns, transitions, hooks, checklists, and confirmation levels. Ships with three presets.
- :shield: **Quality Gates** -- Track build, test, and lint results in real-time. Gate verdicts block or allow scope transitions automatically.
- :robot: **Agent System** -- 9 AI agent definitions organized in Red/Blue/Green teams. See which agents are reviewing which files in the live Agent Feed.
- :ship: **Deploy Pipeline** -- Track deployments from dev through staging to production with health checks and rollback indicators.
- :clock1: **Session Timeline** -- Browse all Claude Code sessions with start/end times, scope associations, and outcome metadata.
- :memo: **Enforcement View** -- Monitor rule violations across the project, grouped by category and severity.
- :zap: **File-Based Event Bus** -- No daemon required. Hooks write JSON events to `.claude/orbital-events/`; the server picks them up on next start. Events queue naturally when the server is offline.

## Quick Start

```bash
# Scaffold Orbital Command into your project
npx orbital-command init

# Launch the dashboard
npx orbital-command dev
```

Then open [http://localhost:4445](http://localhost:4445) in your browser.

The `init` command is non-destructive -- it will skip files that already exist. Pass `--force` to overwrite.

## What Gets Installed

After `orbital init`, your project receives:

```
.claude/
  orbital.config.json          # Project configuration
  settings.local.json          # Hook registrations (merged, not overwritten)
  hooks/                       # 29 lifecycle hook scripts
  skills/                      # 16 skill definitions (4 routers + 12 sub-skills)
  agents/                      # Agent team definitions + workflow docs
  config/
    workflows/                 # Workflow presets (default, development, minimal)
    agent-triggers.json        # Auto-invoke rules for agents
scopes/
  icebox/                      # Starting directory for scope documents
.gitignore                     # Orbital patterns appended
```

| Category | Count | Description |
|----------|-------|-------------|
| Hooks | 29 | Shell scripts triggered by Claude Code lifecycle events |
| Skills | 16 | 4 routers (`/scope`, `/work`, `/git`, `/test`) + 12 workflow sub-skills |
| Agents | 7 (+3 optional) | Red, Blue, and Green team agent definitions; 3 domain-specific examples |
| Presets | 3 | `default` (9 columns), `development` (5 columns), `minimal` (3 columns) |

## Configuration

All configuration lives in `.claude/orbital.config.json`. Resolution order: **config file > CLI flags > defaults**.

```jsonc
{
  // Display name shown in the dashboard header
  "projectName": "My Project",

  // Where scope markdown files live (relative to project root)
  "scopesDir": "scopes",

  // Directory for the file-based event bus
  "eventsDir": ".claude/orbital-events",

  // SQLite database storage
  "dbDir": ".claude/orbital",

  // Workflow presets, agent triggers, and other config
  "configDir": ".claude/config",

  // Server (API + Socket.io) and client (Vite) ports
  "serverPort": 4444,
  "clientPort": 4445,

  // Terminal adapter for dispatching Claude Code sessions
  "terminal": {
    "adapter": "auto",       // "auto" | "iterm2" | "subprocess" | "none"
    "profilePrefix": "Orbital"
  },

  // Claude Code CLI configuration
  "claude": {
    "executable": "claude",
    "flags": ["--dangerously-skip-permissions"]
  },

  // Project-specific build/test commands (null = disabled)
  "commands": {
    "typeCheck": null,       // e.g. "npx tsc --noEmit"
    "lint": null,            // e.g. "npx eslint ."
    "build": null,           // e.g. "npm run build"
    "test": null,            // e.g. "npm test"
    "validateTemplates": null,
    "validateDocs": null,
    "checkRules": null
  },

  // Scope categorization labels
  "categories": ["feature", "bugfix", "refactor", "infrastructure", "docs"],

  // Agent definitions displayed in the dashboard
  "agents": [
    { "id": "attacker", "label": "Attacker", "emoji": "🗡️", "color": "#ff1744" },
    { "id": "chaos", "label": "Chaos", "emoji": "💥", "color": "#F97316" },
    { "id": "frontend-designer", "label": "Frontend Designer", "emoji": "🎨", "color": "#EC4899" },
    { "id": "architect", "label": "Architect", "emoji": "🏗️", "color": "#536dfe" },
    { "id": "devops-expert", "label": "DevOps Expert", "emoji": "🚀", "color": "#40c4ff" },
    { "id": "rules-enforcer", "label": "Rules Enforcer", "emoji": "📋", "color": "#6B7280" }
  ]
}
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Browser (React)                         │
│  Kanban · Sprint · Workflow · Gates · Agents · Pipeline     │
└──────────────────────┬──────────────────────────────────────┘
                       │ Socket.io + REST
┌──────────────────────▼──────────────────────────────────────┐
│                  Express Server (:4444)                      │
│  Scope Service · Sprint Orchestrator · Workflow Engine       │
│  Gate Service · Deploy Service · Event Watcher               │
└──────┬───────────────┬──────────────────────────────────────┘
       │               │
  ┌────▼────┐   ┌──────▼───────┐
  │ SQLite  │   │  Filesystem  │
  │ (db)    │   │  (events +   │
  │         │   │   scopes)    │
  └─────────┘   └──────────────┘
```

| Layer | Technology | Role |
|-------|-----------|------|
| **Frontend** | React 18 + Vite + Tailwind CSS + Radix UI | Dashboard UI with drag-and-drop Kanban, charts, and workflow DAG editor |
| **Server** | Express + Socket.io | REST API, real-time push, file watchers for scopes and events |
| **Database** | SQLite via better-sqlite3 | Zero-setup persistent storage for sessions, events, gates, and deploys |
| **Event Bus** | Filesystem (`.claude/orbital-events/`) | JSON event files written by hooks; server ingests on startup and via chokidar watcher |
| **Workflow Engine** | Pure TypeScript, config-driven | Column definitions, transition edges, hook bindings, and checklist rules -- all in JSON |
| **Hooks** | Shell scripts (`.claude/hooks/`) | Triggered by Claude Code lifecycle events (session start, tool use, etc.) |
| **Skills** | Markdown (`.claude/skills/`) | Claude Code skill definitions that teach the AI how to navigate your workflow |
| **Agents** | Markdown (`.claude/agents/`) | Team-based agent definitions that run as parallel review sessions |

## CLI Reference

| Command | Description |
|---------|-------------|
| `orbital init` | Scaffold hooks, skills, agents, and config into the current project. Pass `--force` to overwrite existing files. |
| `orbital dev` | Start the API server and Vite dev server concurrently. |
| `orbital build` | Production build of the dashboard frontend. |
| `orbital emit <TYPE> <JSON>` | Emit an event to the file-based event bus. Useful for testing and CI integration. |
| `orbital update` | Re-copy hooks, skills, and agents from the latest package templates (overwrites). Pass `--include-examples` to include domain-specific example agents. |
| `orbital uninstall` | Remove all Orbital artifacts (hooks, skills, agents, settings registrations) from the project. Preserves `scopes/` and event history. |

## Workflow Presets

Orbital ships with three workflow presets. Select one during init or switch at any time via the Workflow Visualizer in the dashboard.

### Default (9 columns)

The full lifecycle: **Icebox** :arrow_right: **Planning** :arrow_right: **Backlog** :arrow_right: **Implementing** :arrow_right: **Review** :arrow_right: **Completed** :arrow_right: **Dev** :arrow_right: **Staging** :arrow_right: **Production**. Includes 15 transition edges, confirmation checklists, shortcut paths (fast-track, skip-review), and backward transitions for rework. Best for production projects with CI/CD pipelines.

### Development (5 columns)

A streamlined dev-focused flow: **Backlog** :arrow_right: **Implementing** :arrow_right: **Review** :arrow_right: **Completed** :arrow_right: **Dev**. Drops the planning and deploy stages. Good for active development before you have a staging/production pipeline.

### Minimal (3 columns)

The simplest possible board: **To Do** :arrow_right: **In Progress** :arrow_right: **Done**. No hooks, no event inference, no deploy tracking. Good for experiments, hackathons, or projects that just need a task board.

## Agent System

Agents are AI-powered review sessions that run in parallel, each with a specialized perspective defined in markdown. They are organized into three teams:

### :red_circle: Red Team (Adversarial)
- **Attacker** -- Probes for security vulnerabilities, injection vectors, and unsafe patterns.
- **Chaos** -- Tests edge cases, race conditions, error handling, and failure modes.

### :blue_circle: Blue Team (Quality)
- **Frontend Designer** -- Reviews UI/UX patterns, accessibility, component structure, and visual consistency.
- **DevOps Expert** -- Evaluates infrastructure, deployment readiness, performance, and operational concerns.

### :green_circle: Green Team (Architecture)
- **Architect** -- Assesses system design, abstraction boundaries, coupling, and scalability.
- **Rules Enforcer** -- Validates compliance with project-specific rules, conventions, and documentation standards.

Additionally, 3 **domain-specific example agents** are included (installed with `orbital init` or `orbital update --include-examples`) to demonstrate how to create agents tailored to your project's domain.

Agent reviews are dispatched from the dashboard and their findings appear in the **Agent Feed** view in real time.

## Contributing

Contributions are welcome. To get started:

1. Fork the repository and clone it locally.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the development server:
   ```bash
   npm run dev
   ```
   This launches both the Express API server and the Vite dev server with hot reload.
4. Make your changes, ensure TypeScript compiles cleanly (`npm run build`), and open a pull request.

Please open an issue first for large changes or new features so we can discuss the approach.

## License

MIT
