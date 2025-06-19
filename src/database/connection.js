/**
 * Database Connection Module
 * 
 * Provides PostgreSQL database connection with SSL support for Railway
 * and other cloud providers that require secure connections.
 */

import pkg from 'pg';
const { Pool } = pkg;
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
    constructor() {
        // Validate required environment variable
        if (!process.env.POSTGRES_URL) {
            const error = 'POSTGRES_URL environment variable is required but not defined';
            LogEngine.error(error);
            throw new Error(error);
        }

        // Configure connection pool with SSL for Railway
        this.pool = new Pool({
            connectionString: process.env.POSTGRES_URL,
            ssl: {
                rejectUnauthorized: false // Required for Railway and most cloud providers
            },
            max: 10, // Maximum number of connections in pool
            idleTimeoutMillis: 30000, // Close idle connections after 30 seconds
            connectionTimeoutMillis: 10000, // Return error after 10 seconds if connection cannot be established
        });

        // Handle pool errors
        this.pool.on('error', (err) => {
            LogEngine.error('Unexpected error on idle client', {
                error: err.message,
                stack: err.stack
            });
        });

        LogEngine.info('Database connection pool initialized', {
            maxConnections: 10,
            sslEnabled: true,
            provider: 'Railway'
        });
    }

    /**
     * Execute a database query
     * 
     * @param {string} text - SQL query string
     * @param {Array} params - Query parameters
     * @returns {Promise<object>} Query result
     */
    async query(text, params = []) {
        const client = await this.pool.connect();
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
            LogEngine.error('Database query error', {
                error: error.message,
                query: text.substring(0, 100) + (text.length > 100 ? '...' : ''),
                paramCount: params.length,
                stack: error.stack
            });
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Test database connection and create schema if needed
     * 
     * @returns {Promise<void>}
     */
    async connect() {
        try {
            // Test connection
            const result = await this.query('SELECT NOW() as current_time');
            LogEngine.info('Database connection established', {
                currentTime: result.rows[0].current_time,
                ssl: 'enabled'
            });

            // Check if we need to run schema setup
            await this.ensureSchema();
            
        } catch (error) {
            LogEngine.error('Failed to connect to database', {
                error: error.message,
                stack: error.stack,
                postgresUrl: process.env.POSTGRES_URL ? 'configured' : 'missing'
            });
            throw error;
        }
    }

    /**
     * Ensure database schema exists (Alpha version - auto-setup always)
     * 
     * @returns {Promise<void>}
     */
    async ensureSchema() {
        try {
            // Check if tables exist
            const tableCheck = await this.query(`
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name IN ('customers', 'tickets', 'user_states', 'storage_cache')
            `);

            const requiredTables = ['customers', 'tickets', 'user_states'];
            const foundTables = tableCheck.rows.map(row => row.table_name);
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
            LogEngine.error('Error checking database schema', {
                error: error.message,
                stack: error.stack
            });
            throw error;
        }
    }

    /**
     * Initialize database schema from schema.sql file
     * 
     * @returns {Promise<void>}
     */
    async initializeSchema() {
        try {
            LogEngine.info('Starting database schema initialization...');

            const schemaPath = path.join(__dirname, 'schema.sql');
            
            // Check if schema file exists
            if (!fs.existsSync(schemaPath)) {
                throw new Error(`Schema file not found: ${schemaPath}`);
            }

            // Read schema file
            const schema = fs.readFileSync(schemaPath, 'utf8');
            LogEngine.debug('Schema file loaded', { 
                path: schemaPath, 
                size: schema.length 
            });

            // Execute schema
            await this.query(schema);
            LogEngine.info('Database schema created successfully');

        } catch (error) {
            LogEngine.error('Failed to initialize database schema', {
                error: error.message,
                stack: error.stack
            });
            throw error;
        }
    }

    /**
     * Close all connections in the pool
     * 
     * @returns {Promise<void>}
     */
    async close() {
        try {
            await this.pool.end();
            LogEngine.info('Database connection pool closed');
        } catch (error) {
            LogEngine.error('Error closing database pool', {
                error: error.message,
                stack: error.stack
            });
            throw error;
        }
    }
}

// Create and export a singleton instance
export const db = new DatabaseConnection();
