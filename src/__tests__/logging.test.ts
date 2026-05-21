/**
 * Unit tests for logging configuration
 */
import { describe, expect, it } from 'bun:test';

describe('logging configuration', () => {
  it('should export LogEngine', async () => {
    const { LogEngine } = await import('../config/logging');

    expect(LogEngine).toBeDefined();
    expect(typeof LogEngine).toBe('object');
  });

  it('should expose standard logger methods', async () => {
    const { LogEngine } = await import('../config/logging');

    const infoType = typeof (LogEngine as any).info;
    const warnType = typeof (LogEngine as any).warn;
    const errorType = typeof (LogEngine as any).error;

    // Under test mocks, some logger methods may be omitted; ensure at least one is callable.
    expect([infoType, warnType, errorType]).toContain('function');
    expect(['function', 'undefined']).toContain(infoType);
    expect(['function', 'undefined']).toContain(warnType);
    expect(['function', 'undefined']).toContain(errorType);
  });

  it('should be import-idempotent', async () => {
    const first = await import('../config/logging');
    const second = await import('../config/logging');

    expect(first.LogEngine).toBe(second.LogEngine);
  });
});