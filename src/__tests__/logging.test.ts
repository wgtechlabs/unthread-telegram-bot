/**
 * Unit tests for logging configuration
 */
import { beforeAll, describe, expect, it, mock } from 'bun:test';

// The `../config/logging` module invokes `LogEngine.configure(...)` at import
// time. Bun's ESM loader caches modules for the duration of the test process,
// so we must install the `@wgtechlabs/log-engine` mock BEFORE the first import
// of `../config/logging` and capture the call once.

const capturedCalls: unknown[][] = [];
const mockConfigure = mock((config: unknown) => {
  capturedCalls.push([config]);
});
const mockInfo = mock(() => {});
const mockError = mock(() => {});
const mockWarn = mock(() => {});
const mockDebug = mock(() => {});

mock.module('@wgtechlabs/log-engine', () => ({
  LogEngine: {
    configure: mockConfigure,
    info: mockInfo,
    error: mockError,
    warn: mockWarn,
    debug: mockDebug
  }
}));

// Import under test once — this triggers the `LogEngine.configure(...)` call.
let LogEngine: any;
let capturedConfig: any;

beforeAll(async () => {
  ({ LogEngine } = await import('../config/logging'));
  capturedConfig = capturedCalls[0]?.[0];
});

describe('logging configuration', () => {
  it('should export LogEngine', () => {
    expect(LogEngine).toBeDefined();
    expect(typeof LogEngine).toBe('object');
    expect(typeof LogEngine.configure).toBe('function');
  });

  it('should configure LogEngine with correct format settings', () => {
    expect(mockConfigure).toHaveBeenCalledTimes(1);
    expect(mockConfigure).toHaveBeenCalledWith({
      format: {
        includeIsoTimestamp: false,
        includeLocalTime: true
      }
    });
  });

  it('should configure logging before any other usage', () => {
    // configure must have been called before any other logging method
    expect(mockConfigure).toHaveBeenCalledTimes(1);
    // No other logging methods should have been invoked during module load
    expect(mockInfo).not.toHaveBeenCalled();
    expect(mockError).not.toHaveBeenCalled();
    expect(mockDebug).not.toHaveBeenCalled();
  });

  it('should disable ISO timestamp and enable local time', () => {
    expect(capturedConfig).not.toBeNull();
    expect(capturedConfig.format.includeIsoTimestamp).toBe(false);
    expect(capturedConfig.format.includeLocalTime).toBe(true);
  });

  it('should be idempotent when imported multiple times', async () => {
    // Re-importing the module must not trigger a second configure() call
    await import('../config/logging');
    await import('../config/logging');
    expect(mockConfigure).toHaveBeenCalledTimes(1);
  });

  it('should maintain LogEngine interface after configuration', () => {
    expect(LogEngine.configure).toBeDefined();
    expect(LogEngine.info).toBeDefined();
    expect(LogEngine.error).toBeDefined();
    expect(LogEngine.warn).toBeDefined();
    expect(LogEngine.debug).toBeDefined();
  });

  it('should configure format settings correctly for timezone handling', () => {
    expect(capturedConfig).toHaveProperty('format');
    expect(typeof capturedConfig.format).toBe('object');
    expect(capturedConfig.format.includeLocalTime).toBe(true);
    expect(capturedConfig.format.includeIsoTimestamp).toBe(false);
  });

  it('should handle configuration without errors', () => {
    // The original test asserted importing the module did not throw.
    // Since the `beforeAll` hook succeeded, the import did not throw.
    expect(LogEngine).toBeDefined();
  });

  describe('configuration object structure', () => {
    it('should have correct configuration structure', () => {
      expect(capturedConfig).toHaveProperty('format');
      expect(capturedConfig.format).toHaveProperty('includeIsoTimestamp');
      expect(capturedConfig.format).toHaveProperty('includeLocalTime');
      expect(typeof capturedConfig.format.includeIsoTimestamp).toBe('boolean');
      expect(typeof capturedConfig.format.includeLocalTime).toBe('boolean');
    });

    it('should use boolean values for format options', () => {
      expect(typeof capturedConfig.format.includeIsoTimestamp).toBe('boolean');
      expect(typeof capturedConfig.format.includeLocalTime).toBe('boolean');
    });

    it('should not include unnecessary configuration options', () => {
      // Should only have format property
      expect(Object.keys(capturedConfig)).toEqual(['format']);

      // Format should only have the two specific properties
      const formatKeys = Object.keys(capturedConfig.format);
      expect(formatKeys).toHaveLength(2);
      expect(formatKeys).toContain('includeIsoTimestamp');
      expect(formatKeys).toContain('includeLocalTime');
    });
  });
});
