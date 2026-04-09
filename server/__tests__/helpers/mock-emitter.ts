import { vi } from 'vitest';
import type { Emitter } from '../../project-emitter.js';

/**
 * Create a mock ProjectEmitter for testing services.
 * Services only call emit(), so that's all we mock.
 */
export function createMockEmitter(): Emitter & { emit: ReturnType<typeof vi.fn> } {
  return { emit: vi.fn().mockReturnValue(true) } as unknown as Emitter & { emit: ReturnType<typeof vi.fn> };
}
