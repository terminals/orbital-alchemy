# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is this project?

Orbital Command is a real-time project management dashboard for Claude Code projects. It provides a visual Kanban board, sprint orchestration, workflow DAG editor, quality gates, agent feed, deploy pipeline, and session timeline — all driven by a file-based event bus. It's published as an npm package (`orbital-command`) with a CLI (`orbital`).

## Commands

```bash
# Development (runs Express API + Vite dev server concurrently)
npm run dev:local          # Direct local dev (server :4444, client :4445)
npm run dev                # Uses `orbital dev` (requires bin to be linked)

# Individual servers
npm run dev:server         # Express API only (tsx watch)
npm run dev:client         # Vite dev server only

# Build
npm run build              # Vite production build (frontend)
npm run build:server       # TypeScript compile server to dist/server

# Type checking
npm run typecheck          # Checks both tsconfigs (client + server)
tsc --noEmit               # Client/shared only
tsc --noEmit -p tsconfig.server.json  # Server/shared only
```

## Architecture

**Three-layer architecture with shared code:**

- **`server/`** — Express + Socket.io backend (port 4444). REST API under `/api/orbital/*`, real-time push via Socket.io. SQLite (better-sqlite3) for persistence. File watchers (chokidar) for scopes and events.
- **`src/`** — React 18 + Vite frontend (port 4445). Tailwind CSS + shadcn/ui (New York style, `@/components/ui/`). React Router for views. Socket.io client for real-time updates.
- **`shared/`** — Code shared between server and client. Contains the `WorkflowEngine` (pure TypeScript, no I/O) and workflow config types. Imported by both tsconfigs.

**Key data flows:**

- Scopes are markdown files with YAML frontmatter in `scopes/` subdirectories. The `scope-parser.ts` reads them using `gray-matter`. They live in an in-memory cache (`ScopeCache`), not in SQLite.
- Events are JSON files in `.claude/orbital-events/`. Hooks write them; the `event-watcher.ts` ingests them into SQLite. Events can queue while the server is offline.
- The `WorkflowEngine` is config-driven: column definitions, transition edges, hooks, and event inference rules are all defined in JSON. It validates transitions, infers status from events, and generates shell manifests for bash hooks.
- Socket.io pushes real-time updates for scopes, events, gates, deploys, sessions, sprints, and workflow changes.

**Server structure:**
- `server/config.ts` — Singleton config loaded from `.claude/orbital.config.json`, merged with defaults. Resolves project root via env/git/cwd.
- `server/database.ts` — SQLite singleton with WAL mode. Schema in `schema.ts`, incremental migrations in `runMigrations()`.
- `server/services/` — Business logic: `ScopeService`, `EventService`, `GateService`, `DeployService`, `SprintService`, `SprintOrchestrator`, `BatchOrchestrator`, `WorkflowService`.
- `server/routes/` — Express route factories that receive services via dependency injection (object destructuring params).
- `server/adapters/` — Terminal adapters (iTerm2, subprocess) for dispatching Claude Code sessions.
- `server/parsers/` — `scope-parser.ts` (frontmatter→ParsedScope), `event-parser.ts` (JSON→event).
- `server/watchers/` — Chokidar watchers for scope files and event files.

**Frontend structure:**
- `src/views/` — Top-level page components: `ScopeBoard`, `AgentFeed`, `QualityGates`, `EnforcementView`, `DeployPipeline`, `SessionTimeline`, `WorkflowVisualizer` (lazy-loaded).
- `src/components/` — Reusable components. `ui/` has shadcn/ui primitives. `workflow/` has the DAG editor components.
- `src/hooks/` — Custom React hooks for data fetching, socket subscriptions, filters, DnD, etc. Most use `useSocket` for real-time subscriptions.
- `src/types/index.ts` — All shared TypeScript types for the frontend (Scope, Event, Sprint, Session, etc.).
- `src/layouts/DashboardLayout.tsx` — Shell with sidebar nav, neon glass theme toggle, connection status, and event ticker.

**CLI and templates:**
- `bin/orbital.js` — CLI entry point. Commands: `init`, `dev`, `build`, `emit`, `update`, `uninstall`. Init scaffolds hooks/skills/agents/config into the target project.
- `templates/` — Template files copied by `orbital init`: hooks (shell scripts), skills (markdown), agents (markdown), workflow presets, settings-hooks.json.
- `schemas/` — JSON Schema for `orbital.config.json`.

## TypeScript Configuration

Two tsconfigs:
- `tsconfig.json` — Client + shared code. `moduleResolution: "bundler"`, `noEmit: true`, `jsx: "react-jsx"`. Path alias `@/*` → `src/*`. Includes `src/` and `shared/`.
- `tsconfig.server.json` — Server + shared code. `moduleResolution: "bundler"`, emits to `dist/server`. Includes `server/` and `shared/`.

Both use `strict: true`, `noUnusedLocals`, `noUnusedParameters`, ES2022 target.

## Conventions

- Import paths in server code use `.js` extensions (ESM resolution): `import { getConfig } from './config.js'`.
- Vite proxies `/api/orbital` and `/socket.io` from port 4445 to port 4444 during development.
- All REST endpoints are prefixed with `/api/orbital/`.
- The frontend uses `@/` path alias for `src/` imports.
- shadcn/ui components live in `src/components/ui/` (New York style, zinc base color, CSS variables).
- ScopeStatus is a dynamic string (not an enum) — validated at runtime via `WorkflowEngine.isValidStatus()`.
- Route factories in `server/routes/` follow a pattern: `export function createXRoutes(deps: { ... }): Router`.

## Self-hosting: symlinked templates

This repo uses Orbital Command on itself. To prevent drift between `templates/` (git-tracked, published to npm) and `.claude/` (runtime), the following `.claude/` directories are **symlinks** into `templates/`:

- `.claude/hooks/*.sh` → `templates/hooks/*.sh`
- `.claude/skills/*/` → `templates/skills/*/`
- `.claude/agents/*/` → `templates/agents/*/`
- `.claude/config/workflows/*.json` → `templates/presets/*.json`
- `.claude/config/agent-triggers.json` → `templates/config/agent-triggers.json`
- `.claude/quick/` → `templates/quick/`
- `.claude/anti-patterns/` → `templates/anti-patterns/`
- `.claude/lessons-learned.md` → `templates/lessons-learned.md`

**Rules:**
- Always edit `templates/` (the git-tracked source), not `.claude/` directly.
- Do NOT run `orbital update` in this repo — it overwrites symlinks with copies.
- Do NOT replace symlinks with regular files.
