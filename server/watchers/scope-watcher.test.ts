import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock chokidar before importing the module under test
const mockWatcher = {
  on: vi.fn().mockReturnThis(),
  close: vi.fn(),
};
vi.mock('chokidar', () => ({
  default: { watch: vi.fn(() => mockWatcher) },
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

import { startScopeWatcher } from './scope-watcher.js';

describe('scope-watcher', () => {
  let mockScopeService: {
    updateFromFile: ReturnType<typeof vi.fn>;
    removeByFilePath: ReturnType<typeof vi.fn>;
    isSuppressed: ReturnType<typeof vi.fn>;
  };
  let handlers: Record<string, (filePath: string) => void>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockWatcher.on.mockReturnThis();

    mockScopeService = {
      updateFromFile: vi.fn(),
      removeByFilePath: vi.fn(),
      isSuppressed: vi.fn().mockReturnValue(false),
    };

    startScopeWatcher('/some/scopes', mockScopeService as any);

    // Capture all registered handlers
    handlers = {};
    for (const call of mockWatcher.on.mock.calls) {
      handlers[call[0] as string] = call[1] as (filePath: string) => void;
    }
  });

  // ─── add handler ────────────────────────────────────────────

  describe('add handler', () => {
    it('triggers updateFromFile for .md files', () => {
      handlers['add']('/some/scopes/active/scope-1.md');
      expect(mockScopeService.updateFromFile).toHaveBeenCalledWith('/some/scopes/active/scope-1.md');
    });

    it('ignores non-.md files', () => {
      handlers['add']('/some/scopes/active/notes.txt');
      expect(mockScopeService.updateFromFile).not.toHaveBeenCalled();
    });

    it('ignores suppressed files', () => {
      mockScopeService.isSuppressed.mockReturnValue(true);
      handlers['add']('/some/scopes/active/scope-2.md');
      expect(mockScopeService.updateFromFile).not.toHaveBeenCalled();
    });
  });

  // ─── change handler ─────────────────────────────────────────

  describe('change handler', () => {
    it('triggers updateFromFile on .md file change', () => {
      handlers['change']('/some/scopes/active/scope-3.md');
      expect(mockScopeService.updateFromFile).toHaveBeenCalledWith('/some/scopes/active/scope-3.md');
    });

    it('ignores non-.md file changes', () => {
      handlers['change']('/some/scopes/data.json');
      expect(mockScopeService.updateFromFile).not.toHaveBeenCalled();
    });
  });

  // ─── unlink handler ─────────────────────────────────────────

  describe('unlink handler', () => {
    it('triggers removeByFilePath on .md file removal', () => {
      handlers['unlink']('/some/scopes/active/scope-4.md');
      expect(mockScopeService.removeByFilePath).toHaveBeenCalledWith('/some/scopes/active/scope-4.md');
    });

    it('ignores non-.md file removals', () => {
      handlers['unlink']('/some/scopes/active/config.json');
      expect(mockScopeService.removeByFilePath).not.toHaveBeenCalled();
    });

    it('ignores suppressed file removals', () => {
      mockScopeService.isSuppressed.mockReturnValue(true);
      handlers['unlink']('/some/scopes/active/scope-5.md');
      expect(mockScopeService.removeByFilePath).not.toHaveBeenCalled();
    });
  });

  // ─── error handling ─────────────────────────────────────────

  describe('error handling', () => {
    it('registers an error handler', () => {
      const errorCall = mockWatcher.on.mock.calls.find((c: unknown[]) => c[0] === 'error');
      expect(errorCall).toBeDefined();
    });
  });

  // ═══════════════════════════════════════════════════════════
  // Wave 4: NEW TESTS below
  // ═══════════════════════════════════════════════════════════

  describe('change handler: suppression check', () => {
    it('ignores suppressed files on change', () => {
      mockScopeService.isSuppressed.mockReturnValue(true);
      handlers['change']('/some/scopes/active/suppressed.md');
      expect(mockScopeService.updateFromFile).not.toHaveBeenCalled();
    });
  });

  describe('add handler: error resilience', () => {
    it('does not crash when updateFromFile throws', () => {
      mockScopeService.updateFromFile.mockImplementation(() => {
        throw new Error('Parse error');
      });

      // Should not throw — the handler has a try/catch
      expect(() => handlers['add']('/some/scopes/active/broken.md')).not.toThrow();
    });
  });

  describe('change handler: error resilience', () => {
    it('does not crash when updateFromFile throws on change', () => {
      mockScopeService.updateFromFile.mockImplementation(() => {
        throw new Error('Parse error on change');
      });

      expect(() => handlers['change']('/some/scopes/active/broken.md')).not.toThrow();
    });
  });

  describe('unlink handler: error resilience', () => {
    it('does not crash when removeByFilePath throws', () => {
      mockScopeService.removeByFilePath.mockImplementation(() => {
        throw new Error('Remove error');
      });

      expect(() => handlers['unlink']('/some/scopes/active/broken.md')).not.toThrow();
    });
  });
});
