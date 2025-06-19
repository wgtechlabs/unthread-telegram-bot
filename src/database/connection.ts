/**
 * Database Connection Module
 * 
 * Provides PostgreSQL database connection with SSL support for Railway
 * and other cloud providers that require secure connections.
 * 
 * Security Features:
 * - SSL certificate validation enabled by default in production
 * - Configurable SSL validation for development environments
 * - Support for custom CA certificates via DATABASE_SSL_CA environment variable
 * - Environment-aware SSL configuration to prevent MITM attacks
 */

import pkg from 'pg';
const { Pool } = pkg;
import type { Pool as PoolType, PoolClient, QueryResult } from 'pg';
import { LogEngine } from '@wgtechlabs/log-engine';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Database Connection Class
 * 
 * Handles PostgreSQL connections with SSL support and connection pooling
 */
export class DatabaseConnection {
    private pool: PoolType;

    constructor() {
        // Validate required environment variable
        if (!process.env.POSTGRES_URL) {
            const error = 'POSTGRES_URL environment variable is required but not defined';
            LogEngine.error(error);
            throw new Error(error);
        }

        // Configure SSL based on environment
        const isProduction = process.env.NODE_ENV === 'production';
        const sslConfig = this.getSSLConfig(isProduction);

        // Configure connection pool with SSL for Railway
        this.pool = new Pool({
            connectionString: process.env.POSTGRES_URL,
            ssl: sslConfig,
            max: 10, // Maximum number of connections in pool
            idleTimeoutMillis: 30000, // Close idle connections after 30 seconds
            connectionTimeoutMillis: 10000, // Return error after 10 seconds if connection cannot be established
        });

        // Handle pool errors
        this.pool.on('error', (err: Error) => {
            LogEngine.error('Unexpected error on idle client', {
                error: err.message,
                stack: err.stack
            });
        });

        LogEngine.info('Database connection pool initialized', {
            maxConnections: 10,
            sslEnabled: true,
            sslValidation: isProduction ? 'enabled' : (process.env.DATABASE_SSL_VALIDATE === 'true' ? 'enabled' : 'disabled'),
            environment: process.env.NODE_ENV || 'development',
            provider: 'Railway'
        });
    }

    /**
     * Get the database connection pool
     * @returns The PostgreSQL connection pool
     */
    get connectionPool(): PoolType {
        return this.pool;
    }

    /**
     * Execute a database query
     * 
     * @param text - SQL query string
     * @param params - Query parameters
     * @returns Query result
     */
    async query(text: string, params: any[] = []): Promise<QueryResult<any>> {
        const client: PoolClient = await this.pool.connect();
        try {
            const start = Date.now();
            const result = await client.query(text, params);
            const duration = Date.now() - start;
            
            LogEngine.debug('Database query executed', {
                query: text.substring(0, 100) + (text.length > 100 ? '...' : ''),
                paramCount: params.length,
                rowCount: result.rowCount,
                duration: `${duration}ms`
            });
            
            return result;
        } catch (error) {
            const err = error as Error;
            LogEngine.error('Database query error', {
                error: err.message,
                query: text.substring(0, 100) + (text.length > 100 ? '...' : ''),
                paramCount: params.length,
                stack: err.stack
            });
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Test database connection and create schema if needed
     */
    async connect(): Promise<void> {
        try {
            // Test connection
            const result = await this.query('SELECT NOW() as current_time');
            LogEngine.info('Database connection established', {
                currentTime: result.rows[0]?.current_time,
                ssl: 'enabled'
            });

            // Check if we need to run schema setup
            await this.ensureSchema();
            
        } catch (error) {
            const err = error as Error;
            LogEngine.error('Failed to connect to database', {
                error: err.message,
                stack: err.stack,
                postgresUrl: process.env.POSTGRES_URL ? 'configured' : 'missing'
            });
            throw error;
        }
    }

    /**
     * Ensure database schema exists (Alpha version - auto-setup always)
     */
    async ensureSchema(): Promise<void> {
        try {
            // Check if tables exist
            const tableCheck = await this.query(`
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name IN ('customers', 'tickets', 'user_states', 'storage_cache')
            `);

            const requiredTables = ['customers', 'tickets', 'user_states'];
            const foundTables = tableCheck.rows.map((row: any) => row.table_name);
            const missingTables = requiredTables.filter(table => !foundTables.includes(table));

            if (missingTables.length > 0) {
                LogEngine.info('Database tables missing - setting up automatically...', {
                    missing: missingTables
                });
                await this.initializeSchema();
            } else {
                LogEngine.info('Database schema verified', {
                    tablesFound: foundTables,
                    botsBrainReady: foundTables.includes('storage_cache')
                });
            }
        } catch (error) {
            const err = error as Error;
            LogEngine.error('Error checking database schema', {
                error: err.message,
                stack: err.stack
            });
            throw error;
        }
    }

    /**
     * Initialize database schema from schema.sql file
     */
    async initializeSchema(): Promise<void> {
        try {
            LogEngine.info('Starting database schema initialization...');

            const schemaPath = path.join(__dirname, 'schema.sql');
            
            // Check if schema file exists asynchronously
            try {
                await fs.promises.access(schemaPath, fs.constants.F_OK);
            } catch (accessError) {
                throw new Error(`Schema file not found: ${schemaPath}`);
            }

            // Read schema file asynchronously
            const schema = await fs.promises.readFile(schemaPath, 'utf8');
            LogEngine.debug('Schema file loaded', { 
                path: schemaPath, 
                size: schema.length 
            });

            // Execute schema
            await this.query(schema);
            LogEngine.info('Database schema created successfully');

        } catch (error) {
            const err = error as Error;
            LogEngine.error('Failed to initialize database schema', {
                error: err.message,
                stack: err.stack
            });
            throw error;
        }
    }

    /**
     * Close all connections in the pool
     */
    async close(): Promise<void> {
        try {
            await this.pool.end();
            LogEngine.info('Database connection pool closed');
        } catch (error) {
            const err = error as Error;
            LogEngine.error('Error closing database pool', {
                error: err.message,
                stack: err.stack
            });
            throw error;
        }
    }

    /**
     * Configure SSL settings based on environment
     * @param isProduction - Whether running in production environment
     * @returns SSL configuration object
     */
    private getSSLConfig(isProduction: boolean): any {
        // In production, always validate SSL certificates for security
        if (isProduction) {
            return {
                rejectUnauthorized: true,
                // Allow custom CA certificate if provided
                ca: process.env.DATABASE_SSL_CA || undefined
            };
        }

        // In development, allow flexibility for local development
        // Check if explicit SSL validation is requested via environment variable
        const forceSSLValidation = process.env.DATABASE_SSL_VALIDATE === 'true';
        
        return {
            rejectUnauthorized: forceSSLValidation,
            ca: process.env.DATABASE_SSL_CA || undefined
        };
    }
}

// Create and export a singleton instance
export const db = new DatabaseConnection();
