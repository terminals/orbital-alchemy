import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import Database from 'better-sqlite3';
import { SCHEMA_DDL } from '../schema.js';

// ─── Mocks for heavy dependencies ─────────────────────────

// Mock logger
vi.mock('../utils/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Mock database to return in-memory DB
let testDb: Database.Database;
vi.mock('../database.js', () => ({
  openProjectDatabase: vi.fn(() => testDb),
}));

// Mock config loader to return controlled config
let testConfig: any;
vi.mock('../config.js', () => ({
  loadConfig: vi.fn(() => testConfig),
}));

// Mock chokidar for watchers
const mockScopeWatcher = { on: vi.fn().mockReturnThis(), close: vi.fn().mockResolvedValue(undefined) };
const mockEventWatcher = { on: vi.fn().mockReturnThis(), close: vi.fn().mockResolvedValue(undefined) };
vi.mock('../watchers/scope-watcher.js', () => ({
  startScopeWatcher: vi.fn(() => mockScopeWatcher),
}));
vi.mock('../watchers/event-watcher.js', () => ({
  startEventWatcher: vi.fn(() => mockEventWatcher),
}));

// Mock dispatch utils
vi.mock('../utils/dispatch-utils.js', () => ({
  resolveStaleDispatches: vi.fn(),
  resolveActiveDispatchesForScope: vi.fn(),
  resolveDispatchesByPid: vi.fn().mockReturnValue([]),
  resolveDispatchesByDispatchId: vi.fn().mockReturnValue([]),
  linkPidToDispatch: vi.fn(),
  tryAutoRevertAndClear: vi.fn(),
}));

// Mock session sync
vi.mock('../services/claude-session-service.js', () => ({
  syncClaudeSessionsToDB: vi.fn().mockResolvedValue(0),
}));

// Mock terminal launcher (ensures no real profiles written)
vi.mock('../utils/terminal-launcher.js', () => ({
  ensureDynamicProfiles: vi.fn(),
}));

import { createProjectContext } from '../project-context.js';

function createMockEmitter() {
  return {
    emit: vi.fn(),
    getProjectId: vi.fn(() => 'test'),
    getServer: vi.fn(),
  } as any;
}

describe('ProjectContext', () => {
  let tmpDir: string;

  beforeEach(() => {
    vi.clearAllMocks();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-test-'));

    // Create necessary subdirectories
    const scopesDir = path.join(tmpDir, 'scopes');
    const eventsDir = path.join(tmpDir, '.claude', 'orbital-events');
    const configDir = path.join(tmpDir, '.claude', 'config');
    const dbDir = path.join(tmpDir, '.claude', 'db');
    fs.mkdirSync(scopesDir, { recursive: true });
    fs.mkdirSync(eventsDir, { recursive: true });
    fs.mkdirSync(configDir, { recursive: true });
    fs.mkdirSync(dbDir, { recursive: true });

    // Create in-memory DB with schema + migrations
    testDb = new Database(':memory:');
    testDb.pragma('journal_mode = WAL');
    testDb.pragma('foreign_keys = ON');
    testDb.exec(SCHEMA_DDL);
    // Apply migrations that add columns required by services
    testDb.exec("ALTER TABLE sprints ADD COLUMN target_column TEXT DEFAULT 'backlog'");
    testDb.exec("ALTER TABLE sprints ADD COLUMN group_type TEXT DEFAULT 'sprint'");
    testDb.exec("ALTER TABLE sprints ADD COLUMN dispatch_result TEXT DEFAULT '{}'");
    testDb.exec('CREATE INDEX IF NOT EXISTS idx_sprints_target_column ON sprints(target_column)');
    testDb.exec('ALTER TABLE sessions ADD COLUMN telemetry_sent_at TEXT');

    // Set up test config
    testConfig = {
      projectName: 'test-project',
      projectRoot: tmpDir,
      scopesDir,
      eventsDir,
      dbDir,
      configDir,
      serverPort: 4444,
      clientPort: 4445,
      terminal: { adapter: 'none', profilePrefix: 'test' },
      claude: { executable: 'claude', flags: [], dispatchFlags: {} },
      dispatch: { envVars: {}, maxConcurrent: 5, maxBatchSize: 20, staleTimeoutMinutes: 10 },
      categories: [],
      agents: [],
      telemetry: { enabled: false, url: '', headers: {} },
    };
  });

  afterEach(async () => {
    try { testDb.close(); } catch { /* already closed */ }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ─── Factory: createProjectContext ────────────────────────

  describe('createProjectContext()', () => {
    it('returns a context with all expected services', async () => {
      const emitter = createMockEmitter();
      const ctx = await createProjectContext('test', tmpDir, emitter);

      // Core
      expect(ctx.id).toBe('test');
      expect(ctx.config).toBeDefined();
      expect(ctx.db).toBeDefined();
      expect(ctx.workflowEngine).toBeDefined();
      expect(ctx.emitter).toBeDefined();

      // All 13 services
      expect(ctx.scopeCache).toBeDefined();
      expect(ctx.scopeService).toBeDefined();
      expect(ctx.eventService).toBeDefined();
      expect(ctx.gateService).toBeDefined();
      expect(ctx.deployService).toBeDefined();
      expect(ctx.sprintService).toBeDefined();
      expect(ctx.sprintOrchestrator).toBeDefined();
      expect(ctx.batchOrchestrator).toBeDefined();
      expect(ctx.readinessService).toBeDefined();
      expect(ctx.workflowService).toBeDefined();
      expect(ctx.gitService).toBeDefined();
      expect(ctx.githubService).toBeDefined();

      // Watchers
      expect(ctx.scopeWatcher).toBeDefined();
      expect(ctx.eventWatcher).toBeDefined();

      // Status
      expect(ctx.status).toBe('active');

      await ctx.shutdown();
    });

    it('creates icebox directory if it does not exist', async () => {
      const emitter = createMockEmitter();
      const iceboxDir = path.join(testConfig.scopesDir, 'icebox');

      // Should not exist before
      expect(fs.existsSync(iceboxDir)).toBe(false);

      const ctx = await createProjectContext('test', tmpDir, emitter);
      expect(fs.existsSync(iceboxDir)).toBe(true);

      await ctx.shutdown();
    });

    it('writes workflow manifest file to configDir', async () => {
      const emitter = createMockEmitter();
      const ctx = await createProjectContext('test', tmpDir, emitter);

      const manifestPath = path.join(testConfig.configDir, 'workflow-manifest.sh');
      expect(fs.existsSync(manifestPath)).toBe(true);
      const content = fs.readFileSync(manifestPath, 'utf-8');
      expect(content.length).toBeGreaterThan(0);

      await ctx.shutdown();
    });

    it('starts scope and event watchers', async () => {
      const { startScopeWatcher } = await import('../watchers/scope-watcher.js');
      const { startEventWatcher } = await import('../watchers/event-watcher.js');
      const emitter = createMockEmitter();

      const ctx = await createProjectContext('test', tmpDir, emitter);

      expect(startScopeWatcher).toHaveBeenCalledWith(
        testConfig.scopesDir,
        expect.anything(), // scopeService
      );
      expect(startEventWatcher).toHaveBeenCalledWith(
        testConfig.eventsDir,
        expect.anything(), // eventService
      );

      await ctx.shutdown();
    });

    it('registers periodic intervals', async () => {
      const emitter = createMockEmitter();
      const ctx = await createProjectContext('test', tmpDir, emitter);

      // Context should have multiple intervals (batch recovery, stale dispatch, session sync, git poll)
      expect(ctx.intervals.length).toBeGreaterThanOrEqual(4);

      await ctx.shutdown();
    });
  });

  // ─── Shutdown ─────────────────────────────────────────────

  describe('shutdown()', () => {
    it('clears all intervals', async () => {
      const emitter = createMockEmitter();
      const ctx = await createProjectContext('test', tmpDir, emitter);

      const intervalCount = ctx.intervals.length;
      expect(intervalCount).toBeGreaterThan(0);

      await ctx.shutdown();
      expect(ctx.intervals.length).toBe(0);
    });

    it('closes scope and event watchers', async () => {
      const emitter = createMockEmitter();
      const ctx = await createProjectContext('test', tmpDir, emitter);

      await ctx.shutdown();
      expect(mockScopeWatcher.close).toHaveBeenCalled();
      expect(mockEventWatcher.close).toHaveBeenCalled();
    });

    it('sets status to offline after shutdown', async () => {
      const emitter = createMockEmitter();
      const ctx = await createProjectContext('test', tmpDir, emitter);

      expect(ctx.status).toBe('active');
      await ctx.shutdown();
      expect(ctx.status).toBe('offline');
    });

    it('handles watcher close errors gracefully', async () => {
      mockScopeWatcher.close.mockRejectedValueOnce(new Error('close failed'));
      const emitter = createMockEmitter();
      const ctx = await createProjectContext('test', tmpDir, emitter);

      // Should not throw
      await ctx.shutdown();
      expect(ctx.status).toBe('offline');
    });
  });
});
