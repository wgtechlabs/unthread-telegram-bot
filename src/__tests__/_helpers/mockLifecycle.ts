/**
 * Test setup helpers for migrating from Vitest to bun:test.
 *
 * Bun's `mock.restore()` does NOT restore the original implementation passed
 * to `mock(impl)`, while Vitest's `vi.restoreAllMocks()` does. This helper
 * provides Vitest-compatible mock lifecycle management by snapshotting the
 * original implementation of every mock created through `createMock` and
 * exposing `restoreAllMocks()` / `clearAllMocks()` that work on those mocks.
 */
import { mock as bunMock } from 'bun:test';

type AnyFn = (..._args: any[]) => any;
type BunMockFn = ReturnType<typeof bunMock>;

const registry: Array<{ fn: BunMockFn; original: AnyFn | undefined }> = [];

/**
 * Create a Bun mock function whose original implementation can later be
 * restored by `restoreAllMocks()`.
 */
export function createMock<T extends AnyFn>(impl?: T): BunMockFn {
  const fn = (impl ? bunMock(impl) : bunMock()) as BunMockFn;
  registry.push({ fn, original: impl });
  return fn;
}

/**
 * Restore every mock created with `createMock` back to its original
 * implementation, then call Bun's own `mock.restore()` for any spies and
 * `mock.clearAllMocks()` so that bare `mock()` instances also have their
 * call history cleared (matches Vitest's `restoreAllMocks`).
 */
export function restoreAllMocks(): void {
  for (const { fn, original } of registry) {
    const m = fn as unknown as {
      mockReset?: () => void;
      mockImplementation?: (_impl: AnyFn) => unknown;
      mockClear?: () => void;
    };
    if (typeof m.mockReset === 'function') {
      m.mockReset();
    }
    if (original && typeof m.mockImplementation === 'function') {
      m.mockImplementation(original);
    } else if (typeof m.mockClear === 'function') {
      m.mockClear();
    }
  }
  bunMock.restore();
  bunMock.clearAllMocks();
}

/**
 * Clear call history on every registered mock.
 */
export function clearAllMocks(): void {
  for (const { fn } of registry) {
    const m = fn as unknown as { mockClear?: () => void };
    if (typeof m.mockClear === 'function') {
      m.mockClear();
    }
  }
  bunMock.clearAllMocks();
}
