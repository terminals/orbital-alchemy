# Orbital Command

**Mission control for Claude Code projects.**

---

Orbital Command is a real-time project management dashboard purpose-built for [Claude Code](https://docs.anthropic.com/en/docs/claude-code). It gives you a visual Kanban board, sprint orchestration, a workflow DAG editor, quality gates, source control integration, and a session timeline — all driven by a file-based event bus that works even when the server is offline.

Think of it as the control tower that turns a collection of AI-assisted coding sessions into a coordinated engineering operation.

## Features

- **Kanban Board** — Drag-and-drop scope cards across customizable columns. Supports swim-lane grouping, filters, sprints, and batch dispatch.
- **Sprint Orchestration** — Group scopes into sprints, resolve dependencies via topological sort, and batch-dispatch to parallel Claude Code sessions with preflight checks.
- **Workflow Engine** — Visual DAG editor to define columns, transitions, hooks, checklists, and confirmation levels. Ships with 4 presets (default, gitflow, development, minimal).
- **Quality Gates** — 13 automated checks (type-check, lint, build, tests, rule enforcement, placeholder detection, and more). Gate verdicts block or allow scope transitions automatically.
- **Agent System** — 5 AI agent definitions organized in Red/Blue/Green teams with 3 review modes (quick, full, security). Dispatch reviews from the dashboard and see findings in real time.
- **Source Control** — Git overview, commit history, branch tracking, worktree management, GitHub PR integration, and deployment drift analysis.
- **Session Timeline** — Browse Claude Code sessions with token counts, tool usage stats, scope associations, and one-click session resumption.
- **Primitives Editor** — Browse and edit agents, skills, and hooks directly from the dashboard with a built-in file editor and workflow pipeline visualization.
- **File-Based Event Bus** — No daemon required. Hooks write JSON events to `.claude/orbital-events/`; the server picks them up on next start. Events queue naturally when the server is offline.

## Requirements

- **Node.js >= 18**
- **Claude Code** installed and available as `claude` on your PATH
- **iTerm2** (macOS, recommended) — sprint dispatch and batch orchestration use iTerm2 tabs to run parallel Claude Code sessions. Without it, sessions fall back to basic subprocess mode. The setup wizard will prompt you to install it.
- **C++ compiler** for the `better-sqlite3` native module:
  - macOS: Xcode Command Line Tools (`xcode-select --install`)
  - Linux: `build-essential` (`apt install build-essential`)

## Quick Start

```bash
npm install -g orbital-command
cd my-project
orbital
```

That's it. The `orbital` command detects your context and guides you through everything:

1. **First run** — setup wizard configures Orbital globally
2. **New project** — project setup wizard scaffolds hooks, skills, agents, and workflow config
3. **Existing project** — hub menu lets you launch the dashboard, edit config, run diagnostics, or update templates

On macOS, the wizard will recommend installing [iTerm2](https://iterm2.com) for the full dispatch experience — it polls for the install automatically so you can continue once it's ready.

Open [http://localhost:4444](http://localhost:4444) after launching.

## What Gets Installed

After setup, your project receives:

```
.claude/
  orbital.config.json           # Project configuration
  settings.local.json           # Hook registrations (merged, not overwritten)
  hooks/                        # 32 lifecycle hook scripts
  skills/                       # 16 skill definitions
  agents/                       # Agent team definitions + workflow docs
  config/
    workflow.json               # Active workflow configuration
    workflows/                  # Workflow presets (default, gitflow, development, minimal)
    agent-triggers.json         # Auto-invoke rules for agents
scopes/
  _template.md                  # Scope document template
  icebox/                       # Starting directory for scope documents
  planning/                     # (directories created per workflow preset)
  ...
.gitignore                      # Orbital patterns appended
```

| Category | Count | Description |
|----------|-------|-------------|
| Hooks | 32 | Shell scripts triggered by Claude Code lifecycle events |
| Skills | 16 | Scope lifecycle, git operations, testing, and session management |
| Agents | 5 | Red, Blue, and Green team agent definitions |
| Presets | 4 | `default` (7 columns), `gitflow` (9 columns), `development` (5 columns), `minimal` (3 columns) |

## Dashboard Views

| View | Path | Description |
|------|------|-------------|
| **Kanban** | `/` | Scope board with drag-and-drop, swim lanes, sprint containers, batch dispatch |
| **Primitives** | `/primitives` | Browse and edit agents, skills, and hooks with a directory tree and file editor |
| **Safeguards** | `/gates` | Quality gate status, violation trends, enforcement rules, override audit trail |
| **Repo** | `/repo` | Git overview, commit log, branches, worktrees, GitHub PRs, deployment history |
| **Sessions** | `/sessions` | Claude Code session timeline with token stats, tool usage, and resume capability |
| **Workflow** | `/workflow` | Visual DAG editor for columns, transitions, hooks, and presets |
| **Settings** | `/settings` | Theme toggle, font selection, and UI scale adjustment |

## CLI Reference

The bare `orbital` command is the primary entry point — it detects context and shows the right options. All subcommands below are also available directly for scripting or when you know what you want.

| Command | Description |
|---------|-------------|
| `orbital` | Context-aware hub menu (setup, init, launch, config, etc.) |
| `orbital` | Context-aware hub menu (setup, launch, config, doctor, etc.) |
| `orbital config` | Modify project settings interactively |
| `orbital doctor` | Health check and version diagnostics |
| `orbital update` | Sync templates and apply migrations |
| `orbital status` | Show template sync status |
| `orbital emit <TYPE> [JSON]` | Emit an event to the file-based event bus |
| `orbital validate` | Check cross-references and consistency |
| `orbital register [path]` | Register a project with the dashboard |
| `orbital unregister <id>` | Remove a project from the dashboard |
| `orbital projects` | List all registered projects |
| `orbital pin <path>` | Lock a file from template updates |
| `orbital unpin <path>` | Unlock a pinned file |
| `orbital diff <path>` | Show diff between template and local file |
| `orbital reset <path>` | Restore a file from the current template |
| `orbital uninstall` | Remove all Orbital artifacts from the project |

## Workflow Presets

Orbital ships with 4 workflow presets. Switch between them at any time via the Workflow Visualizer in the dashboard.

### Default (7 columns, trunk-based)

**Icebox** → **Planning** → **Backlog** → **Implementing** → **Review** → **Completed** → **Main**

The standard trunk-based workflow. 13 transition edges including shortcuts (planning → implementing), backward transitions for rework, and forward paths. 30 hooks for session management, scope lifecycle, quality gates, and event reporting. Best for most projects.

### Gitflow (9 columns, worktree isolation)

**Icebox** → **Planning** → **Backlog** → **Implementing** → **Review** → **Completed** → **Dev** → **Staging** → **Production**

Full gitflow with branch-per-scope worktree isolation. 16 transition edges, feature branches merged to dev, PRs to staging, and production releases. 30 hooks. Best for teams with formal release processes.

### Development (5 columns, trunk-based)

**Backlog** → **Implementing** → **Review** → **Completed** → **Dev**

Streamlined flow that drops planning and deploy stages. 6 transition edges, no hooks. Good for active development before you have a staging/production pipeline.

### Minimal (3 columns, trunk-based)

**To Do** → **In Progress** → **Done**

Simplest possible board. 2 transition edges, no hooks, no event inference. Good for experiments, hackathons, or projects that just need a task board.

## Skills

Skills are slash commands that Claude Code agents use to navigate your workflow. They're installed as markdown files in `.claude/skills/`.

### Scope Lifecycle
| Skill | Command | Purpose |
|-------|---------|---------|
| Create | `/scope-create` | Create a structured scope document with phases and success criteria |
| Implement | `/scope-implement` | Execute a scope end-to-end following defined phases |
| Pre-Review | `/scope-pre-review` | Run full agent team analysis before implementation |
| Post-Review | `/scope-post-review` | Orchestrate post-implementation quality gates and code review |
| Verify | `/scope-verify` | Formal review gate checking spec compliance and test results |
| Fix Review | `/scope-fix-review` | Execute all code review findings from agent team |

### Git Operations
| Skill | Command | Purpose |
|-------|---------|---------|
| Commit | `/git-commit` | Routes to proper git workflow (trunk/worktree aware) |
| Main | `/git-main` | Push or PR scope work to main branch |
| Dev | `/git-dev` | Merge feature branch into dev |
| Staging | `/git-staging` | Create PR from dev to staging |
| Production | `/git-production` | Create release PR from staging to main |
| Hotfix | `/git-hotfix` | Emergency fix branching from main |

### Testing & Sessions
| Skill | Command | Purpose |
|-------|---------|---------|
| Checks | `/test-checks` | Run 13 quality gates (lint, typecheck, rules, etc.) |
| Code Review | `/test-code-review` | Full validation suite with agent code review |
| Session Init | `/session-init` | Initialize work session with project context |
| Session Resume | `/session-resume` | Resume a previous session with saved context |

## Agent System

Agents are AI-powered review sessions with specialized perspectives. They run as parallel Claude Code sessions and report findings back to the dashboard.

### Red Team — Adversarial

| Agent | Trigger | Focus |
|-------|---------|-------|
| **Attacker** 🗡️ | Security-sensitive changes | Credential extraction, injection vectors, API over-exposure, resource exhaustion, state corruption |
| **Chaos** 💥 | New features, state changes, external calls | Partial completion, concurrent access conflicts, stale data, orphaned locks, queue backups |

### Blue Team — Domain Experts

| Agent | Trigger | Focus |
|-------|---------|-------|
| **Frontend Designer** 🎨 | Frontend changes, user-facing features | React components, UX patterns, style consistency, data accuracy, real-time updates |

### Green Team — Guardians

| Agent | Trigger | Focus |
|-------|---------|-------|
| **Architect** 🏗️ | New features, structural changes | Layer separation, module boundaries, pattern consistency, database integrity |
| **Rules Enforcer** 📋 | Every commit (blocking) | No `any` types, no console.log, file size limits, import ordering, project rules |

### Review Modes

Agents can run in three modes, configured per-transition in the workflow:

- **Quick** — Fast feedback from relevant agents only
- **Full** — Complete analysis from all agents
- **Security** — Enhanced scrutiny with red team focus

## Quality Gates

Orbital tracks 13 automated quality checks that can block or allow scope transitions:

| Gate | What it checks |
|------|---------------|
| `type-check` | TypeScript compilation |
| `lint` | Linter rules |
| `build` | Build succeeds |
| `tests` | Test suite passes |
| `rule-enforcement` | Project-specific rules |
| `template-validation` | Template compliance |
| `doc-links` | Documentation links valid |
| `doc-freshness` | Docs not stale |
| `no-placeholders` | No TODO/FIXME left behind |
| `no-mock-data` | No hardcoded test data |
| `no-shortcuts` | No workaround hacks |
| `no-default-secrets` | No hardcoded credentials |
| `no-stale-scopes` | Scopes aren't abandoned |

Gates are reported by hooks and displayed in the Safeguards view with trend charts and override tracking.

## Configuration

All configuration lives in `.claude/orbital.config.json`:

```jsonc
{
  "projectName": "My Project",
  "scopesDir": "scopes",
  "eventsDir": ".claude/orbital-events",
  "dbDir": ".claude/orbital",
  "configDir": ".claude/config",
  "serverPort": 4444,
  "clientPort": 4445,

  "terminal": {
    "adapter": "auto",           // "auto" | "iterm2" | "subprocess" | "none"
    "profilePrefix": "Orbital"
  },

  "claude": {
    "executable": "claude",
    "flags": ["--dangerously-skip-permissions"]
  },

  // Project-specific commands (null = disabled)
  "commands": {
    "typeCheck": null,           // e.g. "npx tsc --noEmit"
    "lint": null,                // e.g. "npx eslint ."
    "build": null,               // e.g. "npm run build"
    "test": null                 // e.g. "npm test"
  },

  "categories": ["feature", "bugfix", "refactor", "infrastructure", "docs"],

  "agents": [
    { "id": "attacker", "label": "Attacker", "emoji": "🗡️", "color": "#ff1744" },
    { "id": "chaos", "label": "Chaos", "emoji": "💥", "color": "#F97316" },
    { "id": "frontend-designer", "label": "Frontend Designer", "emoji": "🎨", "color": "#EC4899" },
    { "id": "architect", "label": "Architect", "emoji": "🏗️", "color": "#536dfe" },
    { "id": "rules-enforcer", "label": "Rules Enforcer", "emoji": "📋", "color": "#6B7280" }
  ]
}
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Browser (React 18)                       │
│  Kanban · Primitives · Safeguards · Repo · Sessions · DAG   │
└──────────────────────┬──────────────────────────────────────┘
                       │ Socket.io + REST (/api/orbital/*)
┌──────────────────────▼──────────────────────────────────────┐
│                  Express Server (:4444)                       │
│  ScopeService · SprintOrchestrator · BatchOrchestrator       │
│  WorkflowService · GateService · GitService · ConfigService  │
└──────┬───────────────┬──────────────────────────────────────┘
       │               │
  ┌────▼────┐   ┌──────▼───────┐
  │ SQLite  │   │  Filesystem  │
  │ (WAL)   │   │  (scopes +   │
  │         │   │   events)    │
  └─────────┘   └──────────────┘
```

| Layer | Technology | Role |
|-------|-----------|------|
| **Frontend** | React 18 + Vite + Tailwind CSS + Radix UI | Dashboard with drag-and-drop Kanban, Recharts visualizations, React Flow DAG editor |
| **Server** | Express + Socket.io | REST API under `/api/orbital/*`, real-time push, file watchers via chokidar |
| **Database** | SQLite via better-sqlite3 (WAL mode) | Zero-setup storage for sessions, events, gates, deploys, and sprints |
| **Event Bus** | Filesystem (`.claude/orbital-events/`) | JSON event files written by hooks; ingested on startup and watched in real time |
| **Workflow Engine** | Pure TypeScript (shared) | Config-driven transitions, validation, event inference, shell manifest generation |
| **Hooks** | Shell scripts (`.claude/hooks/`) | 32 scripts triggered by Claude Code lifecycle events (SessionStart, SessionEnd, PreToolUse, PostToolUse) |
| **Skills** | Markdown (`.claude/skills/`) | 16 skill definitions that teach Claude Code how to navigate your workflow |
| **Agents** | Markdown (`.claude/agents/`) | Team-based agent definitions dispatched as parallel Claude Code sessions |

## How It Works

### Scopes
Scopes are the unit of work in Orbital Command. Each scope is a markdown file with YAML frontmatter stored in `scopes/<column>/`. Moving a scope between columns on the board physically moves the file between directories.

```markdown
---
id: "042"
title: Add user authentication
status: implementing
category: feature
priority: high
blocked_by: ["041"]
---

## Specification
...
```

### Event Flow
1. Claude Code hooks fire during sessions (tool use, session start/end)
2. Hooks write JSON event files to `.claude/orbital-events/`
3. The server's file watcher picks them up and ingests into SQLite
4. Socket.io pushes updates to the dashboard in real time
5. If the server is offline, events queue as files and get ingested on next start

### Dispatch
When you dispatch a scope from the dashboard, Orbital:
1. Validates the transition is allowed by the workflow
2. Resolves the skill command for the edge (e.g., `/scope-implement`)
3. Spawns a Claude Code session in a terminal (iTerm2 tabs or subprocess)
4. Tracks the session lifecycle via hooks
5. Updates scope status as events flow back

## FAQ

### Can I use this without Claude Code?
No. Orbital Command is purpose-built for Claude Code. The hooks, skills, agents, and session tracking all depend on Claude Code's lifecycle events and CLI.

### Do I need to keep the dashboard running?
No. The file-based event bus means hooks write events as JSON files regardless of whether the server is running. Events queue up and get ingested when you next launch the dashboard.

### How do I customize the workflow columns?
Open the Workflow Visualizer (`/workflow` in the dashboard). You can add/remove columns, create transitions, attach hooks, and set confirmation levels. Or edit `.claude/config/workflow.json` directly. Changes take effect immediately.

### How do I add my own agents?
Create a markdown file in `.claude/agents/<team>/` following the structure of existing agents. Add the agent to the `agents` array in `orbital.config.json` to show it in the dashboard. Agents are dispatched as independent Claude Code sessions with the markdown file as their system prompt.

### What's the difference between trunk and worktree branching modes?
**Trunk mode** (default, development, minimal presets): All work happens on a single branch. Scopes commit directly. Simpler, good for solo or small teams.

**Worktree mode** (gitflow preset): Each scope gets its own git worktree and feature branch. Merges happen through PRs. Better for teams with formal review processes.

### How do sprints work?
Sprints group multiple scopes for batch execution. The orchestrator resolves dependencies using topological sort (Kahn's algorithm), organizes scopes into execution layers, then dispatches them in parallel with staggered 2-second intervals. One active batch per workflow column.

### How do I reset everything?
```bash
orbital uninstall    # Remove all Orbital artifacts
# Then run `orbital` and select "Reset to defaults"
```

This preserves your `scopes/` directory and event history.

### Can I use a different terminal than iTerm2?
Yes. Set `terminal.adapter` in your config:
- `"auto"` — Detects iTerm2 on macOS, falls back to subprocess
- `"iterm2"` — macOS iTerm2 with categorized tab groups
- `"subprocess"` — Generic subprocess spawning (works everywhere)
- `"none"` — Disable terminal dispatch

## Development

```bash
# Install dependencies (includes all build/frontend packages as devDependencies)
npm install

# Start dev server with hot-reload
npm run dev:local

# Run the full validation pipeline (typecheck → test → build → build:server)
npm run validate
```

| Script | Purpose |
|--------|---------|
| `npm run dev:local` | Express API + Vite dev server with hot-reload |
| `npm run dev:server` | Express API only (tsx watch) |
| `npm run dev:client` | Vite dev server only |
| `npm run typecheck` | Type check client + server tsconfigs |
| `npm run test` | Run all tests |
| `npm run build` | Vite production build (frontend) |
| `npm run build:server` | TypeScript compile server to dist/server |
| `npm run validate` | Full pipeline: typecheck → test → build → build:server |

### Releasing

```bash
npm run release             # patch bump (0.3.0 → 0.3.1)
npm run release -- minor    # minor bump (0.3.0 → 0.4.0)
npm run release -- major    # major bump (0.3.0 → 1.0.0)
```

This validates the full pipeline, bumps the version, creates a git tag, and pushes. The tag push triggers the publish workflow which validates again and publishes to npm with provenance.

## Contributing

Open an issue first for large changes or new features.

1. Fork the repository and clone locally
2. Install dependencies: `npm install`
3. Start development: `npm run dev:local`
4. Validate before submitting: `npm run validate`

## License

MIT
