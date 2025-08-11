/**
 * SDK Types Test Suite
 * 
 * Tests for the SDK type definitions and interfaces to ensure
 * type safety and proper structure definitions.
 */

import { describe, it, expect } from 'vitest';
import type { 
    DatabaseConnection, 
    StorageConfig, 
    Storage
} from '../sdk/types.js';

describe('SDK types', () => {
    describe('DatabaseConnection interface', () => {
        it('should define the correct structure', () => {
            // This test validates the type structure exists and is importable
            const mockConnection: Partial<DatabaseConnection> = {
                query: async (text: string, params?: unknown[]) => {
                    expect(typeof text).toBe('string');
                    expect(Array.isArray(params) || params === undefined).toBe(true);
                    return {};
                }
            };

            expect(typeof mockConnection.query).toBe('function');
        });

        it('should support query method with text parameter', async () => {
            const mockConnection: DatabaseConnection = {
                connectionPool: {} as any,
                query: async (text: string) => {
                    expect(text).toBe('SELECT * FROM users');
                    return { rows: [] };
                }
            };

            await mockConnection.query('SELECT * FROM users');
        });

        it('should support query method with params', async () => {
            const mockConnection: DatabaseConnection = {
                connectionPool: {} as any,
                query: async (text: string, params?: unknown[]) => {
                    expect(text).toBe('SELECT * FROM users WHERE id = $1');
                    expect(params).toEqual([123]);
                    return { rows: [] };
                }
            };

            await mockConnection.query('SELECT * FROM users WHERE id = $1', [123]);
        });
    });

    describe('StorageConfig interface', () => {
        it('should allow empty configuration', () => {
            const config: StorageConfig = {};
            
            expect(config.postgres).toBeUndefined();
            expect(config.redisUrl).toBeUndefined();
        });

        it('should allow postgres configuration', () => {
            const config: StorageConfig = {
                postgres: {} as any
            };
            
            expect(config.postgres).toBeDefined();
            expect(config.redisUrl).toBeUndefined();
        });

        it('should allow redis configuration', () => {
            const config: StorageConfig = {
                redisUrl: 'redis://localhost:6379'
            };
            
            expect(config.redisUrl).toBe('redis://localhost:6379');
            expect(config.postgres).toBeUndefined();
        });

        it('should allow both postgres and redis configuration', () => {
            const config: StorageConfig = {
                postgres: {} as any,
                redisUrl: 'redis://localhost:6379'
            };
            
            expect(config.postgres).toBeDefined();
            expect(config.redisUrl).toBe('redis://localhost:6379');
        });

        it('should allow undefined redis URL', () => {
            const config: StorageConfig = {
                redisUrl: undefined
            };
            
            expect(config.redisUrl).toBeUndefined();
        });
    });

    describe('Storage interface', () => {
        it('should define get method correctly', async () => {
            const mockStorage: Storage = {
                get: async (key: string) => {
                    expect(typeof key).toBe('string');
                    return `value for ${key}`;
                },
                set: async () => {},
                delete: async () => {},
                exists: async () => false,
                keys: async () => [],
                clear: async () => {},
                close: async () => {}
            };

            const result = await mockStorage.get('test-key');
            expect(result).toBe('value for test-key');
        });

        it('should define set method with TTL', async () => {
            let storedKey: string | undefined;
            let storedValue: unknown;
            let storedTtl: number | undefined;

            const mockStorage: Storage = {
                get: async () => null,
                set: async (key: string, value: unknown, ttl?: number) => {
                    storedKey = key;
                    storedValue = value;
                    storedTtl = ttl;
                },
                delete: async () => {},
                exists: async () => false,
                keys: async () => [],
                clear: async () => {},
                close: async () => {}
            };

            await mockStorage.set('test-key', { data: 'value' }, 3600);
            
            expect(storedKey).toBe('test-key');
            expect(storedValue).toEqual({ data: 'value' });
            expect(storedTtl).toBe(3600);
        });

        it('should define set method without TTL', async () => {
            let storedTtl: number | undefined = 999; // Set to non-undefined to test it gets cleared

            const mockStorage: Storage = {
                get: async () => null,
                set: async (key: string, value: unknown, ttl?: number) => {
                    storedTtl = ttl;
                },
                delete: async () => {},
                exists: async () => false,
                keys: async () => [],
                clear: async () => {},
                close: async () => {}
            };

            await mockStorage.set('test-key', 'value');
            
            expect(storedTtl).toBeUndefined();
        });

        it('should support all required methods', () => {
            const mockStorage: Storage = {
                get: async () => null,
                set: async () => {},
                delete: async () => {},
                exists: async () => false,
                keys: async () => [],
                clear: async () => {},
                close: async () => {}
            };

            expect(typeof mockStorage.get).toBe('function');
            expect(typeof mockStorage.set).toBe('function');
            expect(typeof mockStorage.delete).toBe('function');
            expect(typeof mockStorage.exists).toBe('function');
            expect(typeof mockStorage.keys).toBe('function');
            expect(typeof mockStorage.clear).toBe('function');
            expect(typeof mockStorage.close).toBe('function');
        });

        it('should handle complex data types', async () => {
            const complexData = {
                user: { id: 123, name: 'Test' },
                messages: ['hello', 'world'],
                metadata: { timestamp: Date.now() }
            };

            const mockStorage: Storage = {
                get: async (key: string) => {
                    if (key === 'complex-data') return complexData;
                    return null;
                },
                set: async () => {},
                delete: async () => {},
                exists: async () => false,
                keys: async () => [],
                clear: async () => {},
                close: async () => {}
            };

            const result = await mockStorage.get('complex-data');
            expect(result).toEqual(complexData);
        });
    });
});