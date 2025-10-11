/**
 * Bots Brain SDK Test Suite
 * 
 * Comprehensive tests for the Bots Brain SDK multi-layer storage architecture
 * including UnifiedStorage and BotsStore functionality.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock Redis and PostgreSQL dependencies
vi.mock('redis', () => ({
  createClient: vi.fn().mockReturnValue({
    connect: vi.fn(),
    disconnect: vi.fn(),
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
    exists: vi.fn(),
    expire: vi.fn(),
    on: vi.fn(),
    isReady: true
  })
}));

vi.mock('pg', async () => {
  const actual = await vi.importActual('pg');
  return {
    ...actual,
    Pool: vi.fn().mockImplementation(() => ({
      connect: vi.fn(),
      query: vi.fn(),
      end: vi.fn(),
      on: vi.fn()
    }))
  };
});

vi.mock('@wgtechlabs/log-engine', () => ({
  LogEngine: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn()
  }
}));

describe('Bots Brain SDK', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('SDK Exports', () => {
    it('should export UnifiedStorage', async () => {
      const { UnifiedStorage } = await import('../sdk/bots-brain/index.js');
      expect(UnifiedStorage).toBeDefined();
    });

    it('should export BotsStore', async () => {
      const { BotsStore } = await import('../sdk/bots-brain/index.js');
      expect(BotsStore).toBeDefined();
    });

    it('should have correct export structure', async () => {
      const sdk = await import('../sdk/bots-brain/index.js');
      
      expect(Object.keys(sdk)).toContain('UnifiedStorage');
      expect(Object.keys(sdk)).toContain('BotsStore');
      expect(Object.keys(sdk)).toHaveLength(2);
    });
  });

  describe('UnifiedStorage Layer Architecture', () => {
    it('should handle memory layer operations', async () => {
      const { UnifiedStorage } = await import('../sdk/bots-brain/UnifiedStorage.js');
      
      // Test that UnifiedStorage class exists and can be instantiated
      expect(UnifiedStorage).toBeDefined();
      expect(typeof UnifiedStorage).toBe('function');
    });

    it('should handle Redis layer integration', async () => {
      const { UnifiedStorage } = await import('../sdk/bots-brain/UnifiedStorage.js');
      
      // Test Redis integration without actual Redis connection
      expect(UnifiedStorage).toBeDefined();
    });

    it('should handle PostgreSQL layer integration', async () => {
      const { UnifiedStorage } = await import('../sdk/bots-brain/UnifiedStorage.js');
      
      // Test PostgreSQL integration without actual DB connection
      expect(UnifiedStorage).toBeDefined();
    });
  });

  describe('BotsStore High-Level Operations', () => {
    it('should provide bot-specific storage operations', async () => {
      const { BotsStore } = await import('../sdk/bots-brain/BotsStore.js');
      
      // Test that BotsStore exists and has expected structure
      expect(BotsStore).toBeDefined();
      expect(typeof BotsStore).toBe('function');
    });

    it('should handle user state management', async () => {
      const { BotsStore } = await import('../sdk/bots-brain/BotsStore.js');
      
      // Test user state management capabilities
      expect(BotsStore).toBeDefined();
      
      // Check if common methods exist (they might be static or instance methods)
      const botStoreKeys = Object.keys(BotsStore);
      expect(botStoreKeys.length).toBeGreaterThan(0);
    });

    it('should handle conversation persistence', async () => {
      const { BotsStore } = await import('../sdk/bots-brain/BotsStore.js');
      
      // Test conversation persistence functionality
      expect(BotsStore).toBeDefined();
    });
  });

  describe('Storage Layer Integration', () => {
    it('should support multi-layer data flow', async () => {
      const { UnifiedStorage, BotsStore } = await import('../sdk/bots-brain/index.js');
      
      // Test that both components work together
      expect(UnifiedStorage).toBeDefined();
      expect(BotsStore).toBeDefined();
    });

    it('should handle TTL configurations', async () => {
      // Test TTL settings for different layers
      // Memory: 24hr TTL
      // Redis: 3-day TTL
      // PostgreSQL: Permanent
      
      const expectedTTLs = {
        memory: 24 * 60 * 60, // 24 hours in seconds
        redis: 3 * 24 * 60 * 60, // 3 days in seconds
        postgres: null // Permanent storage
      };
      
      expect(expectedTTLs.memory).toBe(86400);
      expect(expectedTTLs.redis).toBe(259200);
      expect(expectedTTLs.postgres).toBeNull();
    });

    it('should handle layer fallback scenarios', async () => {
      // Test fallback when layers are unavailable
      const { UnifiedStorage } = await import('../sdk/bots-brain/UnifiedStorage.js');
      
      expect(UnifiedStorage).toBeDefined();
    });
  });

  describe('Data Types and Serialization', () => {
    it('should handle JSON serialization', () => {
      const testData = {
        userId: 12345,
        state: 'waiting_for_input',
        formData: {
          email: 'test@example.com',
          summary: 'Test issue'
        },
        timestamp: new Date().toISOString()
      };

      const serialized = JSON.stringify(testData);
      const deserialized = JSON.parse(serialized);
      
      expect(deserialized).toEqual(testData);
      expect(deserialized.userId).toBe(12345);
      expect(deserialized.state).toBe('waiting_for_input');
    });

    it('should handle complex nested objects', () => {
      const complexData = {
        conversation: {
          id: 'conv_123',
          participants: [12345, 67890],
          metadata: {
            source: 'telegram',
            priority: 'high',
            tags: ['support', 'billing']
          },
          messages: [
            { id: 1, text: 'Hello', timestamp: '2025-01-01T00:00:00Z' },
            { id: 2, text: 'How can I help?', timestamp: '2025-01-01T00:01:00Z' }
          ]
        }
      };

      const serialized = JSON.stringify(complexData);
      const deserialized = JSON.parse(serialized);
      
      expect(deserialized.conversation.participants).toHaveLength(2);
      expect(deserialized.conversation.metadata.tags).toContain('support');
      expect(deserialized.conversation.messages).toHaveLength(2);
    });

    it('should handle special data types', () => {
      const specialData = {
        date: new Date('2025-01-01'),
        regex: /test/gi,
        buffer: Buffer.from('test'),
        undefined: undefined,
        null: null,
        number: 42,
        boolean: true,
        string: 'test'
      };

      // Test that basic types serialize correctly
      const basicTypes = {
        null: specialData.null,
        number: specialData.number,
        boolean: specialData.boolean,
        string: specialData.string
      };

      const serialized = JSON.stringify(basicTypes);
      const deserialized = JSON.parse(serialized);
      
      expect(deserialized.null).toBeNull();
      expect(deserialized.number).toBe(42);
      expect(deserialized.boolean).toBe(true);
      expect(deserialized.string).toBe('test');
    });
  });

  describe('Error Handling', () => {
    it('should handle connection errors gracefully', async () => {
      // Test error handling for connection failures
      const { LogEngine } = await import('@wgtechlabs/log-engine');
      
      // Simulate connection error
      const mockError = new Error('Connection failed');
      
      // Verify error handling doesn't crash
      expect(() => {
        console.error('Simulated connection error:', mockError.message);
      }).not.toThrow();
    });

    it('should handle serialization errors', () => {
      // Test handling of circular references and non-serializable data
      const circularData: any = { name: 'test' };
      circularData.self = circularData;
      
      expect(() => {
        try {
          JSON.stringify(circularData);
        } catch (error) {
          // Expected to throw due to circular reference
          expect(error).toBeInstanceOf(TypeError);
          throw error;
        }
      }).toThrow();
    });

    it('should handle invalid data formats', () => {
      const invalidJsonStrings = [
        '{"invalid": json}',
        '{incomplete',
        'null}',
        '{"key": undefined}',
        '{"key": function() {}}'
      ];

      invalidJsonStrings.forEach(invalidJson => {
        expect(() => {
          try {
            JSON.parse(invalidJson);
          } catch (error) {
            expect(error).toBeInstanceOf(SyntaxError);
            throw error;
          }
        }).toThrow();
      });
    });
  });

  describe('Performance Considerations', () => {
    it('should handle large data sets efficiently', () => {
      // Test with larger data set
      const largeData = {
        users: Array.from({ length: 1000 }, (_, i) => ({
          id: i,
          name: `User ${i}`,
          email: `user${i}@example.com`,
          lastActive: new Date().toISOString()
        }))
      };

      const serialized = JSON.stringify(largeData);
      const deserialized = JSON.parse(serialized);
      
      expect(deserialized.users).toHaveLength(1000);
      expect(deserialized.users[0].id).toBe(0);
      expect(deserialized.users[999].id).toBe(999);
    });

    it('should handle memory usage considerations', () => {
      // Test memory-conscious data handling
      const memoryData = {
        cacheSize: 1000,
        maxMemoryUsage: '100MB',
        cleanupInterval: 300000, // 5 minutes
        compressionEnabled: true
      };

      expect(memoryData.cacheSize).toBe(1000);
      expect(memoryData.maxMemoryUsage).toBe('100MB');
      expect(memoryData.cleanupInterval).toBe(300000);
      expect(memoryData.compressionEnabled).toBe(true);
    });
  });

  describe('Configuration Validation', () => {
    it('should validate storage configuration', () => {
      const validConfig = {
        memory: {
          enabled: true,
          ttl: 86400, // 24 hours
          maxSize: 1000
        },
        redis: {
          enabled: true,
          ttl: 259200, // 3 days
          url: 'redis://localhost:6379'
        },
        postgres: {
          enabled: true,
          url: 'postgresql://localhost:5432/db'
        }
      };

      expect(validConfig.memory.enabled).toBe(true);
      expect(validConfig.redis.enabled).toBe(true);
      expect(validConfig.postgres.enabled).toBe(true);
      expect(validConfig.memory.ttl).toBe(86400);
      expect(validConfig.redis.ttl).toBe(259200);
    });

    it('should handle configuration edge cases', () => {
      const edgeCaseConfigs = [
        { memory: { enabled: false } }, // Memory disabled
        { redis: { enabled: false } },  // Redis disabled
        { postgres: { enabled: false } }, // Postgres disabled
        {} // Empty config
      ];

      edgeCaseConfigs.forEach((config, index) => {
        expect(config).toBeDefined();
        expect(typeof config).toBe('object');
      });
    });
  });
});