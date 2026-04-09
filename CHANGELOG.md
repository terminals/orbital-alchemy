# Changelog

## 0.3.0

### Breaking Changes

- **Pre-built frontend only in npm package** — `src/`, `index.html`, `vite.config.ts`, and `tsconfig.json` are no longer included in the npm tarball. The server now serves pre-built assets from `dist/`.
- **Central multi-project server** — `startServer()` replaced with `startCentralServer()`. Each project gets an isolated database under `~/.orbital/projects/{id}/`.
- **CLI restructured** — `orbital init` now launches an interactive setup wizard (pass `--yes` for non-interactive). `orbital dev` is now an alias for `orbital launch --vite`. New commands added (see below).

### New Features

- **Multi-project central server** — Manage multiple Claude Code projects from a single Orbital Command instance. Projects are auto-registered on launch with aggregate views across all projects.
- **Interactive setup wizard** — `orbital init` runs a multi-phase wizard powered by `@clack/prompts` for first-time setup (global `~/.orbital/` config) and per-project initialization.
- **Manifest system** — Track template file sync state across projects. New commands:
  - `orbital validate` — Check manifest and config consistency
  - `orbital status` — Show file sync status (synced/outdated/modified/pinned)
  - `orbital pin <path> [--reason "..."]` / `orbital unpin <path>` — Lock files from template updates
  - `orbital pins` — List all pinned files
  - `orbital diff <path>` — Compare local file against template
  - `orbital reset <path>` — Restore file from current template
- **Auto-revert on abandoned dispatches** — When a dispatched session is abandoned, the scope automatically reverts to its previous status. Enabled on 5 key transitions (Team Review, Start Implementing, Launch Post-Review, Commit, Push to Main).
- **Shelving to icebox** — Scopes can now be moved back to icebox from backlog, implementing, review, or completed states, with confirmation checklists for safety.
- **Config & diagnostics commands** — `orbital config` (interactive editor), `orbital doctor` (health checks), `orbital private [on|off]` (toggle private mode).
- **Test infrastructure** — 334 tests across 20 test files using Vitest. Scripts: `test`, `test:unit`, `test:integration`, `test:watch`, `test:coverage`.
- **Telemetry service** — Opt-in anonymous usage telemetry with Cloudflare R2 backend.
- **Config health dashboard** — New frontend components for visualizing project configuration status and file inventory.
- **Onboarding tour** — Guided walkthrough for new users.
- **Favourite scopes** — Mark scopes as favourites for quick access and priority sorting.
- **Drag-reorder** — Reorder scopes within Kanban columns via drag-and-drop.

### Improvements

- **Guards view rewritten** — QualityGates page rebuilt as a unified activity feed with event filtering by category (workflow, enforcement, sessions), inline tags, and session resume buttons.
- **Enhanced CLI flags** — `orbital init` supports `--private`, `--preset`, `--project-name`, `--server-port`, `--client-port`. `orbital update` and `orbital uninstall` support `--dry-run` and `--keep-config`.
- **CI testing** — GitHub Actions now runs Vitest on Node 18, 20, and 22.
- **Settings hooks** — Write hook matcher updated to fire on both Write and Edit operations.
- **Workflow config types** — Added `autoRevert` field to `WorkflowEdge` interface.
- **Updated templates** — Refreshed hook scripts, skill templates, and added test-scaffold skill.
- **Legacy migration** — `migrate-legacy.ts` handles upgrading old single-project configurations to the new multi-project format.

### Dependencies

- Added: `@clack/prompts`, `picocolors`
- Added (dev): `vitest`, `supertest`, `@types/supertest`

## 0.2.0

- Multi-project support with central server and project switching
- Pre-built frontend served for npm installs
- ESM/CJS interop fixes for browser dependencies

## 0.1.0

- Initial release
