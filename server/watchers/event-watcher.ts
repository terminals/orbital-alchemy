import chokidar from 'chokidar';
import path from 'path';
import fs from 'fs';
import { parseEventFile } from '../parsers/event-parser.js';
import type { EventService } from '../services/event-service.js';

const ARCHIVE_DIR_NAME = 'processed';

/**
 * Watch .claude/orbital-events/ for new JSON event files.
 * On startup, processes any existing unprocessed events.
 * After processing, moves files to a /processed subdirectory.
 */
export function startEventWatcher(
  eventsDir: string,
  eventService: EventService
): chokidar.FSWatcher {
  // Ensure directories exist
  fs.mkdirSync(eventsDir, { recursive: true });
  const archiveDir = path.join(eventsDir, ARCHIVE_DIR_NAME);
  fs.mkdirSync(archiveDir, { recursive: true });

  // Process existing unprocessed events on startup
  processExistingEvents(eventsDir, eventService, archiveDir);

  // Watch for new events
  // NOTE: The events dir is inside .claude/ (dotfile directory).
  // chokidar uses picomatch internally which skips dotfiles by default.
  // We must watch the directory directly and filter in the handler.
  const watcher = chokidar.watch(eventsDir, {
    ignored: [new RegExp(ARCHIVE_DIR_NAME)],
    persistent: true,
    ignoreInitial: true,
    depth: 0,
    // Allow watching inside dotfile directories
    dot: true,
  });

  watcher.on('add', (filePath: string) => {
    if (!filePath.endsWith('.json')) return;
    // Small delay to ensure file write is complete
    setTimeout(() => {
      processEventFile(filePath, eventService, archiveDir);
    }, 100);
  });

  return watcher;
}

function processExistingEvents(
  eventsDir: string,
  eventService: EventService,
  archiveDir: string
): void {
  try {
    const files = fs.readdirSync(eventsDir).filter((f) => f.endsWith('.json'));
    if (files.length === 0) return;

    // eslint-disable-next-line no-console
    console.log(`[Orbital] Processing ${files.length} queued events...`);

    // Sort by filename (UUID-based, so roughly chronological)
    files.sort();

    for (const file of files) {
      const filePath = path.join(eventsDir, file);
      processEventFile(filePath, eventService, archiveDir);
    }
  } catch {
    // Events dir may not exist yet
  }
}

function processEventFile(
  filePath: string,
  eventService: EventService,
  archiveDir: string
): void {
  const event = parseEventFile(filePath);
  if (!event) return;

  eventService.ingest(event);

  // Move to archive
  const fileName = path.basename(filePath);
  try {
    fs.renameSync(filePath, path.join(archiveDir, fileName));
  } catch {
    // If rename fails (cross-device), just delete the source
    try { fs.unlinkSync(filePath); } catch { /* noop */ }
  }
}
