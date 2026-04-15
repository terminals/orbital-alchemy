import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Mock chokidar before importing the module under test
const mockWatcher = {
  on: vi.fn().mockReturnThis(),
  close: vi.fn(),
};
vi.mock('chokidar', () => ({
  default: { watch: vi.fn(() => mockWatcher) },
}));

// Mock the event-parser
vi.mock('../parsers/event-parser.js', () => ({
  parseEventFile: vi.fn(),
}));

// Mock logger
vi.mock('../utils/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import { startEventWatcher } from './event-watcher.js';
import { parseEventFile } from '../parsers/event-parser.js';

describe('event-watcher', () => {
  let tmpDir: string;
  let mockEventService: { ingest: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'event-watcher-test-'));
    mockEventService = { ingest: vi.fn() };
    vi.clearAllMocks();
    // Reset chokidar mock watcher
    mockWatcher.on.mockReturnThis();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ─── startEventWatcher() ────────────────────────────────────

  describe('startEventWatcher()', () => {
    it('creates events and archive directories', () => {
      const eventsDir = path.join(tmpDir, 'new-events');
      startEventWatcher(eventsDir, mockEventService as any);

      expect(fs.existsSync(eventsDir)).toBe(true);
      expect(fs.existsSync(path.join(eventsDir, 'processed'))).toBe(true);
    });

    it('sets up chokidar watcher with add and error handlers', () => {
      startEventWatcher(tmpDir, mockEventService as any);

      const onCalls = mockWatcher.on.mock.calls.map((c: unknown[]) => c[0]);
      expect(onCalls).toContain('add');
      expect(onCalls).toContain('error');
    });

    it('processes existing JSON files on startup', () => {
      const eventFile = path.join(tmpDir, 'event-1.json');
      fs.writeFileSync(eventFile, '{"id":"1","type":"TEST","timestamp":"2026-01-01T00:00:00Z"}');

      const fakeEvent = { id: '1', type: 'TEST', timestamp: '2026-01-01T00:00:00Z' };
      vi.mocked(parseEventFile).mockReturnValue(fakeEvent as any);

      startEventWatcher(tmpDir, mockEventService as any);

      expect(parseEventFile).toHaveBeenCalledWith(eventFile);
      expect(mockEventService.ingest).toHaveBeenCalledWith(fakeEvent);
    });

    it('ignores non-JSON files on startup', () => {
      fs.writeFileSync(path.join(tmpDir, 'readme.txt'), 'not a json file');

      startEventWatcher(tmpDir, mockEventService as any);

      expect(parseEventFile).not.toHaveBeenCalled();
    });

    it('handles malformed JSON gracefully via parseEventFile returning null', () => {
      fs.writeFileSync(path.join(tmpDir, 'bad.json'), '{corrupt');
      vi.mocked(parseEventFile).mockReturnValue(null);

      startEventWatcher(tmpDir, mockEventService as any);

      expect(parseEventFile).toHaveBeenCalled();
      expect(mockEventService.ingest).not.toHaveBeenCalled();
    });
  });

  // ─── add handler logic ──────────────────────────────────────

  describe('add handler', () => {
    it('non-JSON files are ignored by the add handler', () => {
      startEventWatcher(tmpDir, mockEventService as any);

      // Find the 'add' handler
      const addCall = mockWatcher.on.mock.calls.find((c: unknown[]) => c[0] === 'add');
      expect(addCall).toBeDefined();
      const addHandler = addCall![1] as (filePath: string) => void;

      // Call with a non-JSON file
      addHandler('/some/path/file.txt');

      // parseEventFile should NOT be called because the handler returns early
      // (the check happens before the setTimeout, so it's synchronous)
      expect(parseEventFile).not.toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════════════════════
  // Wave 4: NEW TESTS below
  // ═══════════════════════════════════════════════════════════

  describe('startup: multiple JSON files', () => {
    it('processes multiple JSON files in sorted order', () => {
      // Write files with names that sort in a known order
      fs.writeFileSync(path.join(tmpDir, 'aaa-event.json'), '{}');
      fs.writeFileSync(path.join(tmpDir, 'zzz-event.json'), '{}');
      fs.writeFileSync(path.join(tmpDir, 'mmm-event.json'), '{}');

      const events = [
        { id: 'a', type: 'A', timestamp: '2026-01-01T00:00:00Z' },
        { id: 'z', type: 'Z', timestamp: '2026-01-03T00:00:00Z' },
        { id: 'm', type: 'M', timestamp: '2026-01-02T00:00:00Z' },
      ];

      let callIdx = 0;
      vi.mocked(parseEventFile).mockImplementation(() => events[callIdx++] as any);

      startEventWatcher(tmpDir, mockEventService as any);

      // Should be called 3 times, in filename-sorted order (aaa, mmm, zzz)
      expect(parseEventFile).toHaveBeenCalledTimes(3);
      const callPaths = vi.mocked(parseEventFile).mock.calls.map(c => path.basename(c[0] as string));
      expect(callPaths).toEqual(['aaa-event.json', 'mmm-event.json', 'zzz-event.json']);
    });
  });

  describe('add handler: JSON file triggers parse after delay', () => {
    it('calls parseEventFile for .json files via add handler', async () => {
      vi.useFakeTimers();

      const fakeEvent = { id: 'new-1', type: 'NEW', timestamp: '2026-01-01T00:00:00Z' };
      vi.mocked(parseEventFile).mockReturnValue(fakeEvent as any);

      startEventWatcher(tmpDir, mockEventService as any);

      // Clear calls from startup processing
      vi.mocked(parseEventFile).mockClear();
      mockEventService.ingest.mockClear();

      const addCall = mockWatcher.on.mock.calls.find((c: unknown[]) => c[0] === 'add');
      const addHandler = addCall![1] as (filePath: string) => void;

      // Trigger the handler with a JSON file
      addHandler(path.join(tmpDir, 'new-event.json'));

      // Before timer fires, parse should not be called
      expect(parseEventFile).not.toHaveBeenCalled();

      // Advance timers past the 100ms delay
      vi.advanceTimersByTime(150);

      expect(parseEventFile).toHaveBeenCalledWith(path.join(tmpDir, 'new-event.json'));
      expect(mockEventService.ingest).toHaveBeenCalledWith(fakeEvent);

      vi.useRealTimers();
    });
  });
});
