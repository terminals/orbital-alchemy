import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'fs';

// Mock chokidar before importing the module under test
const mockWatcher = {
  on: vi.fn().mockReturnThis(),
  close: vi.fn(),
};
vi.mock('chokidar', () => ({
  default: { watch: vi.fn(() => mockWatcher) },
}));

// Mock global-config
vi.mock('../global-config.js', () => ({
  GLOBAL_PRIMITIVES_DIR: '/home/test/.orbital/primitives',
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

// Mock fs.existsSync for the primitives dir check
const originalExistsSync = fs.existsSync;
vi.spyOn(fs, 'existsSync').mockImplementation((p: fs.PathLike) => {
  if (String(p) === '/home/test/.orbital/primitives') return true;
  return originalExistsSync(p);
});

import { startGlobalWatcher } from './global-watcher.js';

describe('global-watcher', () => {
  let mockSyncService: {
    propagateGlobalChange: ReturnType<typeof vi.fn>;
    handleNewGlobalFile: ReturnType<typeof vi.fn>;
    handleGlobalFileDeletion: ReturnType<typeof vi.fn>;
  };
  let mockIo: {
    to: ReturnType<typeof vi.fn>;
  };
  let mockRoom: {
    emit: ReturnType<typeof vi.fn>;
  };
  let handlers: Record<string, (filePath: string) => void>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockWatcher.on.mockReturnThis();

    // Reset fs.existsSync mock for the primitives dir check
    vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
      if (String(p) === '/home/test/.orbital/primitives') return true;
      return false;
    });

    mockSyncService = {
      propagateGlobalChange: vi.fn().mockReturnValue({ updated: ['proj-1'], skipped: [], failed: [] }),
      handleNewGlobalFile: vi.fn().mockReturnValue({ updated: ['proj-1'], skipped: [] }),
      handleGlobalFileDeletion: vi.fn().mockReturnValue({ removed: ['proj-1'], preserved: [] }),
    };

    mockRoom = { emit: vi.fn() };
    mockIo = { to: vi.fn().mockReturnValue(mockRoom) };

    startGlobalWatcher(mockSyncService as any, mockIo as any);

    // Capture all registered handlers
    handlers = {};
    for (const call of mockWatcher.on.mock.calls) {
      handlers[call[0] as string] = call[1] as (filePath: string) => void;
    }
  });

  it('calls propagateGlobalChange and emits sync:file:updated on file change', () => {
    handlers['change']('/home/test/.orbital/primitives/hooks/pre-push.sh');

    expect(mockSyncService.propagateGlobalChange).toHaveBeenCalledWith('hooks/pre-push.sh');
    expect(mockIo.to).toHaveBeenCalledWith('all-projects');
    expect(mockRoom.emit).toHaveBeenCalledWith('sync:file:updated', {
      relativePath: 'hooks/pre-push.sh',
      projects: ['proj-1'],
    });
  });

  it('calls handleNewGlobalFile and emits sync:file:created on file add', () => {
    handlers['add']('/home/test/.orbital/primitives/agents/new-agent.md');

    expect(mockSyncService.handleNewGlobalFile).toHaveBeenCalledWith('agents/new-agent.md');
    expect(mockRoom.emit).toHaveBeenCalledWith('sync:file:created', {
      relativePath: 'agents/new-agent.md',
      autoSynced: ['proj-1'],
      pending: [],
    });
  });

  it('calls handleGlobalFileDeletion and emits sync:file:deleted on file unlink', () => {
    handlers['unlink']('/home/test/.orbital/primitives/skills/old-skill.md');

    expect(mockSyncService.handleGlobalFileDeletion).toHaveBeenCalledWith('skills/old-skill.md');
    expect(mockRoom.emit).toHaveBeenCalledWith('sync:file:deleted', {
      relativePath: 'skills/old-skill.md',
      removed: ['proj-1'],
      preserved: [],
    });
  });

  it('returns null when global primitives directory does not exist', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    const result = startGlobalWatcher(mockSyncService as any, mockIo as any);
    expect(result).toBeNull();
  });

  // ═══════════════════════════════════════════════════════════
  // Wave 4: NEW TESTS below
  // ═══════════════════════════════════════════════════════════

  it('registers an error handler on the watcher', () => {
    const errorCall = mockWatcher.on.mock.calls.find((c: unknown[]) => c[0] === 'error');
    expect(errorCall).toBeDefined();
    // Calling the error handler should not throw
    const errorHandler = errorCall![1] as (err: Error) => void;
    expect(() => errorHandler(new Error('watch failed'))).not.toThrow();
  });

  it('propagates change results with multiple updated projects', () => {
    mockSyncService.propagateGlobalChange.mockReturnValue({
      updated: ['proj-1', 'proj-2', 'proj-3'],
      skipped: ['proj-4'],
      failed: [],
    });

    handlers['change']('/home/test/.orbital/primitives/hooks/post-commit.sh');

    expect(mockRoom.emit).toHaveBeenCalledWith('sync:file:updated', {
      relativePath: 'hooks/post-commit.sh',
      projects: ['proj-1', 'proj-2', 'proj-3'],
    });
  });
});
