/**
 * Unit tests for logging configuration
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('logging configuration', () => {
  beforeEach(() => {
    // Clear any modules from cache to test import behavior
    vi.resetModules();
  });

  it('should export LogEngine', async () => {
    const { LogEngine } = await import('../config/logging');
    
    expect(LogEngine).toBeDefined();
    expect(typeof LogEngine).toBe('object');
    expect(typeof LogEngine.configure).toBe('function');
  });

  it('should configure LogEngine with correct format settings', async () => {
    // Mock LogEngine.configure to capture calls
    const mockConfigure = vi.fn();
    
    vi.doMock('@wgtechlabs/log-engine', () => ({
      LogEngine: {
        configure: mockConfigure
      }
    }));

    // Import the module to trigger configuration
    await import('../config/logging');

    expect(mockConfigure).toHaveBeenCalledTimes(1);
    expect(mockConfigure).toHaveBeenCalledWith({
      format: {
        includeIsoTimestamp: false,
        includeLocalTime: true
      }
    });
  });

  it('should configure logging before any other usage', async () => {
    const configureOrder: string[] = [];
    
    const mockConfigure = vi.fn().mockImplementation(() => {
      configureOrder.push('configure');
    });
    
    const mockOtherMethod = vi.fn().mockImplementation(() => {
      configureOrder.push('otherMethod');
    });

    vi.doMock('@wgtechlabs/log-engine', () => ({
      LogEngine: {
        configure: mockConfigure,
        info: mockOtherMethod,
        error: mockOtherMethod,
        debug: mockOtherMethod
      }
    }));

    // Import the module
    const { LogEngine } = await import('../config/logging');
    
    // Use other methods
    if (LogEngine.info) LogEngine.info('test');
    if (LogEngine.error) LogEngine.error('test');

    expect(configureOrder[0]).toBe('configure');
  });

  it('should disable ISO timestamp and enable local time', async () => {
    let capturedConfig: any = null;
    
    const mockConfigure = vi.fn().mockImplementation((config) => {
      capturedConfig = config;
    });

    vi.doMock('@wgtechlabs/log-engine', () => ({
      LogEngine: {
        configure: mockConfigure
      }
    }));

    await import('../config/logging');

    expect(capturedConfig).not.toBeNull();
    expect(capturedConfig.format.includeIsoTimestamp).toBe(false);
    expect(capturedConfig.format.includeLocalTime).toBe(true);
  });

  it('should be idempotent when imported multiple times', async () => {
    const mockConfigure = vi.fn();
    
    vi.doMock('@wgtechlabs/log-engine', () => ({
      LogEngine: {
        configure: mockConfigure
      }
    }));

    // Import multiple times
    await import('../config/logging');
    await import('../config/logging');
    await import('../config/logging');

    // Should only configure once due to module caching
    expect(mockConfigure).toHaveBeenCalledTimes(1);
  });

  it('should maintain LogEngine interface after configuration', async () => {
    const mockLogEngine = {
      configure: vi.fn(),
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn()
    };

    vi.doMock('@wgtechlabs/log-engine', () => ({
      LogEngine: mockLogEngine
    }));

    const { LogEngine } = await import('../config/logging');

    // Should maintain all expected methods
    expect(LogEngine.configure).toBeDefined();
    expect(LogEngine.info).toBeDefined();
    expect(LogEngine.error).toBeDefined();
    expect(LogEngine.warn).toBeDefined();
    expect(LogEngine.debug).toBeDefined();
  });

  it('should configure format settings correctly for timezone handling', async () => {
    const mockConfigure = vi.fn();
    
    vi.doMock('@wgtechlabs/log-engine', () => ({
      LogEngine: {
        configure: mockConfigure
      }
    }));

    await import('../config/logging');

    const configArg = mockConfigure.mock.calls[0][0];
    
    // Should have format object
    expect(configArg).toHaveProperty('format');
    expect(typeof configArg.format).toBe('object');
    
    // Should configure for local timezone
    expect(configArg.format.includeLocalTime).toBe(true);
    
    // Should disable ISO timestamp to avoid timezone confusion
    expect(configArg.format.includeIsoTimestamp).toBe(false);
  });

  it('should handle configuration without errors', async () => {
    const mockConfigure = vi.fn();
    
    vi.doMock('@wgtechlabs/log-engine', () => ({
      LogEngine: {
        configure: mockConfigure
      }
    }));

    await expect(async () => {
      await import('../config/logging');
    }).not.toThrow();
  });

  describe('configuration object structure', () => {
    it('should have correct configuration structure', async () => {
      let config: any = null;
      
      const mockConfigure = vi.fn().mockImplementation((c) => {
        config = c;
      });

      vi.doMock('@wgtechlabs/log-engine', () => ({
        LogEngine: {
          configure: mockConfigure
        }
      }));

      await import('../config/logging');

      expect(config).toMatchObject({
        format: {
          includeIsoTimestamp: expect.any(Boolean),
          includeLocalTime: expect.any(Boolean)
        }
      });
    });

    it('should use boolean values for format options', async () => {
      let config: any = null;
      
      const mockConfigure = vi.fn().mockImplementation((c) => {
        config = c;
      });

      vi.doMock('@wgtechlabs/log-engine', () => ({
        LogEngine: {
          configure: mockConfigure
        }
      }));

      await import('../config/logging');

      expect(typeof config.format.includeIsoTimestamp).toBe('boolean');
      expect(typeof config.format.includeLocalTime).toBe('boolean');
    });

    it('should not include unnecessary configuration options', async () => {
      let config: any = null;
      
      const mockConfigure = vi.fn().mockImplementation((c) => {
        config = c;
      });

      vi.doMock('@wgtechlabs/log-engine', () => ({
        LogEngine: {
          configure: mockConfigure
        }
      }));

      await import('../config/logging');

      // Should only have format property
      expect(Object.keys(config)).toEqual(['format']);
      
      // Format should only have the two specific properties
      const formatKeys = Object.keys(config.format);
      expect(formatKeys).toHaveLength(2);
      expect(formatKeys).toContain('includeIsoTimestamp');
      expect(formatKeys).toContain('includeLocalTime');
    });
  });
});